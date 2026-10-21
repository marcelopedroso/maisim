"""Colar dentro de subcircuitos iguais (instância de teste 8768), achado de Marcelo em 19/10: o Ctrl+V dentro de um SM só
ia para o SM aberto, e ele deixava de ser igual aos outros (as mudanças seguintes passavam a valer só para ele). Agora, com
"mudar os N juntos", a página manda as folhas iguais e a cópia vai para todas: o mesmo nome e a mesma posição em cada uma
(continuam iguais), um passo do desfazer; colar numa folha só continua como antes."""
import json, urllib.request
B = "http://localhost:8768/pew/simu/"
def api(rota, corpo=None):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(q, timeout=180).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read() or b"{}")}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
c = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
def assin(f):
    return (sorted((e["nome"], e["tipo"], e["x"], e["y"], e["dir"]) for e in f["elementos"]), sorted((w["dom"], tuple(map(tuple, w["pts"]))) for w in f["fios"]))
def sms(r):
    return {f["nome"]: (k, f) for k, f in r["folhas"].items() if k != "0"}
api("editor/novo", {"modo": "descartar"})
c("CREATE", "SUBCIRCUIT.1", 20, 10, "SUBCIRCUIT"); c("CREATE", "SUBCIRCUIT.1#R.1", 20, 10, "R")
api("editor/copiar", {"nome": "SUBCIRCUIT.1", "folha": "0"})
r = api("editor/colar", {"x": 40, "y": 10, "folha": "0"})                    # o 2º SM: igual ao 1º
s = sms(r)
ok(len(s) == 2 and assin(s["SUBCIRCUIT.1"][1]) == assin(s[r["colado"][0]][1]), f"dois subcircuitos iguais: {list(s)}")
k1, k2 = s["SUBCIRCUIT.1"][0], s[r["colado"][0]][0]
c("CREATE", "S", 5, 5, "CONST")                                               # um CONST na folha principal, copiado
api("editor/copiar", {"nome": "S", "folha": "0"})
r = api("editor/colar", {"x": 30, "y": 4, "folha": k1, "folhas": [k1, k2], "descr": "colado (nos 2 subcircuitos iguais)"})
s = sms(r)
e1 = [e for e in s["SUBCIRCUIT.1"][1]["elementos"] if e["tipo"] == "CONST"]
e2 = [e for e in s[next(n for n in s if n != "SUBCIRCUIT.1")][1]["elementos"] if e["tipo"] == "CONST"]
ok(not r.get("ERRO") and len(e1) == 1 and len(e2) == 1 and (e1[0]["nome"], e1[0]["x"], e1[0]["y"]) == (e2[0]["nome"], e2[0]["x"], e2[0]["y"]) == ("S", 30, 4),
   f"colado nos dois: o mesmo nome e a mesma posição ({e1[0]['nome'] if e1 else '?'} em {(e1[0]['x'], e1[0]['y']) if e1 else '?'}) {r.get('erro', '')}")
a, b = [assin(f) for _, f in s.values()]
ok(a == b and r.get("colado_em") and len(r["colado_em"]) == 2, "os dois continuam iguais (a mesma assinatura)")
r = api("editor/desfazer", {})
s = sms(r)
ok(all(not [e for e in f["elementos"] if e["tipo"] == "CONST"] for _, f in s.values()), "Ctrl+Z: sai dos dois de uma vez")
# numa folha só (como antes): o nome livre em todo o circuito
r = api("editor/colar", {"x": 30, "y": 4, "folha": k1})
s = sms(r)
n1 = [e["nome"] for e in s["SUBCIRCUIT.1"][1]["elementos"] if e["tipo"] == "CONST"]
n2 = [e["nome"] for n, (_, f) in s.items() if n != "SUBCIRCUIT.1" for e in f["elementos"] if e["tipo"] == "CONST"]
ok(len(n1) == 1 and not n2, f"colar numa folha só: só nela ({n1}), como antes")
api("editor/novo", {"modo": "descartar"})
print("falhas:", falhas)
raise SystemExit(1 if falhas else 0)
