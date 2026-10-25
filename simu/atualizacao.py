"""A versão do MaiSim e a atualização automática (o plano: as Releases do GitHub, o SHA-256, os canais).

A versão: o arquivo VERSION da raiz; o jeito de instalação: "windows" (o instalador: o perfil produto, com o Python ao
lado do código), "appimage" (o AppImage do Linux: a variável APPIMAGE, que o runtime dele põe) ou "fonte" (o git clone).

A verificação: as releases do repositório (a API pública do GitHub, sem token; MAISIM_RELEASES_URL troca o endereço — um
arquivo .json, file:// ou http: os testes), na partida e a cada 6 h, com prazo curto; sem rede, fica quieta. Os canais:
"estavel" (o padrão: só as releases que não são prerelease) e "teste" (com as prerelease, as -rc), guardados em
MAISIM_DADOS/atualizacao.json. A comparação é a do semver com o -rc: 0.3.0-rc13 < 0.3.0 < 0.3.1. Só conta uma release
com o arquivo deste jeito de instalação (MaiSim-Setup-<v>.exe, MaiSim-<v>-x86_64.AppImage) e o .sha256 dele.

Atualizar: no Windows, baixa o instalador para o cache, confere o SHA-256 (recusa se não bater) e roda ele em silêncio
(/SILENT: o PrepareToInstall dele desliga o MaiSim; a pasta e a porta ficam), por um cmd solto (fora da árvore do
lançador, que o --parar derruba) que depois abre o MaiSim de novo; no AppImage, baixa para <AppImage>.novo, confere,
marca como executável, troca pelo de agora (rename atômico) e reinicia (--parar e o novo com --abrir); na versão de
programador, nada a baixar: a página mostra o "git pull"."""
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import lingua

RAIZ = Path(__file__).resolve().parents[1]
API = "https://api.github.com/repos/marcelopedroso/maisim/releases"
BAIXAR = "https://github.com/marcelopedroso/maisim/releases/download/"   # de onde vêm os arquivos (fora dos testes)
CANAIS = ("estavel", "teste")
INTERVALO = 6 * 3600
PRAZO = 8                            # s: a consulta das releases (sem rede: desiste rápido)
TETO = 2 << 30                       # bytes: o maior arquivo aceito
WIN = os.name == "nt"


def versao_atual():
    try:
        return (RAIZ / "VERSION").read_text().strip()
    except OSError:
        return "?"


def tipo_instalacao():
    """windows | appimage | fonte (o jeito de atualizar)."""
    ai = os.environ.get("APPIMAGE")
    if ai and Path(ai).is_file():
        return "appimage"
    if WIN and os.environ.get("MAISIM_PERFIL") == "produto" and (RAIZ.parent / "python" / "pythonw.exe").is_file():
        return "windows"
    return "fonte"


def chave(v):
    """A ordem do semver, com o -rc: (maior, menor, correção, sem pre?, partes da pre); None se não é uma versão.
    As partes da pre em ordem natural ("rc13" > "rc2"), e a sem pre depois de todas as pre da mesma versão."""
    m = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?", (v or "").strip())
    if not m:
        return None
    pre = m.group(4)
    partes = tuple((0, int(x), "") if x.isdigit() else (1, 0, x) for x in re.findall(r"\d+|[^\d.]+", pre)) if pre else ()
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)), 0 if pre else 1, partes)


def mais_nova(a, b):
    """a é mais nova que b?"""
    ka, kb = chave(a), chave(b)
    return bool(ka and kb and ka > kb)


def nome_arquivo(tipo, v):
    return {"windows": f"MaiSim-Setup-{v}.exe", "appimage": f"MaiSim-{v}-x86_64.AppImage"}.get(tipo)


def escolhe(releases, canal, atual, tipo):
    """A release mais nova que a atual, no canal, com o arquivo deste jeito de instalação (e o .sha256); None se não há."""
    melhor = None
    for r in releases if isinstance(releases, list) else []:
        if not isinstance(r, dict) or r.get("draft"):
            continue
        v = str(r.get("tag_name") or "").lstrip("v")
        if not chave(v) or not mais_nova(v, atual):
            continue
        if canal != "teste" and (r.get("prerelease") or "-" in v):
            continue
        ativos = {a.get("name"): a for a in r.get("assets") or [] if isinstance(a, dict)}
        nome = nome_arquivo(tipo, v)
        if nome and not (nome in ativos and nome + ".sha256" in ativos):
            continue
        if melhor and not mais_nova(v, melhor["versao"]):
            continue
        melhor = {"versao": v, "notas": str(r.get("body") or ""), "pagina": str(r.get("html_url") or ""),
                  "publicada": str(r.get("published_at") or ""), "pre": bool(r.get("prerelease") or "-" in v)}
        if nome:
            melhor["arquivo"] = {"nome": nome, "url": ativos[nome].get("browser_download_url", ""), "tamanho": ativos[nome].get("size") or 0,
                                 "sha256": ativos[nome + ".sha256"].get("browser_download_url", "")}
    return melhor


