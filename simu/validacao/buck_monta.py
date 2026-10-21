"""Monta o buck do exemplo de PWM no servidor de teste (8768): Vdc → S.1 → sw → L.1 → o → R.1 → gnd; D.1 de roda livre
(gnd → sw); CONST.1 ("g") → GATE.1 → S.1; VOLT v_sw (sw − gnd), VOLT v_o (o − gnd), AMP i_L (L.1)."""
import json, urllib.request, gzip, sys
B = "http://localhost:8768/pew/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": json.loads(e.read())}
c = lambda op, args: (lambda r: (print("ERRO", op, args, r["ERRO"]) if "ERRO" in r else None, r)[1])(api("editor/cmd", {"op": op, "args": args}))
D_IN, D_OUT = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 else ("gnd", "sw")
api("editor/novo", {"descartar": True})
for a in (["U.1", 6, 12, "U"], ["S.1", 14, 6, "S"], ["D.1", 20, 12, "D"], ["L.1", 26, 6, "L"], ["R.1", 32, 12, "R"],
          ["CONST.1", 8, 20, "CONST"], ["GATE.1", 16, 20, "GATE"], ["VOLT.1", 40, 8, "VOLT"], ["VOLT.2", 40, 12, "VOLT"], ["AMP.1", 40, 16, "AMP"]):
    c("CREATE", a)
for nome, i, o in (("U.1", "vin", "gnd"), ("S.1", "vin", "sw"), ("D.1", D_IN, D_OUT), ("L.1", "sw", "o"), ("R.1", "o", "gnd")):
    c("INNODE", [nome, 0, i]); c("OUTNODE", [nome, 0, o])
c("SETP", ["U.1", "uDC", 100.0]); c("SETP", ["L.1", "L", 1e-3]); c("SETP", ["R.1", "R", 2.0])
c("SETP", ["CONST.1", "const", 0.0]); c("OUTNODE", ["CONST.1", 0, "g"]); c("INNODE", ["GATE.1", 0, "g"])
for k, rot in (("VOLT.1", "v_sw"), ("VOLT.2", "v_o"), ("AMP.1", "i_L")): c("OUTNODE", [k, 0, rot])
for corpo in ({"nome": "VOLT.1", "tipo": "V", "no1": "sw", "no2": "gnd"}, {"nome": "VOLT.2", "tipo": "V", "no1": "o", "no2": "gnd"},
              {"nome": "AMP.1", "tipo": "I", "componente": "L.1"}, {"nome": "GATE.1", "tipo": "G", "componente": "S.1"}):
    r = api("editor/mede", corpo); print(corpo["nome"], "ERRO " + str(r["ERRO"]) if "ERRO" in r else "ok")
r = api("editor/estado")
for e in r["folhas"]["0"]["elementos"]:
    if e["tipo"] in ("GATE", "VOLT", "AMP"): print(e["nome"], e["entradas"], e["saidas"], e["mede"])
