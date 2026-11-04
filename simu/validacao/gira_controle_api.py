"""Girar bloco de controle (patch 0012 do Gecko do MaiSim; instância de teste do perfil config/teste.env). O Gecko original
não gira bloco de controle (RegelBlock.rotiereSymbol() vazio, a orientação forçada para baixo); com o patch, o ROTATE gira e
os bornes (TerminalControl) seguem a orientação, como o ponto_gecko do ipes.py calcula. Confere, ligando por FIO (não por
rótulo, que ligaria de qualquer jeito):
- o GAIN gira pelas 4 orientações (503 → 504 → 501 → 502 → 503) com os bornes onde a conta diz;
- CONST (2) → fio → GAIN (×3) girado em pé: a saída da rodada é 6 (o fio chega ao borne novo, e o Gecko liga ali);
- salvo e reaberto, o GAIN continua girado e a rodada dá 6 de novo."""
import json, os, re, time, urllib.request
from pathlib import Path
import numpy as np

RAIZ = Path(__file__).resolve().parents[2]


def config(chave, padrao):                               # do perfil de teste (config/teste.env)
    try:
        m = re.search(rf"^{chave}=(\S+)", (RAIZ / "config/teste.env").read_text(), re.M)
        return m.group(1).replace("~", str(Path.home()), 1) if m else padrao
    except OSError:
        return padrao


B = f"http://localhost:{config('MAISIM_PORTA_SIMU', '7201')}/maisim/simu/"
CIRC = Path(config("MAISIM_SALVOS", str(Path.home() / ".cache/maisim_teste/circuitos")))
SALVO = CIRC / "gira_controle_api_t.ipes"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def el(r, nome):
    return next((e for e in (r.get("folhas") or {}).get("0", {}).get("elementos", []) if e["nome"] == nome), None)


def bornes(e):
    return [(t["lado"], t["x"] - e["x"], t["y"] - e["y"]) for t in e["terminais"]]


pastas = []
def roda(nome):
    r = api("editor/rodar", {"dt": "1e-5", "tfim": "1e-3", "nome": nome, "amostras": "100"})
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.3); r = api("editor/rodada")
    if r.get("estado") != "fim":
        return {"erro": f"{r.get('estado')}: {r.get('erro')}"}
    p = Path(r["arquivo"]) if os.path.isabs(r["arquivo"]) else RAIZ / r["arquivo"]
    pastas.append(p.parent)
    z = np.load(p)
    return {k: np.asarray(z[k], float) for k in z.files if k != "meta"}


try:
    api("editor/novo", {"modo": "descartar"})
    r = api("editor/cmds", {"cmds": [{"op": "CREATE", "args": ["CONST.1", 4, 10, "CONST"]}, {"op": "SETP", "args": ["CONST.1", "const", 2.0]},
                                     {"op": "CREATE", "args": ["GAIN.1", 14, 10, "GAIN"]}, {"op": "SETP", "args": ["GAIN.1", "r0", 3.0]},
                                     {"op": "OUTNODE", "args": ["GAIN.1", 0, "y_girado"]}]})
    ok("ERRO" not in r, f"CONST e GAIN montados {r.get('erro', '')}")
    # as 4 orientações: os bornes do GAIN (entrada em (−2, 0) e saída em (1, 0) deitado), girados como o ponto_gecko
    esperado = {504: [("e", 0, -2), ("s", 0, 1)], 501: [("e", 2, 0), ("s", -1, 0)], 502: [("e", 0, 2), ("s", 0, -1)], 503: [("e", -2, 0), ("s", 1, 0)]}
    giro = []
    for d in (504, 501, 502, 503):
        r = api("editor/cmd", {"op": "ROTATE", "args": ["GAIN.1"]}); g = el(r, "GAIN.1")
        giro.append((g and g["dir"], g and bornes(g) == esperado[d], d))
    ok(all(dd == d and b for dd, b, d in giro), f"o GAIN gira pelas 4 orientações com os bornes onde a conta diz: {giro}")
    # em pé (504): entrada em cima, saída embaixo; o fio da saída do CONST até a entrada nova
    r = api("editor/cmd", {"op": "ROTATE", "args": ["GAIN.1"]}); g, c = el(r, "GAIN.1"), el(r, "CONST.1")
    gi = next(t for t in g["terminais"] if t["lado"] == "e"); co = next(t for t in c["terminais"] if t["lado"] == "s")
    f = api("editor/fio", {"acao": "novo", "dom": "CONTROL", "cantos": [[co["x"], co["y"]], [co["x"], gi["y"]], [gi["x"], gi["y"]]]})
    ok(g["dir"] == 504 and "ERRO" not in f, f"o GAIN em pé (504, entrada em {gi['x']},{gi['y']}) e o fio da saída do CONST ({co['x']},{co['y']}) até ela {f.get('erro', '')}")
    z = roda("gira_controle")
    y = z.get("y_girado")
    ok(y is not None and abs(y[-1] - 6.0) < 1e-9, f"CONST 2 → fio → GAIN ×3 girado: a saída é {None if y is None else y[-1]} (esperado 6) {z.get('erro', '')}")
    # salvo e reaberto: continua girado e ligado
    s = api("editor/salvar", {"nome": SALVO.stem, "pasta": "circuitos", "sobrescrever": True})
    j = api("editor/abrir", {"arq": str(SALVO), "modo": "descartar"})
    g2 = el(j, "GAIN.1")
    z2 = roda("gira_controle_reaberto")
    y2 = z2.get("y_girado")
    ok("ERRO" not in s and g2 and g2["dir"] == 504 and y2 is not None and abs(y2[-1] - 6.0) < 1e-9,
       f"salvo e reaberto: o GAIN continua em pé ({g2 and g2['dir']}) e a saída continua {None if y2 is None else y2[-1]} {z2.get('erro', '')}")
except Exception as ex:
    ok(False, f"o teste caiu: {ex}")
finally:
    for p in pastas:
        try:
            import shutil; shutil.rmtree(p)
        except OSError:
            pass
    try:
        SALVO.unlink()
    except OSError:
        pass
    api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
