"""Terminais de subcircuito na instância de teste (7201): o terminal encosta na borda da folha como no Gecko (a borda é o
lado do borne no bloco), nunca cai num borne ocupado (vai para o livre mais perto; sem livre, erro antes de mexer), anda
com dx == dy (o Gecko ignora esse passo) e pode ser criado já num lado que não é o padrão; renomear e apagar; tamanho do
bloco (não deixa juntar bornes); e a prova: fios de fora até os bornes desenhados e a corrente sai V/R."""
import json, subprocess, time, urllib.request
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read())}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
cmd = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
def bloco(j):
    b = next(e for e in j["folhas"]["0"]["elementos"] if e["tipo"] == "SUBCIRCUIT")
    return b, {t["interno"]: (t["x"] - b["x"], t["y"] - b["y"], t["lado"]) for t in b["terminais"]}
def dentro(j, nome):
    b, _ = bloco(j)
    e = next(x for x in j["folhas"][b["uid"]]["elementos"] if x["nome"] == nome)
    return e["x"], e["y"]

api("editor/novo", {"modo": "descartar"})
j = cmd("CREATE", "SUBCIRCUIT.1", 20, 10, "SUBCIRCUIT")
b, _ = bloco(j)
ok(b["tamanho"] == [8, 5] and j["folhas"][b["uid"]]["tamanho"] == [50, 40], f"bloco novo 8 × 5, folha 50 × 40 ({b['tamanho']}, {j['folhas'][b['uid']]['tamanho']})")
# os pontos do Marcelo (18/10): dois de potência e um de controle no meio da folha
j = cmd("CREATE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.1", 5, 9, "CIRCUIT_TERMINAL")
ok(dentro(j, "CIRCUIT_TERMINAL.1") == (1, 9) and j["terminal"]["ok"] and not j["terminal"]["deslizou"],
   f"criado em (5, 9): encosta na borda esquerda, (1, 9) → {dentro(j, 'CIRCUIT_TERMINAL.1')}, {j['terminal']['lado']}")
j = cmd("CREATE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.2", 2, 16, "CIRCUIT_TERMINAL")
j = cmd("CREATE", "SUBCIRCUIT.1#CONTROL_TERMINAL.1", 5, 19, "CONTROL_TERMINAL")
_, p = bloco(j)
ok(j["terminal"]["deslizou"] and dentro(j, "CONTROL_TERMINAL.1") == (1, 24) and len({v[:2] for v in p.values()}) == 3,
   f"o de controle em (5, 19) cairia no borne do CIRCUIT_TERMINAL.2: vai para o livre mais perto, (1, 24) → bornes {p}")