def _abre(url, prazo):
    """Um endereço http(s), file:// ou um caminho de arquivo (os testes)."""
    if not re.match(r"^[a-z]+://", url):
        url = Path(url).resolve().as_uri()
    return urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "MaiSim"}), timeout=prazo)


def le_releases(url=None, prazo=PRAZO):
    with _abre(url or os.environ.get("MAISIM_RELEASES_URL") or API, prazo) as r:
        return json.loads(r.read(8 << 20))


def sha_do_texto(txt):
    """O SHA-256 de um .sha256 (o do sha256sum: "<hex>  <arquivo>"); None se não tem."""
    m = re.search(r"\b[0-9a-fA-F]{64}\b", txt or "")
    return m.group(0).lower() if m else None


def baixa(url, destino, sha_url, progresso=None, prazo=30):
    """Baixa url para destino conferindo o SHA-256 do .sha256 (sha_url); não bateu (ou falhou): apaga e levanta ValueError."""
    if not os.environ.get("MAISIM_RELEASES_URL") and not (url.startswith(BAIXAR) and sha_url.startswith(BAIXAR)):
        raise ValueError(lingua.tr("atualiza.origem", url=url))
    with _abre(sha_url, prazo) as r:
        esperado = sha_do_texto(r.read(4096).decode("utf-8", "replace"))
    if not esperado:
        raise ValueError(lingua.tr("atualiza.sem_sha"))
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    h, feito = hashlib.sha256(), 0
    try:
        with _abre(url, prazo) as r, open(destino, "wb") as f:
            total = int(r.headers.get("Content-Length") or 0)
            while True:
                bloco = r.read(1 << 20)
                if not bloco:
                    break
                feito += len(bloco)
                if feito > TETO:
                    raise ValueError(lingua.tr("atualiza.grande"))
                h.update(bloco); f.write(bloco)
                if progresso:
                    progresso(feito, total)
        if h.hexdigest() != esperado:
            raise ValueError(lingua.tr("atualiza.sha_nao_bate", arq=destino.name))
    except BaseException:
        destino.unlink(missing_ok=True)
        raise
    return destino


