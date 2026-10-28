"""Os ícones da janela do MaiSim em toda página que abre numa janela (Marcelo, 28/10: "o ícone do PWA voltou a ficar com
baixa resolução"; o #106 tinha posto os PNGs na página inicial, no simu e no scope, mas a janela nasce na "Abrindo o
MaiSim…", que só tinha o .ico): o favicon.ico com vários tamanhos e os PNGs de 32 a 192 px em cada página, e os arquivos
deles no app/public; o manifest com o ícone de 192 e o de 512 (o app instalado)."""
import json, re, sys
from pathlib import Path
R = Path(__file__).resolve().parents[2]
PUB = R / "app" / "public"
PAGINAS = ["app/index.html", "app/public/abrindo.html", "simu/static/index.html", "simu/static/guia.html", "scope/static/index.html", "gecko/index.html"]
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
for pag in PAGINAS:
    s = (R / pag).read_text()
    hrefs = re.findall(r'<link rel="icon"[^>]*href="([^"?]+)', s)
    faltam = [h for h in ("/favicon.ico", "/marca/maisim-app-32.png", "/marca/maisim-app-48.png", "/marca/maisim-app-64.png", "/marca/maisim-app-192.png") if h not in hrefs]
    ok(not faltam and hrefs[0] == "/favicon.ico", f"{pag}: o .ico primeiro e os PNGs de 32 a 192 px ({'faltam ' + ', '.join(faltam) if faltam else len(hrefs)} ícones)")
for arq in ("favicon.ico", "marca/maisim-app-32.png", "marca/maisim-app-48.png", "marca/maisim-app-64.png", "marca/maisim-app-192.png", "marca/maisim-app-512.png"):
    ok((PUB / arq).is_file() and (PUB / arq).stat().st_size > 500, f"app/public/{arq} existe")
ico = (PUB / "favicon.ico").read_bytes()
n = int.from_bytes(ico[4:6], "little")
tams = sorted({(ico[6 + 16 * k] or 256) for k in range(n)})
ok(256 in tams and 16 in tams, f"o favicon.ico com vários tamanhos: {tams}")
m = json.loads((PUB / "manifest.webmanifest").read_text())
ok({"192x192", "512x512"} <= {i.get("sizes") for i in m.get("icons", [])}, "o manifest com os ícones de 192 e 512 (o app instalado)")
sys.exit(1 if falhas else 0)
