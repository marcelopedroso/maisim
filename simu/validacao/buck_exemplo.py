"""Monta o exemplo do buck com PWM no controle.py, com as conexões desenhadas, e salva (pasta pew do servidor 8768)."""
import json, urllib.request, sys
B = "http://localhost:8768/pew/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": json.loads(e.read())}
def ok(r, o):
    if "ERRO" in r: print("ERRO", o, r["ERRO"]); sys.exit(1)
    return r
c = lambda op, args: ok(api("editor/cmd", {"op": op, "args": args}), (op, args))
els = lambda: {e["nome"]: e for e in api("editor/estado")["folhas"]["0"]["elementos"]}
api("editor/novo", {"descartar": True})
# potência: U.1 vertical (+ em cima), S.1 e L.1 deitados, D.1 vertical com o anodo embaixo, R.1 vertical
POT = [("U.1", 4, 10, "U", 503), ("S.1", 10, 6, "S", 502), ("D.1", 14, 10, "D", 501), ("L.1", 18, 6, "L", 502), ("R.1", 22, 10, "R", 503)]
for nome, x, y, tipo, d in POT:
    c("CREATE", [nome, x, y, tipo])
    for _ in range(4):
        if els()[nome]["dir"] == d: break
        c("ROTATE", [nome])
    assert els()[nome]["dir"] == d, (nome, els()[nome]["dir"])
E = els()
for nome, *_ in POT: print(nome, E[nome]["dir"], [(t["x"], t["y"]) for t in E[nome]["terminais"]])
c("SETP", ["U.1", "uDC", 100.0]); c("SETP", ["L.1", "L", 1e-3]); c("SETP", ["R.1", "R", 2.0])
for cantos, rot in (([[4, 8], [4, 6], [8, 6]], "vin"), ([[12, 6], [16, 6]], "sw"), ([[14, 8], [14, 6]], ""), ([[20, 6], [22, 6], [22, 8]], "o"),
                    ([[4, 12], [4, 14], [22, 14], [22, 12]], "gnd"), ([[14, 12], [14, 14]], "")):
    ok(api("editor/fio", {"acao": "novo", "cantos": cantos, "dom": "LK", "rotulo": rot}), cantos)
# controle: CONST.1 (o atuador "g") → GATE.1 → S.1
c("CREATE", ["CONST.1", 6, 20, "CONST"]); c("CREATE", ["GATE.1", 14, 20, "GATE"])
c("SETP", ["CONST.1", "const", 0.0]); c("OUTNODE", ["CONST.1", 0, "g"])
E = els(); a_, b_ = E["CONST.1"]["terminais"][0], E["GATE.1"]["terminais"][0]
print("CONST.1 saída", (a_["x"], a_["y"]), "GATE.1 entrada", (b_["x"], b_["y"]))
if (a_["x"], a_["y"]) != (b_["x"], b_["y"]):
    ok(api("editor/fio", {"acao": "novo", "cantos": [[a_["x"], a_["y"]], [b_["x"], b_["y"]]], "dom": "CONTROL", "rotulo": ""}), "ctl")
ok(api("editor/mede", {"nome": "GATE.1", "tipo": "G", "componente": "S.1"}), "gate")
# medidores (vão para o scope): v_sw = sw − gnd, v_o = o − gnd, i_L = corrente de L.1
for nome, x, y, rot in (("VOLT.1", 30, 6, "v_sw"), ("VOLT.2", 30, 10, "v_o"), ("AMP.1", 30, 14, "i_L")):
    c("CREATE", [nome, x, y, nome.split(".")[0]]); c("OUTNODE", [nome, 0, rot])
for corpo in ({"nome": "VOLT.1", "tipo": "V", "no1": "sw", "no2": "gnd"}, {"nome": "VOLT.2", "tipo": "V", "no1": "o", "no2": "gnd"},
              {"nome": "AMP.1", "tipo": "I", "componente": "L.1"}):
    ok(api("editor/mede", corpo), corpo["nome"])
r = api("editor/estado"); print("encaixe", r["encaixe"])
CODIGO = open("buck_pi.py").read()
PAR = [{"nome": "fsw", "valor": 5000.0, "unidade": "Hz"}, {"nome": "Vdc", "valor": 100.0, "unidade": "V"},
       {"nome": "i_ref", "valor": 10.0, "unidade": "A"}, {"nome": "Kp", "valor": 1.885, "unidade": "V/A"},
       {"nome": "Ki", "valor": 3770.0, "unidade": "V/(A·s)"}, {"nome": "dmax", "valor": 0.95, "unidade": ""}]
cfg = {"ativo": True, "Ts": 2e-6, "atuacoes": ["g"], "parametros": PAR, "codigo": CODIGO, "atraso": {"modo": "logo", "tempo": 0},
       "acionamentos": [{"t": 0.005, "alvo": "p:i_ref", "valor": 15.0}]}
r = ok(api("editor/controle", {"controle": cfg}), "controle"); print("erros/avisos", r["erros"], r["avisos"])
print([(a["nome"], a["destinos"]) for a in r["atuadores"]])
