#!/usr/bin/env python3
"""Scope web da co-simulação (MVP). Só biblioteca padrão: HTTP + Server-Sent Events.

- Ao vivo: uma rodada do run.py com --scope http://localhost:8765 publica cada passo de controle (POST /publicar,
  em lotes); o servidor guarda a rodada corrente e repassa aos navegadores abertos (GET /eventos, SSE).
- Comparar: lista as rodadas gravadas (scope_*.npz, que o run.py grava ao fim de uma rodada com --scope) e entrega os
  dados de qualquer uma (GET /rodadas, GET /rodada?arq=...), para sobrepor duas no navegador.
Endereços: tudo sob /maisim/scope/ (página, static/, eventos, rodadas, rodada, apagar, publicar), para o maisim-app (MaiSim,
porta 5000) encaminhar /maisim/scope para cá; as rotas antigas na raiz continuam (o run.py publica em /publicar) e
/, /maisim-scope e /maisim/scope redirecionam para /maisim/scope/ (a página usa endereços relativos a ele).
uso (da raiz do projeto): python3 scope/servidor.py [--porta 8765]  →  abrir http://localhost:8765/maisim/scope/"""
import argparse
import json
import os
import struct
import sys
import time
import queue
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "config"))
import ler_config  # noqa: E402
ler_config.aplica()                          # as portas e as pastas (config/padrao.env, o perfil, o .env)

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


def difunde(evento, obj):
    msg = f"event: {evento}\ndata: {json.dumps(obj, separators=(',', ':'))}\n\n".encode()
    with trava:
        for q in list(clientes):
            q.put(msg)


DO_SIMU = ("gecko-maisim", "gecko-pew")         # rodadas do simulador (gecko-pew: as gravadas quando ele se chamava PEW)


def resumo_meta(f):
    """O que a página inicial mostra de uma rodada: o nome dela, o circuito de origem e se é do simulador."""
    try:
        meta = json.loads(str(np.load(f, allow_pickle=False)["meta"]))
    except Exception:
        meta = {}
    return {"nome": str(meta.get("rotulo") or f.parent.name), "modelo": str(meta.get("modelo") or ""), "do_simu": meta.get("planta") in DO_SIMU}


def rotulo_rodada(f):
    """Nome legível de uma rodada gravada: planta · pasta · data e hora."""
    try:
        meta = json.loads(str(np.load(f, allow_pickle=False)["meta"]))
    except Exception:
        meta = {}
    planta = "MaiSim / simu" if meta.get("planta") in DO_SIMU else {"gecko": "Gecko", "python": "planta Python"}.get(meta.get("planta", ""), meta.get("planta", "?"))
    pasta = f.parent.name.replace("2026-10-17_", "").replace("_", " ")
    circuito = ""
    if meta.get("planta") in DO_SIMU:
        pasta = meta.get("rotulo", pasta)
        circuito = Path(str(meta.get("modelo") or "")).stem      # o circuito (Marcelo, 19/10: as rodadas se chamavam todas Teste2)
    intervalo = meta.get("Ts") or meta.get("dt")              # o intervalo entre as amostras guardadas (comparar: ver se casam)
    intv = (f"{intervalo * 1e3:.4g} ms" if intervalo >= 1e-3 else f"{intervalo * 1e6:.4g} µs") if isinstance(intervalo, (int, float)) and intervalo > 0 else ""
    return " · ".join(x for x in (planta, circuito, pasta, time.strftime('%d/%m %H:%M', time.localtime(f.stat().st_mtime)), intv) if x)


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
            if arq.is_file():
                return self._resposta(200, arq.read_bytes(), TIPOS.get(arq.suffix, "application/octet-stream"))
            return self._resposta(404, {"erro": "não achei"})
        if rota == "/rodadas":
            lst = []
            for base in BUSCA:
                for f in (base.rglob("scope_*.npz") if base.is_dir() else []):
                    lst.append({"arq": nome(f), "mtime": f.stat().st_mtime, "tamanho": f.stat().st_size,
                                "rotulo": rotulo_rodada(f), **resumo_meta(f)})
            return self._resposta(200, sorted(lst, key=lambda x: -x["mtime"]))
        if rota in ("/rodada", "/rodada.bin"):
            rel = parse_qs(u.query).get("arq", [""])[0]
            arq = caminho(rel)
            if not permitido(arq) or not arq.name.startswith("scope_") or not arq.is_file():
                return self._resposta(400, {"erro": "arquivo inválido"})
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
            with trava:                          # quem chega no meio recebe o que já veio: a foto e a inscrição juntas (o que
                foto = None                      # chegar depois vai para a fila, na ordem); o JSON sai fora da trava, para
                if vivo["meta"] is not None:     # uma rodada grande não parar o servidor a cada aba que volta
                    foto = (vivo["meta"], {k: list(v) for k, v in vivo["dados"].items()}, vivo["fim"])
                clientes.append(q)
            try:
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
        return self._resposta(404, {"erro": "rota desconhecida"})

    def do_POST(self):
        rota = self._rota()[1]
        if rota == "/apagar":
            return self._apagar()
        if rota != "/publicar":
            return self._resposta(404, {"erro": "rota desconhecida"})
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
        """Apaga gravações do maisim-scope pedidas pela tela: só scope_*.npz dentro de simu/ ou etapas/ (nada mais)."""
        corpo = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        apagados, recusados = [], []
        for rel in corpo.get("arqs", []):
            arq = caminho(rel)
            dentro = permitido(arq)
            if dentro and arq.name.startswith("scope_") and arq.suffix == ".npz" and arq.is_file():
                tam = arq.stat().st_size
                arq.unlink()
                apagados.append({"arq": rel, "tamanho": tam})
            else:
                recusados.append(rel)
        print(f"apagadas pela tela: {[a['arq'] for a in apagados]}; recusadas: {recusados}", flush=True)
        return self._resposta(200, {"apagados": apagados, "recusados": recusados})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=int(os.environ["MAISIM_PORTA_SCOPE"]))
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.porta), Manipulador)
    srv.daemon_threads = True
    print(f"maisim-scope em http://localhost:{a.porta}{PREFIXO}/", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
