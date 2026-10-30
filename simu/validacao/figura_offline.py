"""O motor das figuras para artigo (scope/figura.py, o módulo Figuras), sem servidor, numa rodada pequena gerada aqui (o buck
com o PWM de 20 kHz e uma segunda rodada para comparar):
- cada formato com a assinatura dele: %PDF, <svg, %!PS-Adobe (com o BoundingBox), PNG e TIFF com 600 dpi nos metadados;
- o tamanho do estilo: IEEE 1 coluna = 8,89 cm (3,5 pol) de largura no PDF; 2 por linha e a grade incompleta;
- as fontes embutidas no PDF (TrueType: FontFile2), a STIX e, se o Windows a tem, a Times New Roman;
- o envelope: menos pontos, os mesmos mínimos e máximos; a unidade sugerida (portadora não é W) e o nome em mathtext;
- a comparação com rótulos, as letras embaixo e em cima, os cantos da legenda e o preto e branco geram sem erro;
- os pedidos inválidos: sem sinais, a janela vazia, um formato desconhecido."""
import json, re, struct, sys, tempfile, zlib
from pathlib import Path
import numpy as np
R = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(R / "config"), str(R / "scope")]
import lingua  # noqa: E402
import textos_scope  # noqa: E402,F401
import figura  # noqa: E402
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
try:
    import matplotlib  # noqa: F401
except ImportError:
    ok(False, "sem o matplotlib (pip install matplotlib): as figuras para artigo não funcionam"); sys.exit(1)
T = Path(tempfile.mkdtemp(prefix="maisim-figura-"))
t = np.arange(0, 0.02, 1e-6); car = (t * 20e3) % 1
def grava(nome, kp):
    a = T / f"scope_{nome}.npz"
    np.savez(a, meta=json.dumps({"planta": "gecko", "modelo": "exemplos/exemplo_buck.ipes"}), t=t,
             v_o=24 * (1 - np.exp(-t * 300 * kp)), i_L=10 + (car - 0.5), g=(car < 0.5).astype(float), portadora=car, Tj_IGBT1=25 + 0 * t)
    return str(a)
A, B = grava("a", 1), grava("b", 2)
P = [{"sinais": [{"canal": "v_o", "cor": "#1f77b4"}]}, {"sinais": [{"canal": "i_L"}, {"canal": "g", "traco": "tracejada"}]}]
def gera(**kw):
    return figura.figura({"arq": A, "paineis": P, "t0": 0.010, "t1": 0.0105, "estilo": {"preset": "ieee1"}, **kw})
# os formatos
b, tipo = gera(formato="pdf")
mb = re.search(rb"/MediaBox \[\s*0 0 ([\d.]+) ([\d.]+)\s*\]", b)
ok(b.startswith(b"%PDF") and tipo == "application/pdf" and mb and abs(float(mb.group(1)) - 8.89 / 2.54 * 72) < 0.5,
   f"PDF, IEEE 1 coluna: {float(mb.group(1)) if mb else '?'} pt de largura (3,5 pol = 252 pt)")
ok(b"/FontFile2" in b and b"STIX" in b, "PDF: as fontes TrueType embutidas (FontFile2), a STIX")
b, tipo = gera(formato="svg"); ok(b"<svg" in b[:400] and tipo == "image/svg+xml", "SVG")
b, tipo = gera(formato="eps"); ok(b.startswith(b"%!PS-Adobe") and b"%%BoundingBox" in b, "EPS com o BoundingBox")
def dpi_png(b):
    i = b.find(b"pHYs")
    return round(struct.unpack(">I", b[i + 4:i + 8])[0] * 0.0254) if i > 0 else None
b, tipo = gera(formato="png"); ok(b.startswith(b"\x89PNG") and dpi_png(b) == 600, f"PNG a {dpi_png(b)} dpi")
b, tipo = gera(formato="tiff")
ok(b[:4] in (b"II*\x00", b"MM\x00*") and tipo == "image/tiff", "TIFF")
try:
    from PIL import Image
    import io
    ok(round(Image.open(io.BytesIO(b)).info.get("dpi", (0, 0))[0]) == 600, "TIFF a 600 dpi")
