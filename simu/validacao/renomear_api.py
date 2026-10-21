"""Um sinal que o controle usa muda de nome no circuito (instância de teste 7201), pedido de Marcelo em 19/10 ("quando a
gente muda uma variável de nome e ela está sendo usada em algum código, tem como mudar todos os lugares? ou pelo menos
alertar num modal e confirmar" — os cartões dos controladores tinham ficado com vc_smap_1 e sm_ap_1_s depois que os
SMs passaram a se chamar SM.ap.1…): a resposta da edição diz o nome de antes, o novo e onde o controle o usa; a rota
editor/controle/renomeia troca no código (só entre aspas), nos cartões, nas atuações e nos acionamentos."""
import json, urllib.request
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(q, timeout=180).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read() or b"{}")}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
c = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
CODIGO = '''def iniciar(p, e):
    pass


def passo(t, m, p, e):
    # u1 é a chave (comentário: fica)
    u1 = m["v_med"]
    return {"u1": u1}
'''
DSP = 'def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {"SM_a_S": 0.0, "SM_b_S": 0.0}\n'
api("editor/novo", {"modo": "descartar"})
c("CREATE", "C1", 10, 5, "CONST"); c("OUTNODE", "C1", 0, "u1")
c("CREATE", "C2", 20, 5, "CONST"); c("OUTNODE", "C2", 0, "v_med")
c("CREATE", "C3", 30, 5, "CONST"); c("OUTNODE", "C3", 0, "solto")
c("CREATE", "SM.a", 10, 20, "SUBCIRCUIT"); c("CREATE", "SM.a#K", 10, 10, "CONST"); c("OUTNODE", "SM.a#K", 0, "S")
api("editor/copiar", {"nome": "SM.a", "folha": "0"}); r = api("editor/colar", {"x": 30, "y": 20, "folha": "0"})
c("RENAME", r["colado"][0], "SM.b")
q = lambda nome, arq, med, atu: {"nome": nome, "arquivo": arq, "todas": False, "medidas": med, "atuacoes": atu, "subcircuitos": []}
r = api("editor/controle", {"controle": {"ativo": True, "Ts": 1e-4, "atuacoes": ["u1", "SM_a_S", "SM_b_S"], "parametros": [], "codigo": CODIGO,
        "arquivos": {"dsp.py": DSP}, "acionamentos": [{"t": 0.01, "alvo": "CONST:u1", "valor": 1.0}],
        "controladores": [q("controle", "controle.py", ["v_med"], ["u1"]), q("dsp", "dsp.py", [], ["SM_a_S", "SM_b_S"])]}})
ok(not r.get("ERRO") and not r.get("erros_controladores"), f"o controle usa u1, v_med, SM_a_S e SM_b_S, sem avisos {r.get('erros_controladores') or r.get('erro', '')}")
# 1. renomear um sinal que o controle usa
r = c("OUTNODE", "C1", 0, "u_novo")
ren = r.get("renomeados") or []
onde = sorted(u["onde"] for x in ren for u in x["usos"])
ok(len(ren) == 1 and ren[0]["de"] == "u1" and ren[0]["para"] == "u_novo" and onde == ["acionamentos", "atuações", "cartão controle", "controle.py:8"],
   f"C1: u1 → u_novo: a resposta diz onde o controle usa ({', '.join(onde)})")
r = api("editor/controle/renomeia", {"pares": [["u1", "u_novo"]]})
cc = api("editor/controle")["controle"]
cod = cc["codigo"]
ok(not r.get("ERRO") and r.get("trocas") == 4 and '{"u_novo": u1}' in cod and "# u1 é a chave" in cod and "    u1 = m[" in cod,
   f"renomeia: {r.get('trocas')} trocas; no código só entre aspas (o comentário e a variável u1 ficam) {r.get('erro', '')}")
ok(cc["controladores"][0]["atuacoes"] == ["u_novo"] and "u_novo" in cc["atuacoes"] and "u1" not in cc["atuacoes"] and cc["acionamentos"][0]["alvo"] == "CONST:u_novo"
   and not r.get("erros_controladores"), f"o cartão, as atuações e o acionamento com u_novo; sem avisos {r.get('erros_controladores') or ''}")
# 2. um sinal que o controle não usa: nada a perguntar
r = c("OUTNODE", "C3", 0, "solto2")
ok(not r.get("ERRO") and not r.get("renomeados"), "C3 (o controle não usa): renomear não pergunta nada")
# 3. dois SMs iguais de uma vez (o rótulo de dentro): dois pares
r = api("editor/cmds", {"cmds": [{"op": "OUTNODE", "args": ["SM.a#K", 0, "chave"]}, {"op": "OUTNODE", "args": ["SM.b#K", 0, "chave"]}], "descr": "K: chave (nos 2)"})
ren = {x["de"]: x["para"] for x in r.get("renomeados") or []}
ok(ren == {"SM_a_S": "SM_a_chave", "SM_b_S": "SM_b_chave"}, f"o rótulo de dentro nos 2 SMs: {ren}")
# 4. desfazer a mudança: o controle não usa os nomes novos, nada a perguntar; volta ao S
r = api("editor/desfazer", {})
ok(not r.get("ERRO") and not r.get("renomeados"), f"desfazer (o controle continua com SM_a_S): nada a perguntar")
# 5. renomear o subcircuito muda o prefixo
r = c("RENAME", "SM.a", "SM.x")
ren = {x["de"]: x["para"] for x in r.get("renomeados") or []}
ok(ren == {"SM_a_S": "SM_x_S"}, f"o SM renomeado (SM.a → SM.x): {ren}")
api("editor/controle/renomeia", {"pares": [["SM_a_S", "SM_x_S"]]})
cc = api("editor/controle")["controle"]
ok('"SM_x_S": 0.0' in cc["arquivos"]["dsp.py"] and cc["controladores"][1]["atuacoes"] == ["SM_x_S", "SM_b_S"], "no dsp.py e no cartão do dsp: SM_x_S")
# 6. desfazer o renomear do SM: o controle já usa SM_x_S, então pergunta de volta
r = api("editor/desfazer", {})
ren = {x["de"]: x["para"] for x in r.get("renomeados") or []}
ok(ren == {"SM_x_S": "SM_a_S"}, f"desfazer o renomear do SM: pergunta de volta {ren}")
# 7. pares inválidos
r = api("editor/controle/renomeia", {"pares": [["u_novo", "1x; drop"]]})
ok(r.get("ERRO") == 409, f"pares inválidos: recusados ({r.get('erro')})")
api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
