"""Nomes repetidos entre a folha principal e um subcircuito (patch 0013 do Gecko; instância de teste do perfil config/teste.env).
Marcelo (04/11, URGENTE): depois de pôr um subcircuito da biblioteca (o SM-HB-falha) que tem GATE.1 e GATE.2 dentro, nenhum
GATE de fora girava nem mudava: o Gecko recusava "Name ambiguousness error! The model contains several components with the
name: GATE.2" — o nome sem caminho (o da folha principal, como o MaiSim manda) achava os dois. Com o patch, o nome sem caminho
é o da folha principal; o de dentro continua pelo caminho (SUBCIRCUIT.1#GATE.2). Confere: girar e mudar o de fora (o de dentro
fica), girar e mudar o de dentro pelo caminho (o de fora fica), e renomear o de fora."""
import json, re, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def config(chave, padrao):                               # do perfil de teste (config/teste.env)
    try:
        m = re.search(rf"^{chave}=(\S+)", (RAIZ / "config/teste.env").read_text(), re.M)
        return m.group(1) if m else padrao
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


def el(r, folha, nome):
    for k, f in (r.get("folhas") or {}).items():
        if (folha == "0" and k == "0") or (folha != "0" and f.get("nome") == folha):
            return next((e for e in f.get("elementos", []) if e["nome"] == nome), None)
    return None


def p(nome, par):
    r = api(f"editor/params?nome={nome}")
    return next((x.get("valor") for x in r if x["nome"] == par), None) if isinstance(r, list) else None


try:
    api("editor/novo", {"modo": "descartar"})
    r = api("editor/cmds", {"cmds": [{"op": "CREATE", "args": ["GATE.2", 10, 10, "GATE"]}, {"op": "CREATE", "args": ["SUBCIRCUIT.1", 30, 10, "SUBCIRCUIT"]},
                                     {"op": "CREATE", "args": ["SUBCIRCUIT.1#GATE.2", 10, 10, "GATE"]}]})
    ok("ERRO" not in r and el(r, "0", "GATE.2") and el(r, "SUBCIRCUIT.1", "GATE.2"), f"um GATE.2 na folha principal e outro no SUBCIRCUIT.1 {r.get('erro', '')}")
    # o de fora, pelo nome sem caminho: gira; o de dentro fica
    r = api("editor/cmd", {"op": "ROTATE", "args": ["GATE.2"]})
    fora, dentro = el(r, "0", "GATE.2"), el(r, "SUBCIRCUIT.1", "GATE.2")
    ok("ERRO" not in r and fora and fora["dir"] == 504 and dentro and dentro["dir"] == 503,
       f"girar GATE.2 gira o da folha principal ({fora and fora['dir']}) e não o de dentro ({dentro and dentro['dir']}) {r.get('erro', '')}")
    # o de dentro, pelo caminho: gira; o de fora fica
    r = api("editor/cmd", {"op": "ROTATE", "args": ["SUBCIRCUIT.1#GATE.2"]})
    fora, dentro = el(r, "0", "GATE.2"), el(r, "SUBCIRCUIT.1", "GATE.2")
    ok("ERRO" not in r and fora["dir"] == 504 and dentro["dir"] == 504, f"girar SUBCIRCUIT.1#GATE.2 gira o de dentro ({dentro['dir']}); o de fora fica ({fora['dir']}) {r.get('erro', '')}")
    # renomear o de fora (antes também travava)
    r = api("editor/cmd", {"op": "RENAME", "args": ["GATE.2", "GATE.9"]})
    ok("ERRO" not in r and el(r, "0", "GATE.9") and el(r, "SUBCIRCUIT.1", "GATE.2"), f"renomear o GATE.2 de fora (GATE.9); o de dentro continua GATE.2 {r.get('erro', '')}")
except Exception as ex:
    ok(False, f"o teste caiu: {ex}")
finally:
    api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