def troca_appimage(novo, alvo):
    """O AppImage baixado (novo, já conferido) no lugar do de agora: executável e rename atômico (o que roda segue com o
    arquivo antigo aberto até sair)."""
    novo, alvo = Path(novo), Path(alvo)
    novo.chmod(novo.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    os.replace(novo, alvo)


def _ambiente_limpo():
    """O ambiente para o MaiSim novo: sem o que aponta para dentro do AppImage de agora (a pasta montada some ao sair)."""
    d = os.environ.get("APPDIR") or ""
    return {k: v for k, v in os.environ.items() if k not in ("APPIMAGE", "APPDIR", "ARGV0", "OWD") and not (d and d in v)}


class Atualizacao:
    """A situação (versão, canal, release nova) e o atualizar em andamento; a verificação numa thread (start())."""

    def __init__(self, dados, cache, ocupado=None):
        self.arq = Path(dados) / "atualizacao.json"
        self.cache = Path(cache) / "atualizacao"
        self.ocupado = ocupado or (lambda: None)       # → um motivo para não atualizar agora (circuito sem salvar), ou None
        self.trava = threading.Lock()
        self.nova, self.verificado, self.sem_rede, self.aplicando = None, None, False, None
        self.releases = None
        self._acorda = threading.Event()

    def canal(self):
        try:
            c = json.loads(self.arq.read_text()).get("canal")
        except (OSError, ValueError, AttributeError):
            c = None
        return c if c in CANAIS else "estavel"

    def muda_canal(self, c):
        if c not in CANAIS:
            raise ValueError(lingua.tr("atualiza.canal_invalido", canal=c))
        self.arq.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.arq.with_suffix(".tmp")
        tmp.write_text(json.dumps({"canal": c}))
        os.replace(tmp, self.arq)
        with self.trava:                                 # a escolha de novo com as releases já lidas (sem consultar outra vez)
            if self.releases is not None:
                self.nova = escolhe(self.releases, c, versao_atual(), tipo_instalacao())
        return self.estado()

    def verifica(self):
        try:
            rel = le_releases()
        except (OSError, ValueError):                   # sem rede, o GitHub fora, o limite da API: quieto, tenta na próxima
            with self.trava:
                self.sem_rede, self.verificado = True, time.time()
            return self.estado()
        with self.trava:
            self.releases, self.sem_rede, self.verificado = rel, False, time.time()
            self.nova = escolhe(rel, self.canal(), versao_atual(), tipo_instalacao())
        return self.estado()

    def estado(self):
        with self.trava:
            n = dict(self.nova) if self.nova else None
            if n:
                n.pop("arquivo", None)
            return {"versao": versao_atual(), "tipo": tipo_instalacao(), "canal": self.canal(), "verificado": self.verificado,
                    "sem_rede": self.sem_rede, "nova": n, "aplicando": dict(self.aplicando) if self.aplicando else None}

    def _laco(self):
        time.sleep(float(os.environ.get("MAISIM_ATUALIZA_ESPERA", 5)))   # a partida primeiro
        while True:
            self.verifica()
            self._acorda.wait(INTERVALO)
            self._acorda.clear()

    def start(self):
        lingua.thread(self._laco, nome="atualizacao").start()

    def aplica(self):
        """Começa a atualizar (numa thread); a página acompanha pelo estado()["aplicando"]."""
        tipo = tipo_instalacao()
        with self.trava:
            nova, ocupada = self.nova, self.aplicando and self.aplicando.get("fase") not in ("erro",)
        if tipo == "fonte":
            raise ValueError(lingua.tr("atualiza.fonte", versao=nova["versao"] if nova else "?"))
        if not nova or not nova.get("arquivo"):
            raise ValueError(lingua.tr("atualiza.nada"))
        if ocupada:
            raise ValueError(lingua.tr("atualiza.em_andamento"))
        motivo = self.ocupado()
        if motivo:
            raise ValueError(motivo)
        with self.trava:
            self.aplicando = {"fase": "baixando", "versao": nova["versao"], "feito": 0, "total": nova["arquivo"].get("tamanho") or 0}
        lingua.thread(self._aplica, tipo, nova, nome="atualizacao-aplica").start()
        return self.estado()

    def _fase(self, **x):
        with self.trava:
            self.aplicando.update(x)

    def _aplica(self, tipo, nova, reinicia=True):
        a = nova["arquivo"]
        try:
            progresso = lambda f, t: self._fase(feito=f, total=t or a.get("tamanho") or 0)   # noqa: E731
            if tipo == "windows":
                for velho in self.cache.glob("MaiSim-Setup-*.exe"):   # os de antes (o desta vez baixa de novo: confere)
                    velho.unlink(missing_ok=True)
                exe = baixa(a["url"], self.cache / a["nome"], a["sha256"], progresso)
                self._fase(fase="instalando")
                if reinicia:
                    instala_windows(exe)
            else:
                alvo = Path(os.environ["APPIMAGE"])
                novo = baixa(a["url"], alvo.with_name(alvo.name + ".novo"), a["sha256"], progresso)
                troca_appimage(novo, alvo)
                self._fase(fase="reiniciando")
                if reinicia:
                    reinicia_appimage(alvo)
        except Exception as e:                          # a rede caiu, o SHA não bateu, sem permissão na pasta
            self._fase(fase="erro", erro=str(e))


ROTEIRO_WIN = ("@echo off\r\n"                     # só ASCII: os caminhos vêm pelo ambiente (sem problema de acento)
               'start "" /b /wait "%MAISIM_SETUP%" /SILENT /SUPPRESSMSGBOXES /NORESTART\r\n'
               'start "" "%MAISIM_PYW%" "%MAISIM_LANC%" --produto --abrir\r\n')


def instala_windows(exe):
    """O instalador em silêncio e, depois, o MaiSim de novo — por um cmd solto: o primeiro cmd só faz o start /b do segundo
    e sai na hora, e o taskkill /T do --parar (que derruba a árvore do simu) não alcança o segundo (o pai dele já saiu); o
    cmd é o do Windows, fora da pasta do programa (que o instalador esvazia)."""
    roteiro = Path(exe).with_name("atualiza.cmd")
    roteiro.write_bytes(ROTEIRO_WIN.encode("ascii"))
    pyw = Path(sys.executable).with_name("pythonw.exe")
    env = {**os.environ, "MAISIM_SETUP": str(exe), "MAISIM_PYW": str(pyw if pyw.is_file() else sys.executable),
           "MAISIM_LANC": str(RAIZ / "app" / "lancador.py"), "MAISIM_ROTEIRO": str(roteiro)}
    subprocess.Popen('cmd.exe /d /c start "" /b cmd.exe /d /c call "%MAISIM_ROTEIRO%"', env=env, cwd=str(roteiro.parent),
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW)


def reinicia_appimage(alvo):
    """O MaiSim de agora para (--parar, pelo AppImage novo: o mesmo lançador) e o novo abre (--abrir), numa sessão própria
    (o --parar derruba o grupo do simu, não ela). Sem FUSE (--appimage-extract-and-run), o novo também."""
    extrai = ["--appimage-extract-and-run"] if "appimage_extracted" in (os.environ.get("APPDIR") or "") else []
    log = open(Path(os.environ.get("MAISIM_CACHE") or "/tmp") / "logs" / "atualizacao.log", "a")
    subprocess.Popen(["/bin/sh", "-c", 'sleep 1; "$0" "$@" --parar; exec "$0" "$@" --abrir', str(alvo), *extrai],
                     env=_ambiente_limpo(), stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
