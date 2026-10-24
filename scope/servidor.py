#!/usr/bin/env python3
"""Scope web da co-simulação (MVP). Só biblioteca padrão: HTTP + Server-Sent Events.

- Ao vivo: uma rodada com --scope http://localhost:7102 (MAISIM_PORTA_SCOPE) publica cada passo de controle (POST /publicar,
  em lotes); o servidor guarda a rodada corrente e repassa aos navegadores abertos (GET /eventos, SSE).
- Comparar: lista as rodadas gravadas (scope_*.npz, que o run.py grava ao fim de uma rodada com --scope) e entrega os
  dados de qualquer uma (GET /rodadas, GET /rodada?arq=...), para sobrepor duas no navegador.
Endereços: tudo sob /maisim/scope/ (página, static/, eventos, rodadas, rodada, apagar, publicar), para a página do MaiSim
(MAISIM_PORTA_PAGINA, 7100) encaminhar /maisim/scope para cá; as rotas antigas na raiz continuam (o run.py publica em /publicar) e
/, /maisim-scope e /maisim/scope redirecionam para /maisim/scope/ (a página usa endereços relativos a ele).
uso (da raiz do projeto): python3 scope/servidor.py [--porta 7102]  →  abrir http://localhost:7102/maisim/scope/"""
import argparse
import json
import os
import struct
import sys
import time
import queue
import shutil
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "config"))
import ler_config  # noqa: E402
ler_config.aplica()                          # as portas e as pastas (config/padrao.env, o perfil, o .env)
import lingua  # noqa: E402                    o idioma de cada pedido (português e inglês)
import textos_scope  # noqa: E402,F401         os textos do scope nos dois idiomas (registra o catálogo)

AQUI = Path(__file__).parent
RAIZ = AQUI.parent                          # a raiz do projeto
DADOS = Path(os.environ["MAISIM_DADOS"])     # os dados de quem usa (fora do repositório)
# onde procurar scope_*.npz: as rodadas do simu (MAISIM_RODADAS, a mesma pasta que o simu usa) e, se quiser, outras pastas
# (MAISIM_SCOPE_PASTAS, separadas por ":", ex.: as rodadas de um projeto seu)
BUSCA = [Path(os.environ.get("MAISIM_RODADAS") or DADOS / "rodadas")] + \
        [Path(x).expanduser() for x in os.environ.get("MAISIM_SCOPE_PASTAS", "").split(os.pathsep) if x]


def caminho(rel):
    """O arquivo de uma gravação: relativo à raiz do projeto ou absoluto (as pastas de dados ficam fora dele)."""
    p = Path(rel)
    return (p if p.is_absolute() else RAIZ / p).resolve()


def nome(f):
    try:
        return str(f.relative_to(RAIZ))
    except ValueError:
        return str(f)


def permitido(arq):
    """Uma gravação de uma das pastas do scope (nada fora delas)."""
    return any(b.resolve() in arq.parents for b in BUSCA)
TIPOS = {".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css"}

PREFIXO = "/maisim/scope"
vivo = {"meta": None, "dados": {}, "fim": False, "n": 0}
PARTIDA = time.strftime("%Y%m%d%H%M%S")   # com o número da rodada, identifica cada rodada publicada (mesmo depois de reiniciar)
clientes = []
trava = threading.Lock()
trava_apagar = threading.Lock()                         # um "apagar" por vez (dois cliques seguidos: o 2º espera o 1º)


def difunde(evento, obj):
    msg = f"event: {evento}\ndata: {json.dumps(obj, separators=(',', ':'))}\n\n".encode()
    with trava:
        for q in list(clientes):
            q.put(msg)


DO_SIMU = ("gecko-maisim", "gecko-pew")         # rodadas do simulador (gecko-pew: as gravadas quando ele se chamava PEW)


# o meta de cada gravação e o tamanho da pasta dela, guardados (Marcelo, 22/10: a página inicial demorava ~1 s para listar
# 145 gravações — cada pedido abria todos os .npz e somava todas as pastas): só relê o que mudou (o .npz pelo instante e
# o tamanho; a pasta pelo instante do .npz e da pasta)
_cache_meta, _cache_pasta = {}, {}