ok(not any(t.get("junto") for t in bloco(j)[0]["terminais"]), "nenhum borne junto de outro")
# outros lados; criar já num lado que não é o padrão (o Gecko deixa o lado padrão até mover)
j = cmd("CREATE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.3", 45, 10, "CIRCUIT_TERMINAL")
ok(dentro(j, "CIRCUIT_TERMINAL.3") == (49, 10) and bloco(j)[1]["CIRCUIT_TERMINAL.3"] == (8, 1, "d"), f"criado em (45, 10): borda direita, borne (8, 1) à direita → {bloco(j)[1]['CIRCUIT_TERMINAL.3']}")
j = cmd("CREATE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.4", 49, 20, "CIRCUIT_TERMINAL")
ok(bloco(j)[1]["CIRCUIT_TERMINAL.4"] == (8, 2, "d"), f"criado já em cima da borda direita (49, 20): o lado é a direita, não o padrão → {bloco(j)[1]['CIRCUIT_TERMINAL.4']}")
j = cmd("CREATE", "SUBCIRCUIT.1#CONTROL_TERMINAL.2", 10, 39, "CONTROL_TERMINAL")
ok(bloco(j)[1]["CONTROL_TERMINAL.2"] == (1, 5, "b"), f"criado em (10, 39): embaixo, borne (1, 5) = ⌊8 · 10 / 50⌋ → {bloco(j)[1]['CONTROL_TERMINAL.2']}")
j = cmd("CREATE", "SUBCIRCUIT.1#CONTROL_TERMINAL.3", 20, 3, "CONTROL_TERMINAL")
ok(bloco(j)[1]["CONTROL_TERMINAL.3"] == (3, -1, "c") and dentro(j, "CONTROL_TERMINAL.3") == (20, 2), f"criado em (20, 3): em cima, borne (3, −1) → {bloco(j)[1]['CONTROL_TERMINAL.3']}")
# lado cheio: 5 bornes à esquerda (altura 5); o 6º dá erro e nada muda
cmd("CREATE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.5", 1, 2, "CIRCUIT_TERMINAL")
j = cmd("CREATE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.6", 1, 38, "CIRCUIT_TERMINAL")
esq = sorted(v[1] for v in bloco(j)[1].values() if v[2] == "e")
ok(esq == [0, 1, 2, 3, 4], f"esquerda cheia: bornes nas alturas {esq}")
n_antes, desf_antes = len(bloco(j)[1]), j["desfazer"]["n"]
r = cmd("CREATE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.7", 3, 20, "CIRCUIT_TERMINAL")
j = api("editor/estado")
ok("ERRO" in r and "borne livre" in r.get("erro", "") and len(bloco(j)[1]) == n_antes and j["desfazer"]["n"] == desf_antes,
   f"6º à esquerda: erro antes de mexer, nada criado, desfazer igual ({r.get('erro', 'sem erro')[:90]}…; bornes {n_antes}→{len(bloco(j)[1])}, desfazer {desf_antes}→{j['desfazer']['n']})")
# mover: para outro lado; e um passo com dx == dy (o Gecko ignora: o servidor passa por um vizinho da borda)
j = cmd("MOVE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.1", 40, 30)
ok(dentro(j, "CIRCUIT_TERMINAL.1") == (49, 30) and bloco(j)[1]["CIRCUIT_TERMINAL.1"] == (8, 3, "d"), f"movido até (40, 30): borda direita, borne (8, 3) → {bloco(j)[1]['CIRCUIT_TERMINAL.1']}")
x0, y0 = dentro(j, "CIRCUIT_TERMINAL.5")
j = cmd("MOVE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.5", x0 + 37, y0 + 37)
ok((x0, y0) == (1, 2) and dentro(j, "CIRCUIT_TERMINAL.5") == (38, 39) and bloco(j)[1]["CIRCUIT_TERMINAL.5"] == (6, 5, "b"),
   f"de ({x0}, {y0}) a (38, 39), passo (37, 37) que o Gecko ignoraria: chegou, borne (6, 5) embaixo → {dentro(j, 'CIRCUIT_TERMINAL.5')}, {bloco(j)[1]['CIRCUIT_TERMINAL.5']}")
# arrastar para cima de outro borne: vai para o livre mais perto, na mesma borda
j = cmd("MOVE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.4", 49, 30)
_, p = bloco(j)
ok(j["terminal"]["deslizou"] and p["CIRCUIT_TERMINAL.4"] != p["CIRCUIT_TERMINAL.1"] and p["CIRCUIT_TERMINAL.4"][2] == "d",
   f"levado ao borne do CIRCUIT_TERMINAL.1: fica no livre mais perto à direita → {p['CIRCUIT_TERMINAL.4']}")
# renomear e apagar (os rótulos de fora ficam com os bornes certos)
_, p = bloco(j); nomes = list(p)
for k in range(len(nomes)):
    cmd("INNODE", "SUBCIRCUIT.1", k, f"fora_{k}")
