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
marca como executável, troca pelo de agora (rename atômico) e reinicia (--parar e o novo com --abrir).

Na versão de programador (o git clone, aberto pelo lançador), pelo git (MAISIM_ATUALIZA_GIT: o remoto, "origin" no
padrão; vazio, como no perfil de teste, só a dica do "git pull"): busca o main e as tags do remoto; o canal "teste" segue
o main (tudo o que já entrou, antes da release: o VERSION só muda no PR da versão) e o "estavel", a última tag vX.Y.Z; a
novidade é um commit que o daqui não tem (o número da versão pode ser o mesmo: "0.3.5 +2", dois commits depois da v0.3.5).
Atualizar: com o código sem mudanças à mão, vai para o commit novo (o main local avança; um commit solto vai para o
novo), monta o Gecko de novo só se os patches mudaram (o código volta ao de antes se não montar) e reinicia pelo lançador
(--parar e o mesmo modo de antes; a página aberta recarrega sozinha, sem outra janela)."""
import hashlib
import json
import os
import re
import shutil
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
PRAZO_GIT = 60                       # s: o git fetch (sem rede: desiste)
REF = "refs/remotes/maisim-atualiza/main"   # o main do remoto, buscado aqui (sem mexer no origin/main de quem programa)


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


def git_remoto():
    """O remoto do git da versão de programador (MAISIM_ATUALIZA_GIT); "" se não há como atualizar pelo git (o perfil de
    teste, o Windows, sem o git, fora de um clone)."""
    r = (os.environ.get("MAISIM_ATUALIZA_GIT") or "").strip()
    return r if r and not WIN and tipo_instalacao() == "fonte" and (RAIZ / ".git").exists() and shutil.which("git") else ""


def git(*args, prazo=30):
    """Um comando do git na raiz do MaiSim (sem perguntar senha); a saída, ou ValueError com a última linha do erro."""
    try:
        r = subprocess.run(["git", "-C", str(RAIZ), *args], capture_output=True, text=True, timeout=prazo,
                           env={**os.environ, "GIT_TERMINAL_PROMPT": "0", "LC_ALL": "C"})
    except (OSError, subprocess.TimeoutExpired) as e:
        raise ValueError(f"git {args[0]}: {e}") from e
    if r.returncode:
        raise ValueError(f"git {args[0]}: " + ((r.stderr or r.stdout).strip().splitlines() or ["?"])[-1])
    return r.stdout.strip()


def git_contem(a, b):
    """O commit b já contém o a (a é ancestral de b, ou o mesmo)?"""
    return subprocess.run(["git", "-C", str(RAIZ), "merge-base", "--is-ancestor", a, b], capture_output=True).returncode == 0


def git_descricao(ref):
    """"0.3.5" (o commit da tag v0.3.5) ou "0.3.5 +2" (dois commits depois dela); o commit curto sem tag nenhuma."""
    try:
        d = git("describe", "--tags", "--match", "v[0-9]*", "--long", ref)
    except ValueError:
        return git("rev-parse", "--short", ref)
    m = re.fullmatch(r"v(.+)-(\d+)-g[0-9a-f]+", d)
    return d if not m else m.group(1) if m.group(2) == "0" else f"{m.group(1)} +{m.group(2)}"


def git_aqui():
    """O commit de agora: {"commit": curto, "depois": commits depois da tag da versão (0 na própria tag; None sem a tag)}."""
    try:
        c = git("rev-parse", "--short", "HEAD")
    except ValueError:
        return {}
    try:
        n = int(git("rev-list", "--count", f"v{versao_atual()}..HEAD"))
    except ValueError:
        n = None
    return {"commit": c, "depois": n}


def git_alvo(canal):
    """O commit do canal, já buscado: o main do remoto (teste) ou a última tag vX.Y.Z sem -rc (estavel); None se não há."""
    if canal == "teste":
        try:
            return git("rev-parse", "--verify", "-q", REF + "^{commit}")
        except ValueError:
            return None
    tags = [t for t in git("tag", "-l", "v[0-9]*").split() if chave(t) and "-" not in t]
    return git("rev-parse", max(tags, key=chave) + "^{commit}") if tags else None


def git_nova(canal):
    """A novidade do canal (o commit que o daqui não tem), com as notas = os títulos dos commits; None se em dia."""
    alvo = git_alvo(canal)
    if not alvo or git_contem(alvo, "HEAD"):
        return None
    n = int(git("rev-list", "--count", f"HEAD..{alvo}"))
    log = git("log", "--format=- %s", "--max-count=40", f"HEAD..{alvo}")
    v = git_descricao(alvo)
    return {"versao": v, "commits": n, "commit": alvo[:7], "alvo": alvo, "notas": log + ("\n- …" if n > 40 else ""),
            "pagina": f"https://github.com/marcelopedroso/maisim/releases/tag/v{v}" if chave(v) else "", "pre": canal == "teste"}


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
        self.aqui = None                                 # a versão de programador: o commit de agora (git_aqui)
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
        if git_remoto():                                 # a versão de programador: o alvo do outro canal (já buscado)
            try:
                nova = git_nova(c)
            except ValueError:
                nova = None
            with self.trava:
                self.nova = nova
            return self.estado()
        with self.trava:                                 # a escolha de novo com as releases já lidas (sem consultar outra vez)
            if self.releases is not None:
                self.nova = escolhe(self.releases, c, versao_atual(), tipo_instalacao())
        return self.estado()

    def verifica(self):
        if git_remoto():
            return self._verifica_git()
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

    def _verifica_git(self):
        """A versão de programador: busca o main e as tags do remoto e compara pelo commit."""
        try:
            git("fetch", "-q", "--tags", git_remoto(), f"+refs/heads/main:{REF}", prazo=PRAZO_GIT)
            sem_rede = False
        except ValueError:                              # sem rede: compara com o que já foi buscado antes
            sem_rede = True
        try:
            nova = git_nova(self.canal())
        except ValueError:
            nova = None
        with self.trava:
            self.sem_rede, self.verificado, self.nova, self.aqui = sem_rede, time.time(), nova, git_aqui()
        return self.estado()

    def estado(self):
        with self.trava:
            n = dict(self.nova) if self.nova else None
            if n:
                n.pop("arquivo", None); n.pop("alvo", None)
            if self.aqui is None:
                self.aqui = git_aqui() if tipo_instalacao() == "fonte" else {}
            return {"versao": versao_atual(), "tipo": tipo_instalacao(), "canal": self.canal(), "verificado": self.verificado,
                    "sem_rede": self.sem_rede, "nova": n, "aplicando": dict(self.aplicando) if self.aplicando else None,
                    "git": bool(git_remoto()), **self.aqui}

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
        if tipo == "fonte" and git_remoto():
            return self._aplica_git_inicio(nova, ocupada)
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

    def _aplica_git_inicio(self, nova, ocupada):
        """A versão de programador: o que dá para conferir antes (a página vê o erro na hora); o resto numa thread."""
        if not nova or not nova.get("alvo"):
            raise ValueError(lingua.tr("atualiza.nada"))
        if ocupada:
            raise ValueError(lingua.tr("atualiza.em_andamento"))
        motivo = self.ocupado()
        if motivo:
            raise ValueError(motivo)
        alvo = nova["alvo"]
        if git("status", "--porcelain", "--untracked-files=no"):
            raise ValueError(lingua.tr("atualiza.git_sujo"))
        ramo = subprocess.run(["git", "-C", str(RAIZ), "symbolic-ref", "-q", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
        if ramo and ramo != "main":
            raise ValueError(lingua.tr("atualiza.git_ramo", ramo=ramo))
        if ramo and not git_contem("HEAD", alvo):
            raise ValueError(lingua.tr("atualiza.git_divergiu"))
        lanc = lancador_no_ar()
        if not lanc:
            raise ValueError(lingua.tr("atualiza.sem_lancador"))
        patches = bool(git("diff", "--name-only", "HEAD", alvo, "--", "gecko/patches", "gecko/construir.sh"))
        gecko = patches or bool(git("diff", "--name-only", "HEAD", alvo, "--", "simu/motor"))
        if gecko and not all(lanc.get("processos", {}).get(k) for k in ("gecko", "motor")):
            raise ValueError(lingua.tr("atualiza.gecko_alheio"))
        with self.trava:
            self.aplicando = {"fase": "atualizando", "versao": nova["versao"], "feito": 0, "total": 0}
        lingua.thread(self._aplica_git, alvo, ramo, bool(lanc.get("abrir")), patches, nome="atualizacao-git").start()
        return self.estado()

    def _aplica_git(self, alvo, ramo, abrir, patches, reinicia=True):
        log = Path(os.environ.get("MAISIM_CACHE") or "/tmp") / "logs" / "atualizacao.log"
        antes = git("rev-parse", "HEAD")
        try:
            with open(log, "a") as f:
                f.write(f"\n{time.strftime('%F %T')} atualizar pelo git: {antes} → {alvo}\n")
            if ramo:
                git("merge", "-q", "--ff-only", alvo)
            else:
                git("checkout", "-q", "--detach", alvo)
            try:
                if patches:                                 # minutos (o mvn); sem patch novo, o construir.sh só confere
                    self._fase(fase="construindo")
                with open(log, "a") as f:
                    r = subprocess.run(["bash", str(RAIZ / "gecko" / "construir.sh")], stdout=f, stderr=subprocess.STDOUT,
                                       stdin=subprocess.DEVNULL, timeout=3600)
                if r.returncode:
                    raise ValueError(lingua.tr("atualiza.gecko_falhou", log=str(log), commit=antes[:7]))
                self._confere_livre()
            except BaseException:                           # o código volta ao de antes (o MaiSim segue como estava)
                if ramo:
                    git("reset", "-q", "--keep", antes)
                else:
                    git("checkout", "-q", "--detach", antes)
                raise
            self._fase(fase="reiniciando")
            if reinicia:
                reinicia_fonte(abrir, log)
        except Exception as e:
            self._fase(fase="erro", erro=str(e))

    def _confere_livre(self):
        """Antes de instalar ou trocar: o MaiSim ainda livre (sem rodada, sem circuito sem salvar)? Senão, não instala."""
        motivo = self.ocupado()
        if motivo:
            raise ValueError(motivo)

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
                self._confere_livre()                   # de novo: durante o download pode ter começado uma rodada ou uma edição
                self._fase(fase="instalando")
                if reinicia:
                    instala_windows(exe)
            else:
                alvo = Path(os.environ["APPIMAGE"])
                novo = baixa(a["url"], alvo.with_name(alvo.name + ".novo"), a["sha256"], progresso)
                try:
                    self._confere_livre()
                except ValueError:
                    novo.unlink(missing_ok=True)
                    raise
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


def lancador_no_ar():
    """O lancador.json do lançador que abriu este MaiSim, se ele está no ar; None se não (o MaiSim subido à mão)."""
    try:
        e = json.loads((Path(os.environ["MAISIM_CACHE"]) / "lancador.json").read_text())
        pid = int(e.get("lancador") or 0)
    except (KeyError, OSError, ValueError, TypeError):
        return None
    try:
        os.kill(pid, 0)
    except OSError:
        return None
    return e if pid else None


def reinicia_fonte(abrir, log):
    """A versão de programador: o lançador para (--parar: o que ele subiu, o Gecko também) e sobe de novo, do código novo,
    no mesmo modo (--abrir: fechar a janela desliga); numa sessão própria (o --parar derruba o simu, não ela). Sem abrir
    outra janela: a página aberta recarrega sozinha (MAISIM_NAVEGADOR=nenhum)."""
    lanc = str(RAIZ / "app" / "lancador.py")
    env = {**os.environ, **({"MAISIM_NAVEGADOR": "nenhum"} if abrir else {})}
    subprocess.Popen(["/bin/sh", "-c", 'sleep 1; "$0" "$1" --parar; exec "$0" "$@"', sys.executable, lanc, *(["--abrir"] if abrir else [])],
                     cwd=str(RAIZ), env=env, stdin=subprocess.DEVNULL, stdout=open(log, "a"), stderr=subprocess.STDOUT, start_new_session=True)


def reinicia_appimage(alvo):
    """O MaiSim de agora para (--parar, pelo AppImage novo: o mesmo lançador) e o novo abre (--abrir), numa sessão própria
    (o --parar derruba o grupo do simu, não ela). Sem FUSE (--appimage-extract-and-run), o novo também."""
    extrai = ["--appimage-extract-and-run"] if "appimage_extracted" in (os.environ.get("APPDIR") or "") else []
    log = open(Path(os.environ.get("MAISIM_CACHE") or "/tmp") / "logs" / "atualizacao.log", "a")
    subprocess.Popen(["/bin/sh", "-c", 'sleep 1; "$0" "$@" --parar; exec "$0" "$@" --abrir', str(alvo), *extrai],
                     env=_ambiente_limpo(), stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
