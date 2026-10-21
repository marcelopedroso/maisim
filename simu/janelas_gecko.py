"""As janelas de erro do Gecko do MaiSim, na tela escondida dele (MAISIM_TELA_X, :99).

O Gecko às vezes abre uma janela de erro (JOptionPane, com OK) no meio de um pedido remoto — ao reabrir um arquivo com
componentes fora da folha, por exemplo — e espera o OK. Ninguém vê essa tela: o pedido fica parado, e o MaiSim inteiro
espera por ele (Marcelo, 19/10, ao colar uma perna de MMC abaixo da beira da folha). Aqui: achar essas janelas, guardar
uma foto (para saber o que o Gecko disse) e fechar com OK — sem xdotool, pela libXtst (XTest) e pela libX11.
"""
import ctypes
import os
import re
import struct
import subprocess
import time
import zlib

TITULOS = re.compile(r"^(Error|ERROR|Warning|WARNING|Fehler|Achtung)")   # as de mensagem (só OK) do Gecko
LINHA = re.compile(r'^\s*(0x[0-9a-f]+) "([^"]*)": \([^)]*\)\s+(\d+)x(\d+)[+-]\d+[+-]\d+\s+\+(-?\d+)\+(-?\d+)', re.M)


def _x11():
    x11 = ctypes.CDLL("libX11.so.6")
    x11.XOpenDisplay.restype = ctypes.c_void_p
    x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
    x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
    x11.XFlush.argtypes = [ctypes.c_void_p]
    x11.XDefaultRootWindow.restype = ctypes.c_ulong
    x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
    x11.XGetImage.restype = ctypes.c_void_p
    x11.XGetImage.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint,
                              ctypes.c_ulong, ctypes.c_int]
    x11.XGetPixel.restype = ctypes.c_ulong
    x11.XGetPixel.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
    x11.XDestroyImage = None                      # é macro na Xlib; a imagem pequena fica para o fim do processo
    return x11


def _xwininfo(tela, *args):
    return subprocess.run(["xwininfo", *args], env=dict(os.environ, DISPLAY=tela), capture_output=True, text=True,
                          timeout=5).stdout


def janelas(tela):
    """As janelas de erro visíveis: [(id, título, x, y, largura, altura)] (posição na tela)."""
    achadas = []
    for m in LINHA.finditer(_xwininfo(tela, "-root", "-tree")):
        wid, tit = m.group(1), m.group(2)
        if TITULOS.match(tit) and "IsViewable" in _xwininfo(tela, "-id", wid):
            achadas.append((wid, tit, *(int(v) for v in (m.group(5), m.group(6), m.group(3), m.group(4)))))
    return achadas


def foto(tela, x, y, w, h, arquivo):
    """Um PNG da região (a janela do Gecko, para ler depois o que ele disse)."""
    x11 = _x11()
    d = x11.XOpenDisplay(tela.encode())
    if not d:
        return
    try:
        img = x11.XGetImage(d, x11.XDefaultRootWindow(d), x, y, w, h, 0xFFFFFFFF, 2)
        if not img:
            return
        linhas = bytearray()
        for j in range(h):
            linhas.append(0)
            for i in range(w):
                p = x11.XGetPixel(img, i, j)
                linhas += bytes(((p >> 16) & 255, (p >> 8) & 255, p & 255))
    finally:
        x11.XCloseDisplay(d)

    def bloco(t, dd):
        return struct.pack(">I", len(dd)) + t + dd + struct.pack(">I", zlib.crc32(t + dd) & 0xffffffff)
    with open(arquivo, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + bloco(b"IDAT", zlib.compress(bytes(linhas))) + bloco(b"IEND", b""))


def clica(tela, x, y):
    """Um clique (botão 1) no ponto (x, y) da tela."""
    x11 = _x11()
    xt = ctypes.CDLL("libXtst.so.6")
    xt.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
    xt.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
    d = x11.XOpenDisplay(tela.encode())
    if not d:
        return
    try:
        xt.XTestFakeMotionEvent(d, -1, x, y, 0)
        x11.XFlush(d)
        time.sleep(0.2)
        xt.XTestFakeButtonEvent(d, 1, 1, 0)
        x11.XFlush(d)
        time.sleep(0.1)
        xt.XTestFakeButtonEvent(d, 1, 0, 0)
        x11.XFlush(d)
    finally:
        x11.XCloseDisplay(d)


def fecha(tela, pasta=None, guardar=20):
    """Fecha com OK as janelas de erro do Gecko (o botão fica no meio, embaixo) e guarda a foto de cada uma em pasta (as
    últimas `guardar`). Devolve [(título, foto)]."""
    fechadas = []
    for wid, tit, x, y, w, h in janelas(tela):
        arq = None
        if pasta is not None:
            pasta.mkdir(parents=True, exist_ok=True)
            arq = pasta / f"{time.strftime('%Y%m%d_%H%M%S')}_{wid}.png"
            try:
                foto(tela, x, y, w, h, arq)
            except OSError:
                arq = None
            for velho in sorted(pasta.glob("*.png"))[:-guardar]:
                velho.unlink(missing_ok=True)
        clica(tela, x + w // 2, y + h - 26)
        fechadas.append((tit, arq))
    return fechadas
