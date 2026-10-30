"""A página do MaiSim sem Node (o que o Vite fazia, só com a biblioteca padrão do Python): serve a página inicial
(app/index.html) e os arquivos de app/public/ (o trilho maisim-nav.js, o idioma, a marca, o manifest) e encaminha, numa
porta só, /maisim/simu → o simulador, /maisim/scope → o scope e /maisim/gecko → a tela do Gecko (noVNC: o websocket passa
também). Cada resposta fecha a conexão (Connection: close), como o Vite fazia: a ponte Windows ↔ WSL às vezes deixa morta
uma conexão guardada para reusar, e o POST seguinte falharia ("Failed to fetch").

O sinal de vida das páginas (/maisim/vivo): cada página do MaiSim (o maisim-nav.js) dá sinal a cada 15 s e avisa ao fechar;
o lançador do "só usar" (app/lancador.py --abrir) pergunta em /maisim/vivo/ultimo e, sem nenhuma página aberta, desliga o MaiSim.

Os pacotes (o instalador do Windows, o AppImage) usam esta página; a versão de programador também (o Vite fica opcional:
MAISIM_PAGINA=vite no npm run maisim).

uso: python3 app/pagina.py [--porta 7100]   (as portas de config/: MAISIM_PORTA_PAGINA, _SIMU, _SCOPE, _TELA)"""
import argparse
import json
import mimetypes
import os
import socket
import socketserver
import sys
import threading
import time
from urllib.parse import parse_qs
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "config"))
import ler_config  # noqa: E402