j = cmd("RENAME", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.3", "entrada")
b, p = bloco(j)
ok("entrada" in p and "CIRCUIT_TERMINAL.3" not in p, "renomeado CIRCUIT_TERMINAL.3 → entrada (o borne leva o nome)")
rot = {t["interno"]: t["rotulo"] for t in b["terminais"]}
j = cmd("DELETE", "SUBCIRCUIT.1#CONTROL_TERMINAL.2")
b, p = bloco(j)
ok("CONTROL_TERMINAL.2" not in p and all(t["rotulo"] == rot[t["interno"]] for t in b["terminais"]), "apagado CONTROL_TERMINAL.2: o borne some e os rótulos de fora dos outros ficam")
# tamanho do bloco: crescer recalcula os bornes; encolher a ponto de juntar dá erro e não muda nada
j = cmd("SETP", "SUBCIRCUIT.1", "blockSizeY", 10)
b, p = bloco(j)
ok(b["tamanho"] == [8, 10] and p["CIRCUIT_TERMINAL.1"] == (8, 7, "d") and not any(t.get("junto") for t in b["terminais"]),
   f"altura 10: CIRCUIT_TERMINAL.1 passa a (8, 7) = ⌊10 · 30 / 40⌋ → {p['CIRCUIT_TERMINAL.1']}")
r = cmd("SETP", "SUBCIRCUIT.1", "blockSizeY", 2)
j = api("editor/estado")
ok("ERRO" in r and "mesmo borne" in r.get("erro", "") and bloco(j)[0]["tamanho"] == [8, 10], f"altura 2 juntaria bornes: erro e nada muda ({r.get('erro', '')[:80]}…)")
r = cmd("SETP", "SUBCIRCUIT.1", "blockSizeX", 1)
ok("ERRO" in r, f"largura 1: fora de 2 a 40 ({r.get('erro', '')[:60]})")

# a prova: subcircuito só com dois terminais e um R; fonte de fora por FIO até os bornes desenhados; |i| = V/R
api("editor/novo", {"modo": "descartar"})
cmd("CREATE", "SUBCIRCUIT.1", 20, 10, "SUBCIRCUIT")
cmd("CREATE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.1", 3, 12, "CIRCUIT_TERMINAL")     # esquerda
cmd("CREATE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.2", 45, 30, "CIRCUIT_TERMINAL")    # direita
cmd("CREATE", "SUBCIRCUIT.1#R.1", 25, 20, "R")
for op, a in (("INNODE", ["SUBCIRCUIT.1#CIRCUIT_TERMINAL.1", 0, "a"]), ("INNODE", ["SUBCIRCUIT.1#CIRCUIT_TERMINAL.2", 0, "b"]),
              ("INNODE", ["SUBCIRCUIT.1#R.1", 0, "a"]), ("OUTNODE", ["SUBCIRCUIT.1#R.1", 0, "b"]), ("SETP", ["SUBCIRCUIT.1#R.1", "R", 10.0]),
              ("CREATE", ["U.1", 10, 30, "U"]), ("SETP", ["U.1", "uDC", 100.0])):
    cmd(op, *a)
j = cmd("SETP", "SUBCIRCUIT.1", "blockSizeY", 6)                               # muda o tamanho depois de pôr os terminais
b, _ = bloco(j)
bor = {t["interno"]: (t["x"], t["y"]) for t in b["terminais"]}
u = next(e for e in j["folhas"]["0"]["elementos"] if e["nome"] == "U.1")
(u1x, u1y), (u2x, u2y) = sorted([(t["x"], t["y"]) for t in u["terminais"]], key=lambda q: q[1])   # o de cima, o de baixo
(ex, ey), (dx, dy) = bor["CIRCUIT_TERMINAL.1"], bor["CIRCUIT_TERMINAL.2"]
f1 = api("editor/fio", {"acao": "novo", "dom": "LK", "cantos": [[u1x, u1y], [u1x, ey], [ex, ey]]})                    # sobe e vai à esquerda do bloco
f2 = api("editor/fio", {"acao": "novo", "dom": "LK", "cantos": [[u2x, u2y], [u2x, u2y + 3], [dx + 2, u2y + 3], [dx + 2, dy], [dx, dy]]})   # desce e contorna até a direita
ok("ERRO" not in f1 and "ERRO" not in f2, f"fios de fora até os bornes desenhados {bor} ({f1.get('erro', 'ok')}, {f2.get('erro', 'ok')})")
api("editor/cmd", {"op": "CREATE", "args": ["AMP.1", 5, 5, "AMP"]})
api("editor/mede", {"nome": "AMP.1", "tipo": "I", "componente": "U.1"}); cmd("OUTNODE", "AMP.1", 0, "i_U")
j = api("editor/rodar", {"dt": "1e-06", "tfim": "0.001", "nome": "sub_terminais_api", "amostras": "1000"})
while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.3); j = api("editor/rodada")
i = float(subprocess.check_output(["python3", "-c", f"import numpy as np; d=np.load({json.dumps(j.get('arquivo', ''))}); i=d['i_U']; print(float(np.mean(i[len(i)//2:])))"]).decode())
ok(j.get("estado") == "fim" and abs(abs(i) - 10) < 1e-6, f"simulado pelos fios até os bornes (bloco 8 × 6): |i| = {abs(i):.6f} A (100 V / 10 Ω = 10 A)")