except ImportError:
    pass
b, _ = gera(formato="previa"); ok(b.startswith(b"\x89PNG"), "a prévia em PNG")
# as fontes
fs = figura.fontes()
ok(fs["stix"] and fs["dejavu"], f"as fontes sempre disponíveis: {fs}")
if fs.get("times"):
    b, _ = gera(formato="pdf", estilo={"preset": "ieee1", "fonte": "times"})
    ok(b"TimesNewRoman" in b, "a Times New Roman (do Windows) embutida no PDF")
b, _ = gera(formato="pdf", estilo={"preset": "ieee1", "fonte": "inexistente"}); ok(b.startswith(b"%PDF"), "uma fonte desconhecida: a padrão")
# o envelope e os nomes
y = np.sin(np.linspace(0, 200 * np.pi, 100000)) + np.random.default_rng(1).normal(0, .01, 100000)
tt, yy = figura.envelope(np.arange(y.size, dtype=float), y)
ok(len(yy) <= figura.MAX_PONTOS + 50 and yy.max() == y.max() and yy.min() == y.min() and np.all(np.diff(tt) >= 0),
   f"o envelope: {y.size} → {len(yy)} pontos, os mesmos mínimo e máximo, em ordem")
ok([figura.unidade(c) for c in ("v_o", "i_L", "portadora", "Pv_IGBT1", "Tj_IGBT1", "d", "theta", "n_ref")] == ["V", "A", "", "W", "°C", "", "rad", "rpm"],
   "as unidades sugeridas (portadora e d sem unidade; P maiúsculo é W)")
ok(figura.nome_mat("v_o") == r"$v_{\mathrm{o}}$" and figura.nome_mat("theta") == r"$\theta$" and figura.nome_mat("Tj_IGBT1") == r"$\mathrm{Tj}_{\mathrm{IGBT1}}$",
   f"os nomes em mathtext: {figura.nome_mat('v_o')}, {figura.nome_mat('theta')}, {figura.nome_mat('Tj_IGBT1')}")
# o resto das opções gera sem erro
casos = {"2 por linha, a grade incompleta": dict(paineis=P + [{"sinais": [{"canal": "portadora"}]}], estilo={"preset": "ieee2", "colunas": 2}),
         "a comparação com rótulos": dict(rotuloA="Kp = 1", comparar=[{"arq": B, "rotulo": "Kp = 2"}, {"arq": B}]),
         "as letras embaixo": dict(estilo={"preset": "ieee1", "letras": "embaixo"}), "as letras em cima": dict(estilo={"preset": "ieee1", "letras": "em_cima"}),
         "a legenda num canto e acima": dict(estilo={"preset": "tese", "legenda": "ie"}), "a legenda acima": dict(estilo={"preset": "slides", "legenda": "acima"}),
         "preto e branco": dict(estilo={"preset": "mdpi1", "pb": True}), "os ajustes de antes (melhor, letras=True, serif)": dict(estilo={"preset": "ieee1", "legenda": "melhor", "letras": True, "fonte": "serif"})}
for nome, kw in casos.items():
    try:
        b, _ = gera(formato="previa", **kw); ok(b.startswith(b"\x89PNG"), nome)
    except Exception as e:                               # noqa: BLE001
        ok(False, f"{nome}: {type(e).__name__}: {e}")
# os pedidos inválidos
for nome, kw in (("sem sinais", dict(paineis=[{"sinais": []}])), ("a janela vazia", dict(t0=0.01, t1=0.009)), ("um formato desconhecido", dict(formato="doc"))):
    try:
        gera(**{"formato": "pdf", **kw}); ok(False, f"{nome}: devia recusar")
    except figura.ErroFigura as e:
        ok(True, f"{nome}: recusado ({e})")
for f in T.iterdir():
    f.unlink()
T.rmdir()
sys.exit(1 if falhas else 0)