def le_meta(f):
    try:
        st = f.stat()
        chave = (str(f), st.st_mtime_ns, st.st_size)
        if chave in _cache_meta:
            return _cache_meta[chave]
        m = json.loads(str(np.load(f, allow_pickle=False)["meta"]))
    except Exception:
        return {}
    _cache_meta[chave] = m
    return m


def resumo_meta(f, meta=None):
    """O que a página inicial mostra de uma rodada: o nome dela, o circuito de origem e se é do simulador."""
    meta = le_meta(f) if meta is None else meta
    return {"nome": str(meta.get("rotulo") or f.parent.name), "modelo": str(meta.get("modelo") or ""), "do_simu": meta.get("planta") in DO_SIMU}


# apagar uma gravação do simu é apagar a pasta da rodada inteira (Marcelo, 22/10: só o .npz saía e as pastas ficavam —
# a cópia do circuito daquela rodada, o controle, o log, as séries): só a pasta de uma rodada do simu, direto em
# MAISIM_RODADAS; o circuito em "meus circuitos" nunca é tocado. Uma rodada guardada (.guardada) só com pedido explícito;
# a que está rodando, nunca
RODADAS_SIMU = BUSCA[0]
GUARDADA = ".guardada"


def pasta_da_rodada(f, meta):
    """A pasta inteira da rodada, se a gravação é de uma rodada do simu (senão None: só o .npz)."""
    try:
        if f.parent.parent.resolve() == RODADAS_SIMU.resolve() and meta.get("planta") in DO_SIMU:
            return f.parent
    except OSError:
        pass
    return None


def tamanho_pasta(d):
    try:
        chave = (str(d), d.stat().st_mtime_ns, max((f.stat().st_mtime_ns for f in d.glob("scope_*.npz")), default=0))
    except OSError:
        return 0
    if chave not in _cache_pasta:
        _cache_pasta[chave] = sum(x.stat().st_size for x in d.rglob("*") if x.is_file())
    return _cache_pasta[chave]


def rodando_agora():
    """A pasta da rodada que o simu está rodando (o .npz só é escrito no fim): ela fica fora de qualquer apagar. None se
    não há; "?" se o simu não respondeu."""
    try:
        url = f"http://localhost:{os.environ['MAISIM_PORTA_SIMU']}/maisim/simu/editor/rodada"
        r = json.loads(urllib.request.urlopen(url, timeout=2).read())
    except Exception:
        return "?"
    if r.get("estado") in ("preparando", "rodando", "pausada"):
        return caminho(r["modelo"]).parent if r.get("modelo") else "?"   # preparando, ainda sem a pasta dita: as recentes ficam
    return None


def pastas_orfas():
    """As pastas de rodada do simu sem gravação (sobras de quando só o .npz era apagado), menos a que está rodando (sem
    resposta do simu, menos as mexidas nos últimos 10 min)."""
    if not RODADAS_SIMU.is_dir():
        return []
    agora, viva = time.time(), rodando_agora()
    out = []
    for d in RODADAS_SIMU.iterdir():
        if not d.is_dir() or d.name.startswith(".") or any(d.glob("scope_*.npz")):
            continue
        if viva == "?" and agora - max([d.stat().st_mtime] + [x.stat().st_mtime for x in d.iterdir()]) < 600:
            continue
        if viva not in (None, "?") and d.resolve() == viva.resolve():
            continue
        out.append(d)
    return out


def rotulo_rodada(f, meta=None):
    """Nome legível de uma rodada gravada: planta · pasta · data e hora."""
    meta = le_meta(f) if meta is None else meta
    planta = "MaiSim / simu" if meta.get("planta") in DO_SIMU else {"gecko": "Gecko", "python": lingua.tr("scope_srv.planta_python")}.get(meta.get("planta", ""), meta.get("planta", "?"))
    pasta = f.parent.name.replace("2026-10-17_", "").replace("_", " ")
    circuito = ""
    if meta.get("planta") in DO_SIMU:
        pasta = meta.get("rotulo", pasta)
        circuito = Path(str(meta.get("modelo") or "")).stem      # o circuito (Marcelo, 19/10: as rodadas se chamavam todas Teste2)
    intervalo = meta.get("Ts") or meta.get("dt")              # o intervalo entre as amostras guardadas (comparar: ver se casam)
    intv = (f"{intervalo * 1e3:.4g} ms" if intervalo >= 1e-3 else f"{intervalo * 1e6:.4g} µs") if isinstance(intervalo, (int, float)) and intervalo > 0 else ""
    lt = time.localtime(f.stat().st_mtime)
    quando = lingua.tr("scope_srv.quando", dia=f"{lt.tm_mday:02d}", mes=f"{lt.tm_mon:02d}", hora=f"{lt.tm_hour:02d}", min=f"{lt.tm_min:02d}")
    return " · ".join(x for x in (planta, circuito, pasta, quando, intv) if x)