# arquivo de antes desta regra, com dois terminais no mesmo borne (o caso do Marcelo, 18/10): a tela avisa; arrastar resolve
import gzip, os, re
api("editor/novo", {"modo": "descartar"})
cmd("CREATE", "SUBCIRCUIT.1", 20, 10, "SUBCIRCUIT")
for n, y, tipo in (("CIRCUIT_TERMINAL.1", 9, "CIRCUIT_TERMINAL"), ("CIRCUIT_TERMINAL.2", 16, "CIRCUIT_TERMINAL"), ("CONTROL_TERMINAL.1", 24, "CONTROL_TERMINAL")):
    cmd("CREATE", "SUBCIRCUIT.1#" + n, 1, y, tipo)
sv = api("editor/salvar", {"nome": "teste_sub_juntos", "sobrescrever": True})
arq = os.path.expanduser("~/.cache/maisim_teste/circuitos/teste_sub_juntos.ipes")
b = open(arq, "rb").read(); gz = b[:2] == b"\x1f\x8b"; t = (gzip.decompress(b) if gz else b).decode()
m = re.search(r"<ElementCONTROL>\n(?:(?!<\\ElementCONTROL>).)*?idStringDialog CONTROL_TERMINAL\.1\n.*?<\\ElementCONTROL>", t, re.S)
bl = m and re.sub(r"\ny 24\n", "\ny 19\n", m.group(0))                      # 19: o mesmo borne do CIRCUIT_TERMINAL.2 (⌊5 · 19 / 40⌋ = 2)
ok(bool(m) and bl != m.group(0), "arquivo com CONTROL_TERMINAL.1 posto em (1, 19), como o Gecko deixava")
t = t[:m.start()] + bl + t[m.end():]
open(arq, "wb").write(gzip.compress(t.encode()) if gz else t.encode())
j = api("editor/abrir", {"arq": arq, "modo": "descartar"})
b, p = bloco(j)
jt = {t["interno"]: t.get("junto") for t in b["terminais"]}
ok(jt.get("CIRCUIT_TERMINAL.2") == ["CONTROL_TERMINAL.1"] and jt.get("CONTROL_TERMINAL.1") == ["CIRCUIT_TERMINAL.2"] and not jt.get("CIRCUIT_TERMINAL.1"),
   f"aberto: os dois do mesmo borne vêm marcados (junto) → {jt}")
j = cmd("MOVE", "SUBCIRCUIT.1#CONTROL_TERMINAL.1", 3, 19)                          # um arrasto curto, na mesma borda
b, p = bloco(j)
ok(not any(t.get("junto") for t in b["terminais"]) and len({v[:2] for v in p.values()}) == 3 and j["terminal"]["deslizou"],
   f"arrastado: vai para o borne livre mais perto e nada fica junto → {p}")
os.remove(arq)
api("editor/novo", {"modo": "descartar"})
print("falhas:", falhas)
