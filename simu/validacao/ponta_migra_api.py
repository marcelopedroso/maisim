# a ponta, a garra e a cor seguem o voltímetro quando o nome no scope muda (instância de teste 8768): renomear o sinal e renomear o subcircuito
# instância de teste (8768): a ponta, a garra e a cor seguem o voltímetro quando o nome no scope muda (o caso do Marcelo:
# um voltímetro dentro do subcircuito; renomear o sinal, e renomear o subcircuito)
import json, urllib.request
B = "http://localhost:8768/pew/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=120).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read())}
cmd = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
api("editor/novo", {"modo": "descartar"})
cmd("CREATE", "SUBCIRCUIT.1", 20, 10, "SUBCIRCUIT")
for a in (["SUBCIRCUIT.1#C.1", 20, 20, "C"], ["SUBCIRCUIT.1#VOLT.1", 30, 10, "VOLT"]):
    cmd("CREATE", *a)
cmd("INNODE", "SUBCIRCUIT.1#C.1", 0, "vc_p"); cmd("OUTNODE", "SUBCIRCUIT.1#C.1", 0, "vc_n")
uid = next(e["uid"] for e in api("editor/estado")["folhas"]["0"]["elementos"] if e["tipo"] == "SUBCIRCUIT")
api("editor/mede", {"nome": "VOLT.1", "tipo": "V", "no1": "vc_p", "no2": "vc_n", "folhas": [uid]})
r = cmd("OUTNODE", "SUBCIRCUIT.1#VOLT.1", 0, "v_vc")
c0 = [k for k in r["pontas"]] + [k for k in (r.get("cores_escolhidas") or {})]
api("editor/ponta", {"canal": "Sub_1_v_vc", "sinal": "+", "componente": "C.1"}); api("editor/ponta", {"canal": "Sub_1_v_vc", "sinal": "-", "componente": "C.1"})
r = api("editor/cor", {"canal": "Sub_1_v_vc", "cor": "#d946ef"})
ok(r["pontas"].get("Sub_1_v_vc") == {"+": "C.1", "-": "C.1"} and r["cores_escolhidas"].get("Sub_1_v_vc") == "#d946ef", f"ponta, garra e cor em Sub_1_v_vc: {r['pontas']}")
r = cmd("OUTNODE", "SUBCIRCUIT.1#VOLT.1", 0, "sm_vc")               # renomear o sinal (o caso do Marcelo)
ok(r["pontas"].get("Sub_1_sm_vc") == {"+": "C.1", "-": "C.1"} and "Sub_1_v_vc" not in r["pontas"] and r["cores_escolhidas"].get("Sub_1_sm_vc") == "#d946ef",
   f"renomeado para sm_vc: a ponta, a garra e a cor foram junto ({r['pontas']}, {r['cores_escolhidas']})")
r = cmd("RENAME", "SUBCIRCUIT.1", "braco")                        # renomear o subcircuito (o prefixo muda)
ok(r["pontas"].get("braco_sm_vc") == {"+": "C.1", "-": "C.1"} and r["cores_escolhidas"].get("braco_sm_vc") == "#d946ef", f"subcircuito renomeado: braco_sm_vc mantém ({r['pontas']})")
api("editor/novo", {"modo": "descartar"})
print("falhas:", falhas)