ler_config.aplica()
PUBLICO, INICIO = AQUI / "public", AQUI / "index.html"
TIPOS = {".js": "text/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".json": "application/json",
         ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2"}
# o sinal de vida das páginas: id da página → (hora do último sinal, situação); "ultimo" (o último sinal de qualquer uma) e
# "fechou" (o último aviso de que uma fechou). Uma página conta como aberta até PRAZO[situação] sem sinal: à vista, 45 s (o
# sinal vem a cada 15 s); escondida (janela minimizada, outra aba), o Chrome espaça os relógios para 1 por minuto: 3 min;
# congelada (o Chrome a pôs para dormir: sem relógio nenhum), 24 h — ela não diz nada até voltar ou fechar
# "vigia": a última pergunta do lançador (--abrir); a resposta do sinal diz à página se fechar desliga o MaiSim
VIVAS, VIDA, VIDA_TRAVA = {}, {"ultimo": None, "fechou": None}, threading.Lock()
VIGIA = {"t": 0.0}
# as que já avisaram que fecharam (id → hora): um sinal atrasado delas (o da troca para escondida, que o navegador manda
# junto com o aviso de fechar, às vezes chega depois dele) não as reabre; guardadas 10 min
FECHADAS = {}
PRAZO = {"visivel": 45, "oculta": 180, "congelada": 86400}


def sinal_de_vida(q):
    """Um sinal de uma página (?id=…&s=visivel|oculta|congelada) ou o aviso de que fechou (?id=…&fechou=1)."""
    pid = (q.get("id") or [""])[0][:64]
    if not pid:
        return
    agora = time.time()
    with VIDA_TRAVA:
        for f, t in list(FECHADAS.items()):
            if agora - t > 600:
                del FECHADAS[f]
        if q.get("fechou"):
            VIVAS.pop(pid, None)
            FECHADAS[pid] = VIDA["fechou"] = agora
            return
        if pid in FECHADAS:
            return
        s = (q.get("s") or ["visivel"])[0]
        VIVAS[pid] = (agora, s if s in PRAZO else "visivel")
        VIDA["ultimo"] = agora


def vida():
    """Para o lançador: o último sinal, o último fechamento e quantas páginas estão abertas agora (as que passaram do prazo saem)."""
    agora = time.time()
    with VIDA_TRAVA:
        for pid, (t, s) in list(VIVAS.items()):
            if agora - t > PRAZO[s]:
                del VIVAS[pid]
        return {**VIDA, "abas": len(VIVAS)}


# para onde vai cada caminho: (prefixo, porta, tira o prefixo?)
ROTAS = (("/maisim/simu", "MAISIM_PORTA_SIMU", False), ("/maisim/scope", "MAISIM_PORTA_SCOPE", False),
         ("/maisim/figuras", "MAISIM_PORTA_SCOPE", False),          # o módulo Figuras: servido pelo scope (as rodadas são dele)
         ("/maisim/gecko", "MAISIM_PORTA_TELA", True))


def le_cabecalho(s):
    """Lê até o fim do cabeçalho HTTP; devolve (cabeçalho, o que já veio do corpo) ou (None, b"") se a conexão fechou."""
    dados = b""
    while b"\r\n\r\n" not in dados:
        x = s.recv(65536)
        if not x:
            return None, b""
        dados += x
        if len(dados) > 1 << 20:
            return None, b""
    cab, resto = dados.split(b"\r\n\r\n", 1)
    return cab.decode("latin-1"), resto


def cabecalho_fecha(de, para):
    """A resposta de um módulo (fora do websocket): o cabeçalho com "Connection: close" — a página fecha a conexão depois
    de cada resposta, e o navegador precisa saber disso para não tentar reusá-la (uma conexão morta); o resto vem no tubo."""
    buf = b""
    try:
        while b"\r\n\r\n" not in buf and len(buf) < 65536:
            x = de.recv(65536)
            if not x:
                break
            buf += x
    except OSError:
        pass
    cab, sep, resto = buf.partition(b"\r\n\r\n")
    if sep:
        linhas = [l for l in cab.split(b"\r\n") if not l.lower().startswith(b"connection:")]
        buf = b"\r\n".join(linhas + [b"Connection: close"]) + sep + resto
    try:
        para.sendall(buf)
    except OSError:
        pass


def tubo(de, para):
    """Copia de um socket para o outro até um fechar (o corpo, a resposta, o websocket)."""
    try:
        while True:
            x = de.recv(65536)
            if not x:
                break
            para.sendall(x)
    except OSError:
        pass
    finally:
        try:
            para.shutdown(socket.SHUT_WR)
        except OSError:
            pass


class Pagina(socketserver.BaseRequestHandler):
    def handle(self):
        cab, resto = le_cabecalho(self.request)
        if not cab:
            return
        linhas = cab.split("\r\n")
        try:
            metodo, alvo, versao = linhas[0].split(" ", 2)
        except ValueError:
            return
        caminho = alvo.split("?", 1)[0]
        if caminho == "/maisim/vivo":                     # o sinal de vida (GET) ou o aviso de fechar (sendBeacon: POST)
            sinal_de_vida(parse_qs(alvo.partition("?")[2]))
            return self.resposta(200, json.dumps({"vigiada": time.time() - VIGIA["t"] < 15}).encode(), "application/json")
        if caminho == "/maisim/pronto":                   # a página "Abrindo o MaiSim…": o lançador já subiu o Gecko e o motor?
            try:
                pronto = bool(json.loads((Path(os.environ["MAISIM_CACHE"]) / "lancador.json").read_text()).get("pronto", True))
            except (KeyError, OSError, ValueError):
                pronto = True                             # sem lançador (a versão de programador): nada a esperar
            return self.resposta(200, json.dumps({"pronto": pronto}).encode(), "application/json")
        if caminho == "/maisim/vivo/ultimo":
            VIGIA["t"] = time.time()
            return self.resposta(200, json.dumps(vida()).encode(), "application/json")
        for prefixo, porta, tira in ROTAS:
            if caminho == prefixo or caminho.startswith(prefixo + "/"):
                return self.encaminha(metodo, alvo, versao, linhas[1:], resto, int(os.environ[porta]), prefixo if tira else "")
        self.arquivo(metodo, caminho)

    def encaminha(self, metodo, alvo, versao, cabs, resto, porta, tira):
        """Manda o pedido ao servidor do módulo (Host do destino, Connection: close; um websocket fica como está) e
        devolve o que vier, nos dois sentidos, até fechar."""
        if tira:
            alvo = alvo[len(tira):] or "/"
        upgrade = any(c.lower().startswith("upgrade:") for c in cabs)
        novos = [f"{metodo} {alvo} {versao}"]
        for c in cabs:
            k = c.split(":", 1)[0].strip().lower()
            if k == "host":
                novos.append(f"Host: localhost:{porta}")
            elif k == "connection" and not upgrade:
                continue
            else:
                novos.append(c)
        if not upgrade:
            novos.append("Connection: close")
        try:
            dest = socket.create_connection(("127.0.0.1", porta), timeout=10)
        except OSError:
            en = any(c.lower().startswith("cookie:") and "maisim-lingua=en" in c for c in cabs)   # o idioma da página
            return self.resposta(502, (f"MaiSim: the module on port {porta} is not running" if en else
                                       f"MaiSim: o módulo da porta {porta} não está no ar").encode(), "text/plain; charset=utf-8")
        dest.settimeout(None)
        self.request.settimeout(None)
        try:
            dest.sendall(("\r\n".join(novos) + "\r\n\r\n").encode("latin-1") + resto)
            ida = threading.Thread(target=tubo, args=(self.request, dest), daemon=True)
            ida.start()
            if not upgrade:
                cabecalho_fecha(dest, self.request)
            tubo(dest, self.request)
            ida.join(timeout=1)
        finally:
            dest.close()

    def arquivo(self, metodo, caminho):
        if metodo not in ("GET", "HEAD"):
            return self.resposta(405, b"", "text/plain")
        if caminho in ("/", "/index.html"):
            f = INICIO
        else:
            f = (PUBLICO / caminho.lstrip("/")).resolve()
            if PUBLICO.resolve() not in f.parents or not f.is_file():
                return self.resposta(404, b"404", "text/plain")
        corpo = f.read_bytes()
        tipo = TIPOS.get(f.suffix) or mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        self.resposta(200, b"" if metodo == "HEAD" else corpo, tipo, len(corpo))

    def resposta(self, codigo, corpo, tipo, tamanho=None):
        motivo = {200: "OK", 404: "Not Found", 405: "Method Not Allowed", 502: "Bad Gateway"}.get(codigo, "")
        cab = (f"HTTP/1.1 {codigo} {motivo}\r\nContent-Type: {tipo}\r\nContent-Length: {len(corpo) if tamanho is None else tamanho}\r\n"
               f"Cache-Control: no-cache\r\nConnection: close\r\n\r\n")
        try:
            self.request.sendall(cab.encode("latin-1") + corpo)
        except OSError:
            pass


class Servidor(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    ap = argparse.ArgumentParser(description="A página do MaiSim (sem Node).")
    ap.add_argument("--porta", type=int, default=int(os.environ["MAISIM_PORTA_PAGINA"]))
    a = ap.parse_args()
    with Servidor(("127.0.0.1", a.porta), Pagina) as s:
        print(f"maisim-pagina em http://localhost:{a.porta}/", flush=True)   # i18n-ok (log; o maisim.sh confere a porta)
        s.serve_forever()


if __name__ == "__main__":
    main()
