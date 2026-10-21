# a beira da folha principal (instância de teste 8768): o Gecko não aceita x nem y menor que 1 (põe em 1, sem avisar) — o caso
# do Marcelo (18/10): fontes em x = 1 arrastadas para a esquerda voltavam. Soltar além da beira abre espaço: o circuito todo
# anda o que faltar, a peça fica onde foi solta em relação às outras, as conexões vão junto; um passo do desfazer; o grupo
# também; dentro do subcircuito (folha de tamanho fixo) nada anda
import json, urllib.request
B = "http://localhost:8768/pew/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read())}
cmd = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
pos = lambda r, n, f="0": next(((e["x"], e["y"]) for e in r["folhas"][f]["elementos"] if e["nome"] == n), None)
fios = lambda r, f="0": sorted(tuple(map(tuple, w["pts"]))[0] + tuple(map(tuple, w["pts"]))[-1] for w in r["folhas"][f]["fios"])
api("editor/novo", {"modo": "descartar"})
cmd("CREATE", "Va", 1, 1, "U"); cmd("CREATE", "Vb", 1, 5, "U"); cmd("CREATE", "R.1", 12, 3, "R")
api("editor/fio", {"acao": "novo", "dom": "LK", "cantos": [[3, 1], [10, 1], [10, 3]]})
cmd("CREATE", "SUBCIRCUIT.1", 20, 10, "SUBCIRCUIT"); cmd("CREATE", "SUBCIRCUIT.1#C.1", 20, 10, "C")
r0 = api("editor/estado"); uid = next(e["uid"] for e in r0["folhas"]["0"]["elementos"] if e["tipo"] == "SUBCIRCUIT")
conta = lambda e: (e["pontas"], e["em_terminal"], e["em_outro_fio"], len(e["soltas"]))
enc0 = conta(r0["encaixe"])
# um componente além da beira da esquerda e de cima
r = cmd("MOVE", "Va", -4, 0)
ok(r.get("deslocado") == [5, 1], f"Va para (−4, 0): o servidor abre espaço, o circuito anda (5, 1) ({r.get('deslocado')}) {r.get('erro', '')}")
ok(pos(r, "Va") == (1, 1) and pos(r, "Vb") == (6, 6) and pos(r, "R.1") == (17, 4) and pos(r, "SUBCIRCUIT.1") == (25, 11),
   f"Va fica 5 à esquerda e 1 acima de onde estava, em relação às outras: Va {pos(r, 'Va')}, Vb {pos(r, 'Vb')}, R.1 {pos(r, 'R.1')}, SM {pos(r, 'SUBCIRCUIT.1')}")
ok(fios(r) == [(8, 2, 15, 4)] and conta(r["encaixe"]) == enc0, f"a conexão andou junto ({fios(r)}) e o encaixe conta o mesmo ({conta(r['encaixe'])})")
ok(pos(r, "C.1", uid) == (20, 10), "dentro do subcircuito nada mudou (C.1 em (20, 10))")
r = api("editor/desfazer", {})
ok(pos(r, "Va") == (1, 1) and pos(r, "Vb") == (1, 5) and pos(r, "R.1") == (12, 3), "Ctrl+Z: tudo volta de uma vez")
# dentro da folha: MOVE comum, nada anda
r = cmd("MOVE", "Va", 4, 2)
ok(pos(r, "Va") == (4, 2) and pos(r, "Vb") == (1, 5) and not r.get("deslocado"), "dentro da folha: só Va anda")
# o grupo além da beira de cima
r = api("editor/grupo", {"acao": "mover", "nomes": ["Va", "R.1"], "fios": [w["pts"] for w in r["folhas"]["0"]["fios"]], "dx": 0, "dy": -4, "folha": "0"})
ok(r.get("deslocado") == [0, 3] and pos(r, "Va") == (4, 1) and pos(r, "Vb") == (1, 8) and pos(r, "R.1") == (12, 2),
   f"grupo (Va, R.1 e a conexão) 4 para cima: abre 3 em cima ({r.get('deslocado')}); Va {pos(r, 'Va')}, Vb {pos(r, 'Vb')}, R.1 {pos(r, 'R.1')} {r.get('erro', '')}")
# dentro do subcircuito, além da beira: não abre espaço (a folha do SM tem tamanho fixo)
r = api("editor/cmds", {"cmds": [{"op": "MOVE", "args": ["SUBCIRCUIT.1#C.1", 0, 10]}]})
ok(not r.get("deslocado") and pos(r, "Va") == (4, 1), f"no subcircuito, x = 0: não anda o circuito (C.1 em {pos(r, 'C.1', uid) if 'folhas' in r else r.get('erro')})")
api("editor/novo", {"modo": "descartar"})
print("falhas:", falhas)
