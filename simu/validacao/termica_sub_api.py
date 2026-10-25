"""A rede térmica atravessa um subcircuito (instância de teste): o terminal térmico de dentro (THERM_TERMINAL) encosta na borda
como o de circuito, vira um borne térmico do bloco SUBCIRCUIT e liga por fio de fora. A prova: dentro, uma fonte de calor de
P = 7 W entre o terminal e o TREF de dentro; fora, um Rth de 2 K/W do borne até o TREF de fora e um TEMP no nó do borne:
|T| = P·Rth = 14 K."""
import json, os, re, shutil, time, urllib.request
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


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


cmd = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
bloco = lambda j: next(e for e in j["folhas"]["0"]["elementos"] if e["tipo"] == "SUBCIRCUIT")
arq = None
try:
    api("editor/novo", {"modo": "descartar"})
    cmd("CREATE", "SUBCIRCUIT.1", 20, 10, "SUBCIRCUIT")
    j = cmd("CREATE", "SUBCIRCUIT.1#THERM_TERMINAL.1", 5, 12, "THERM_TERMINAL")
    b = bloco(j)
    t_in = next(e for e in j["folhas"][b["uid"]]["elementos"] if e["nome"] == "THERM_TERMINAL.1")
    ok(t_in["tipo"] == "TERM" and (t_in["x"], t_in["y"]) == (1, 12) and len(t_in["terminais"]) == 1 and (j.get("terminal") or {}).get("ok"),
       f"o terminal térmico encosta na borda esquerda, (5, 12) → ({t_in['x']}, {t_in['y']}), com pino: {t_in['terminais']}")
    bor = [t for t in b["terminais"] if t.get("interno") == "THERM_TERMINAL.1"]
    ok(len(bor) == 1 and bor[0]["dom"] == "THERM" and bor[0]["lado"] == "e", f"o bloco ganha o borne térmico: {bor}")
    for op, a in (("CREATE", ["SUBCIRCUIT.1#HEAT-SOURCE.1", 25, 20, "HEAT-SOURCE"]), ("CREATE", ["SUBCIRCUIT.1#TREF.1", 25, 30, "TREF"]),
                  ("INNODE", ["SUBCIRCUIT.1#THERM_TERMINAL.1", 0, "q"]), ("INNODE", ["SUBCIRCUIT.1#HEAT-SOURCE.1", 0, "q"]),
                  ("OUTNODE", ["SUBCIRCUIT.1#HEAT-SOURCE.1", 0, "z_in"]), ("INNODE", ["SUBCIRCUIT.1#TREF.1", 0, "z_in"]),
                  ("CREATE", ["Rth.1", 10, 20, "Rth"]), ("SETP", ["Rth.1", "Rth", 2.0]), ("CREATE", ["TREF.2", 10, 30, "TREF"]),
                  ("OUTNODE", ["Rth.1", 0, "z"]), ("INNODE", ["TREF.2", 0, "z"]), ("CREATE", ["TEMP.1", 40, 30, "TEMP"])):
        r = cmd(op, *a)
        if "ERRO" in r:
            ok(False, f"{op} {a}: {r.get('erro')}")
    r = cmd("SETP", "SUBCIRCUIT.1#HEAT-SOURCE.1", "Pv", 7.0)       # o dcValue (o nome curto no Gecko: Pv)
    fonte = next(e for e in r.get("folhas", {}).get(b["uid"], {"elementos": []})["elementos"] if e["nome"] == "HEAT-SOURCE.1") if "ERRO" not in r else {"par": {}}
    ok("ERRO" not in r and fonte["par"].get("dcValue") == 7.0, f"a fonte de calor: 7 W ({r.get('erro')})")
    j = api("editor/estado")
    (bx, by), = [(t["x"], t["y"]) for t in bloco(j)["terminais"] if t.get("interno") == "THERM_TERMINAL.1"]
    rth = next(e for e in j["folhas"]["0"]["elementos"] if e["nome"] == "Rth.1")
    ax, ay = min(((t["x"], t["y"]) for t in rth["terminais"]), key=lambda q: q[1])     # o de cima
    f = api("editor/fio", {"acao": "novo", "dom": "THERM", "cantos": [[ax, ay], [ax, by], [bx, by]], "rotulo": "x"})
    ok("ERRO" not in f, f"o fio térmico de fora até o borne ({f.get('erro')})")
    m = api("editor/mede", {"nome": "TEMP.1", "tipo": "T", "no1": "x", "no2": "z"})
    ok("ERRO" not in m, f"o TEMP de fora mede x − z ({m.get('erro')})")
    j = api("editor/estado")
    ok(not j["encaixe"]["soltas"], f"sem pontas soltas: {j['encaixe']}")
    r = api("editor/rodar", {"dt": "1e-06", "tfim": "0.0001", "nome": "termica_sub", "amostras": "100"})
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.3); r = api("editor/rodada")
    ok(r.get("estado") == "fim", f"a rodada: {r.get('estado')} {r.get('erro') or ''}")
    arq = r.get("arquivo")
    z = np.load(arq if os.path.isabs(arq) else RAIZ / arq)
    T = float(np.abs(z[j["canais"]["TEMP.1"]][-1]))
    ok(abs(T - 14.0) <= 1e-6, f"o calor de dentro sai pelo borne: |T(x) − T(z)| = {T:.6f} K = 7 W · 2 K/W")
finally:
    if arq:
        p = Path(arq) if os.path.isabs(arq) else RAIZ / arq
        shutil.rmtree(p.parent, ignore_errors=True)
    api("editor/novo", {"modo": "descartar"})
print(f"\n{'OK' if not falhas else 'FALHA'}: {falhas} falha(s)")
raise SystemExit(1 if falhas else 0)
