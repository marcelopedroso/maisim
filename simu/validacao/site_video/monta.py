"""Monta o vídeo do site com os quadros de grava.js: cada trecho (entre duas marcas) numa velocidade; 25 quadros/s; WebM
(VP8, o ffmpeg que vem com o Playwright). Também tira o pôster (o quadro do fim da 1ª rodada).
    python3 simu/validacao/site_video/monta.py ../maisim-website/public/img   (o grava.sh faz tudo)"""
import json, os, subprocess, sys
from PIL import Image

AQUI = os.path.expanduser("~/.cache/maisim_teste/site_video")   # o que grava.js deixou
FF = os.path.expanduser("~/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux")
SAIDA = sys.argv[1]                                      # a pasta site/img
m = json.load(open(os.path.join(AQUI, "marcas.json")))
qs = sorted((float(f.split("_")[1][:-4]), f) for f in os.listdir(os.path.join(AQUI, "quadros")))
def rodada(a, b):
    """Uma rodada ao vivo: o começo (o pico e as oscilações) um pouco mais lento, o meio em tempo real, a cauda estável rápida."""
    d = b - a
    return [(a, a + 0.4 * d, 0.75), (a + 0.4 * d, a + 0.6 * d, 1.0), (a + 0.6 * d, b, 2.5)]


TRECHOS = [  # (de, até, velocidade)
    (m["inicio"] + 0.4, m["play1"], 1.3),
    *rodada(m["play1"], m["fim1"]),
    (m["fim1"], m["visto1"], 1.8),
    (m["visto1"], m["painel"], 1.1), (m["painel"], m["mudou"], 1.5), (m["mudou"], m["play2"], 1.3),
    *rodada(m["play2"], m["fim2"]), (m["fim2"], m["fim"] - 0.8, 1.0)]
FPS = 25


def quadro(t):
    ant = qs[0][1]
    for tt, f in qs:
        if tt > t:
            break
        ant = f
    return ant


seq = []
for de, ate, v in TRECHOS:
    t = de
    while t < ate:
        seq.append(quadro(t))
        t += v / FPS
print(f"{len(seq)} quadros de saída = {len(seq) / FPS:.1f} s")
cmd = [FF, "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", str(FPS), "-i", "pipe:0",
       "-c:v", "libvpx", "-b:v", "2500k", "-crf", "8", "-qmin", "2", "-qmax", "36", "-deadline", "good", "-cpu-used", "1",
       "-auto-alt-ref", "0", "-an", os.path.join(SAIDA, "maisim-buck.webm")]
p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
for f in seq:
    p.stdin.write(open(os.path.join(AQUI, "quadros", f), "rb").read())
p.stdin.close()
p.wait()
Image.open(os.path.join(AQUI, "quadros", quadro(m["visto1"] - 0.3))).convert("RGB").save(
    os.path.join(SAIDA, "maisim-buck.webp"), "WEBP", quality=84, method=6)
print("ok:", p.returncode, os.path.getsize(os.path.join(SAIDA, "maisim-buck.webm")) // 1024, "kB")