def le_npz(caminho):
    d = np.load(caminho, allow_pickle=False)
    meta = json.loads(str(d["meta"])) if "meta" in d.files else {}
    dados = {}
    for k in d.files:
        if k == "meta":
            continue
        v = d[k].astype(float).round(6)
        # amostra que falta vai como null (JSON não tem NaN), igual à publicação ao vivo (publica.py); antes ia como 0,
        # o que punha um zero falso no gráfico e na medição
        dados[k] = [None if x != x else x for x in v.tolist()] if np.isnan(v).any() else v.tolist()
    return {"meta": meta, "dados": dados}


def le_npz_bin(caminho):
    """Gravação em binário para o navegador (GET rodada.bin): b"MAIS", uint32 com o tamanho do cabeçalho JSON, o
    cabeçalho {meta, canais: [{nome, tipo, n, desloc}]}, e os vetores little-endian, cada um alinhado a 8 bytes; desloc
    conta a partir do início dos dados = 8 + cabeçalho arredondado para cima a múltiplo de 8. Valores exatos do .npz
    (float64, sem o arredondamento de 6 casas do JSON; NaN continua NaN). Vetor de inteiros guardado em float (padrão de
    chaveamento) vai como uint32/int32 quando é exato; int64 vira int32/uint32 se cabe, senão float64 (sem BigInt)."""
    d = np.load(caminho, allow_pickle=False)
    meta = json.loads(str(d["meta"])) if "meta" in d.files else {}
    canais, vetores, desloc = [], [], 0
    for k in d.files:
        if k == "meta":
            continue
        v = np.ravel(d[k])
        if v.dtype.kind == "b":
            v = v.astype(np.uint8)
        elif v.size and (v.dtype.kind in "iu" or (v.dtype.kind == "f" and np.all(np.isfinite(v)) and np.all(v == np.round(v)))):
            if v.min() >= 0 and v.max() < 2 ** 32:
                v = v.astype(np.uint32)
            elif v.min() >= -2 ** 31 and v.max() < 2 ** 31:
                v = v.astype(np.int32)
            else:
                v = v.astype(np.float64)
        v = np.ascontiguousarray(v, dtype=v.dtype.newbyteorder("<"))
        tipo = {"f": "f", "i": "i", "u": "u"}[v.dtype.kind] + str(v.dtype.itemsize)
        desloc = (desloc + 7) // 8 * 8
        canais.append({"nome": k, "tipo": tipo, "n": int(v.size), "desloc": desloc})
        vetores.append(v)
        desloc += v.nbytes
    cab = json.dumps({"meta": meta, "canais": canais}, separators=(",", ":")).encode()
    base = (8 + len(cab) + 7) // 8 * 8
    return b"MAIS" + struct.pack("<I", len(cab)) + cab + bytes(base - 8 - len(cab)), canais, vetores, desloc


