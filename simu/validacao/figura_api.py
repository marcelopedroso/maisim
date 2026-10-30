"""As rotas do módulo Figuras (instância de teste: a página 7200 → o scope 7202, que serve o /maisim/figuras), numa
gravação pequena feita aqui (simu/validacao/tmp_figuras, uma das pastas do scope de teste; apagada no fim):
- /maisim/figuras/ (a página) e /maisim/figuras (redireciona); a lista das rodadas com a gravação; os estilos e as fontes;
- /canais: os sinais, a meta e o começo e o fim do tempo; um arquivo fora das pastas: recusado;
- /figura: o PDF (IEEE 1 coluna, 3,5 pol) e a prévia; sem o X-MaiSim, recusado (403); sem sinais, 400 com a mensagem."""
import json, re, shutil, urllib.request
from pathlib import Path
import numpy as np
R = Path(__file__).resolve().parents[2]
B = "http://localhost:7200/maisim/figuras/"
PASTA = Path(__file__).resolve().parent / "tmp_figuras"
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def pede(rota, corpo=None, cab=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", **(cab or {})})
    try:
        r = urllib.request.urlopen(req, timeout=120)
        return r.status, r.headers.get("Content-Type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), e.read()
PASTA.mkdir(exist_ok=True)
t = np.arange(0, 0.01, 1e-6); car = (t * 20e3) % 1
arq = PASTA / "scope_figuras.npz"
np.savez(arq, meta=json.dumps({"planta": "gecko", "modelo": "exemplos/exemplo_buck.ipes"}), t=t, v_o=24 + 0 * t, i_L=10 + car, g=(car < .5) * 1.0)
rel = arq.relative_to(R).as_posix()
try:
    st, tipo, corpo = pede("")
    ok(st == 200 and "text/html" in tipo and b"textos_figuras.js" in corpo, f"a página do Figuras ({st})")
    try:
        r = urllib.request.urlopen(urllib.request.Request("http://localhost:7200/maisim/figuras", method="GET"), timeout=30)
        ok(r.geturl().endswith("/maisim/figuras/"), f"/maisim/figuras redireciona para a página ({r.geturl()})")
    except urllib.error.HTTPError as e:
        ok(False, f"/maisim/figuras: {e.code}")
    lst = json.loads(pede("rodadas")[2])
    ok(any(x["arq"] == rel for x in lst), f"a gravação na lista das rodadas ({len(lst)})")
    est = json.loads(pede("estilos")[2])
    ok({"ieee1", "ieee2", "tese", "slides"} <= set(est.get("estilos", {})) and est["estilos"]["ieee1"]["largura"] == 8.89
       and est.get("fontes", {}).get("stix") is True, f"os estilos e as fontes ({sorted(est.get('fontes', {}))})")
    c = json.loads(pede(f"canais?arq={rel}")[2])
    ok(c.get("canais") == ["v_o", "i_L", "g"] and c.get("t0") == 0 and abs(c.get("t1") - t[-1]) < 1e-12 and c.get("meta", {}).get("planta") == "gecko",
       f"os canais: {c.get('canais')}, de {c.get('t0')} a {c.get('t1')} s")
    st, _, _ = pede("canais?arq=/etc/passwd")
    ok(st == 400, f"um arquivo fora das pastas do scope: recusado ({st})")
    ped = {"arq": rel, "paineis": [{"sinais": [{"canal": "v_o"}]}, {"sinais": [{"canal": "i_L"}, {"canal": "g"}]}], "estilo": {"preset": "ieee1"}, "t0": 0.005, "t1": 0.0052}
    st, tipo, pdf = pede("figura", {**ped, "formato": "pdf"}, {"X-MaiSim": "1"})
    mb = re.search(rb"/MediaBox \[\s*0 0 ([\d.]+)", pdf)
    ok(st == 200 and tipo == "application/pdf" and pdf.startswith(b"%PDF") and mb and abs(float(mb.group(1)) - 252) < 0.5, f"o PDF ({st}, {len(pdf)} bytes, {mb and mb.group(1)} pt)")
    st, tipo, png = pede("figura", {**ped, "formato": "previa"}, {"X-MaiSim": "1"})
    ok(st == 200 and tipo == "image/png" and png.startswith(b"\x89PNG"), f"a prévia ({st}, {len(png)} bytes)")
    st, _, _ = pede("figura", {**ped, "formato": "pdf"})
    ok(st == 403, f"sem o X-MaiSim: recusado ({st})")
    st, _, corpo = pede("figura", {**ped, "paineis": [], "formato": "pdf"}, {"X-MaiSim": "1"})
    ok(st == 400 and "sinal" in json.loads(corpo).get("erro", ""), f"sem sinais: {st} ({json.loads(corpo).get('erro')})")
    st, _, corpo = pede("figura", {**ped, "arq": "/etc/passwd", "formato": "pdf"}, {"X-MaiSim": "1"})
    ok(st == 400, f"uma rodada fora das pastas: recusada ({st})")
finally:
    shutil.rmtree(PASTA, ignore_errors=True)
raise SystemExit(1 if falhas else 0)
