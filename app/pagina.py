"""A página do MaiSim sem Node (o que o Vite fazia, só com a biblioteca padrão do Python): serve a página inicial
(app/index.html) e os arquivos de app/public/ (o trilho maisim-nav.js, o idioma, a marca, o manifest) e encaminha, numa
porta só, /maisim/simu → o simulador, /maisim/scope → o scope e /maisim/gecko → a tela do Gecko (noVNC: o websocket passa
também). Cada resposta fecha a conexão (Connection: close), como o Vite fazia: a ponte Windows ↔ WSL às vezes deixa morta
uma conexão guardada para reusar, e o POST seguinte falharia ("Failed to fetch").

Os pacotes (o instalador do Windows, o AppImage) usam esta página; a versão de programador também (o Vite fica opcional:
MAISIM_PAGINA=vite no npm run maisim).

uso: python3 app/pagina.py [--porta 7100]   (as portas de config/: MAISIM_PORTA_PAGINA, _SIMU, _SCOPE, _TELA)"""
import argparse
import mimetypes
import os
import socket
import socketserver
import sys
import threading
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "config"))
import ler_config  # noqa: E402

ler_config.aplica()
PUBLICO, INICIO = AQUI / "public", AQUI / "index.html"
TIPOS = {".js": "text/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".json": "application/json",
         ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2"}
# para onde vai cada caminho: (prefixo, porta, tira o prefixo?)
ROTAS = (("/maisim/simu", "MAISIM_PORTA_SIMU", False), ("/maisim/scope", "MAISIM_PORTA_SCOPE", False),
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