class Manipulador(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _resposta(self, codigo, corpo, tipo="application/json"):
        corpo = corpo if isinstance(corpo, bytes) else json.dumps(corpo, separators=(",", ":")).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def _rota(self):
        """(url, rota sem o prefixo /maisim/scope): /maisim/scope/eventos e /eventos dão a mesma rota."""
        u = urlparse(self.path)
        return u, (u.path[len(PREFIXO):] if u.path.startswith(PREFIXO + "/") else u.path)

    def do_GET(self):
        lingua.do_pedido(self.headers)
        u, rota = self._rota()
        if u.path in ("/", "/index.html", "/maisim-scope", "/maisim-scope/", PREFIXO):
            self.send_response(302)
            self.send_header("Location", PREFIXO + "/" + (("?" + u.query) if u.query else ""))
            self.end_headers()
            return
        if u.path == PREFIXO + "/":
            return self._resposta(200, (AQUI / "static" / "index.html").read_bytes(), TIPOS[".html"])
        if rota.startswith("/static/"):
            arq = (AQUI / "static" / Path(rota).name)
            if rota == "/static/maisim-i18n.js":       # as traduções: um arquivo só, o da página inicial (app/public)
                arq = RAIZ / "app" / "public" / "maisim-i18n.js"
            if arq.is_file():
                return self._resposta(200, arq.read_bytes(), TIPOS.get(arq.suffix, "application/octet-stream"))
            return self._resposta(404, {"erro": lingua.tr("scope_srv.nao_achei")})
        if rota == "/rodadas":
            lst = []
            for base in BUSCA:
                for f in (base.rglob("scope_*.npz") if base.is_dir() else []):
                    meta, st = le_meta(f), f.stat()
                    d = pasta_da_rodada(f, meta)              # pasta: apagar leva a pasta inteira (e o tamanho é o dela)
                    lst.append({"arq": nome(f), "mtime": st.st_mtime, "tamanho": st.st_size, "rotulo": rotulo_rodada(f, meta),
                                "pasta": bool(d), "pasta_tam": tamanho_pasta(d) if d else st.st_size,
                                "guardada": bool(d and (d / GUARDADA).exists()), **resumo_meta(f, meta)})
            return self._resposta(200, sorted(lst, key=lambda x: -x["mtime"]))
        if rota == "/orfas":                           # as pastas de rodada sem gravação (para apagar junto)
            ps = pastas_orfas()
            return self._resposta(200, {"n": len(ps), "tamanho": sum(tamanho_pasta(d) for d in ps)})
        if rota in ("/rodada", "/rodada.bin"):
            rel = parse_qs(u.query).get("arq", [""])[0]
            arq = caminho(rel)
            if not permitido(arq) or not arq.name.startswith("scope_") or not arq.is_file():
                return self._resposta(400, {"erro": lingua.tr("scope_srv.arquivo_invalido")})
            if rota == "/rodada":                    # JSON (o de antes; a página usa o binário e cai neste se faltar)
                return self._resposta(200, le_npz(arq))
            inicio, canais, vetores, tam = le_npz_bin(arq)
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(inicio) + tam))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(inicio)
            pos = 0
            for c, v in zip(canais, vetores):        # vetor a vetor, sem montar tudo de novo na memória
                self.wfile.write(bytes(c["desloc"] - pos))
                self.wfile.write(memoryview(v).cast("B"))
                pos = c["desloc"] + v.nbytes
            return
        if rota == "/eventos":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            q = queue.Queue()
            so_ativa = parse_qs(u.query).get("ativa") == ["1"]   # ?ativa=1 (o scope aberto pelo trilho): a já terminada não vem
            with trava:                          # quem chega no meio recebe o que já veio: a foto e a inscrição juntas (o que
                foto = None                      # chegar depois vai para a fila, na ordem); o JSON sai fora da trava, para
                if vivo["meta"] is not None and not (so_ativa and vivo["fim"]):   # uma rodada grande não parar o servidor a cada aba que volta
                    foto = (vivo["meta"], {k: list(v) for k, v in vivo["dados"].items()}, vivo["fim"])
                clientes.append(q)
            try:
                self.wfile.write(b": ok\n\n")         # um byte já: a página sabe que conectou (o proxy da página só abre com dados)
                self.wfile.flush()
                if foto is not None:
                    meta, dados, fim = foto
                    self.wfile.write(f"event: inicio\ndata: {json.dumps(meta)}\n\n".encode())
                    self.wfile.write(f"event: dados\ndata: {json.dumps(dados, separators=(',', ':'))}\n\n".encode())
                    if fim:
                        self.wfile.write(b"event: fim\ndata: {}\n\n")
                    self.wfile.flush()
                while True:
                    try:
                        msg = q.get(timeout=15)
                    except queue.Empty:
                        msg = b": ping\n\n"
                    self.wfile.write(msg)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                with trava:
                    if q in clientes:
                        clientes.remove(q)
            return
        return self._resposta(404, {"erro": lingua.tr("scope_srv.rota_desconhecida")})

    def do_POST(self):
        lingua.do_pedido(self.headers)
        rota = self._rota()[1]
        if rota == "/apagar":
            return self._apagar()
        if rota != "/publicar":
            return self._resposta(404, {"erro": lingua.tr("scope_srv.rota_desconhecida")})
        corpo = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        tipo = corpo.get("tipo")
        if tipo == "inicio":
            with trava:                          # a meta não identifica a rodada (repetir a mesma dá meta igual): o número
                vivo["n"] += 1                   # separa, na página, uma rodada nova de uma reconexão na mesma rodada
                meta = dict(corpo["meta"], _rodada_vivo=f"{PARTIDA}-{vivo['n']}")
                vivo.update(meta=meta, dados={}, fim=False)
            difunde("inicio", meta)
        elif tipo == "dados":
            lote = corpo["lote"]
            with trava:
                for k, v in lote.items():
                    vivo["dados"].setdefault(k, []).extend(v)
            difunde("dados", lote)
        elif tipo == "fim":
            with trava:
                vivo["fim"] = True
            difunde("fim", {})
        return self._resposta(200, {"ok": True})

    def _apagar(self):
        """Apaga gravações pedidas pela tela: só scope_*.npz das pastas do scope; de uma rodada do simu, a pasta inteira
        (pasta_da_rodada). Recusa a que está rodando e, sem "guardadas": true, as guardadas. "orfas": true apaga também as
        pastas de rodada sem gravação."""
        corpo = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        with trava_apagar:
            r = self._apaga(corpo)
        return self._resposta(200, r)

    def _apaga(self, corpo):
        apagados, recusados, ja, viva = [], [], [], rodando_agora()
        for rel in corpo.get("arqs", []):
            arq = caminho(rel)
            if permitido(arq) and arq.name.startswith("scope_") and arq.suffix == ".npz" and not arq.exists():
                ja.append(rel)                          # já tinha saído (outro pedido, outra aba): não é erro
                continue
            if not (permitido(arq) and arq.name.startswith("scope_") and arq.suffix == ".npz" and arq.is_file()):
                recusados.append({"arq": rel, "por": lingua.tr("scope_srv.nao_gravacao"), "codigo": "nao_gravacao"})
                continue
            d = pasta_da_rodada(arq, le_meta(arq))
            if d and viva not in (None, "?") and d.resolve() == viva.resolve():
                recusados.append({"arq": rel, "por": lingua.tr("scope_srv.rodando"), "codigo": "rodando"})
                continue
            if d and (d / GUARDADA).exists() and not corpo.get("guardadas"):
                recusados.append({"arq": rel, "por": lingua.tr("scope_srv.guardada"), "codigo": "guardada"})
                continue
            tam = tamanho_pasta(d) if d else arq.stat().st_size
            if d:
                shutil.rmtree(d, onerror=_some_ja_saiu)
            else:
                arq.unlink(missing_ok=True)
            apagados.append({"arq": rel, "tamanho": tam, "pasta": bool(d)})
        orfas = []
        if corpo.get("orfas"):
            for d in pastas_orfas():
                tam = tamanho_pasta(d)
                shutil.rmtree(d, onerror=_some_ja_saiu)
                orfas.append({"pasta": d.name, "tamanho": tam})
        print(f"apagadas pela tela: {len(apagados)} ({sum(a['tamanho'] for a in apagados) / 1e6:.1f} MB) + {len(orfas)} pastas sem gravação;"   # i18n-ok (log)
              f" já tinham saído: {len(ja)}; recusadas: {recusados}", flush=True)
        return {"apagados": apagados, "recusados": recusados, "ja": ja, "orfas": orfas}


def _some_ja_saiu(func, caminho_, info):
    """rmtree: um arquivo que sumiu no meio (outro pedido apagando a mesma pasta) não é erro; o resto é."""
    if not issubclass(info[0], FileNotFoundError):
        raise info[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=int(os.environ["MAISIM_PORTA_SCOPE"]))
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.porta), Manipulador)
    def aquece():                                        # a 1ª lista já rápida: lê os metas em segundo plano ao subir
        for base in BUSCA:
            for f in (base.rglob("scope_*.npz") if base.is_dir() else []):
                d = pasta_da_rodada(f, le_meta(f))
                if d:
                    tamanho_pasta(d)
    lingua.thread(aquece).start()
    srv.daemon_threads = True
    print(f"maisim-scope em http://localhost:{a.porta}{PREFIXO}/", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
