"""Monta o exemplo genérico com subcircuitos: três células meia-ponte (o SM-HB da biblioteca) em cascata, com carga RL e um
degrau de carga, e salva na pasta do servidor de teste (8768) como exemplo_cascata_hb. É o circuito com subcircuitos dos
testes (antes eles usavam um MMC da tese) e um exemplo para quem usa o simulador.

  SUBCIRCUIT.1..3 (SM-HB): +vSm em cima, −vSm embaixo, em série: vo → n1 → n2 → gnd
  CONST_S1..3 → EXT_S1..3 → borne S de cada célula (0 = capacitor inserido, 1 = célula em bypass; o tempo morto fica
  dentro da célula). Sem fonte: os capacitores começam com $vCSm = 200 V (v_o = 600 V com as três inseridas) e
  descarregam na carga
  vo → L.1 → o → R.1 → gnd; o → S.1 → c → R.2 → gnd (CONST.1 → CONST_CARGA → GATE.1 → S.1: o degrau de carga)
  medidas: v_o (vo − gnd), i_o (corrente de L.1) e, de cada célula, vCSm e vSm (os medidores de dentro do SM-HB)"""
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
fio = lambda cantos, rot="", dom="LK": ok(api("editor/fio", {"acao": "novo", "cantos": cantos, "dom": dom, "rotulo": rot}), (cantos, rot))
def gira(nome, d):
    for _ in range(4):
        if els()[nome]["dir"] == d: return
        c("ROTATE", [nome])
    assert els()[nome]["dir"] == d, (nome, els()[nome]["dir"])
borne = lambda e, interno: next((t["x"], t["y"]) for t in e["terminais"] if t.get("interno") == interno)

ok(api("editor/novo", {"descartar": True}), "novo")
# as três células, uma embaixo da outra (o SM-HB tem os bornes de potência à esquerda e os de controle à direita)
X0, YS = 30, (6, 16, 26)
for y in YS:
    ok(api("editor/biblioteca", {"acao": "inserir", "nome_lib": "SM-HB", "x": X0, "y": y, "folha": "0"}), ("SM-HB", y))
r = api("editor/estado"); E = {e["nome"]: e for e in r["folhas"]["0"]["elementos"]}
subs = sorted((n for n, e in E.items() if e["tipo"] == "SUBCIRCUIT"), key=lambda n: E[n]["y"])
assert len(subs) == 3, subs
for n in subs: print(n, (E[n]["x"], E[n]["y"]), [(t["interno"], t["x"], t["y"]) for t in E[n]["terminais"]],
                    sorted(e["nome"] for e in r["folhas"][E[n]["uid"]]["elementos"] if e["tipo"] in ("IGBT", "GATE", "VOLT")))
for k in (1, 2, 3):                                                  # os nomes que os testes e o controle usam
    if subs[k - 1] != f"SUBCIRCUIT.{k}": c("RENAME", [subs[k - 1], f"SUBCIRCUIT.{k}"])
usados = lambda: {e["nome"] for f in api("editor/estado")["folhas"].values() for e in f["elementos"]}
def livre(tipo):
    u = usados(); return next(f"{tipo}.{k}" for k in range(1, 99) if f"{tipo}.{k}" not in u)
E = els(); SM = {k: E[f"SUBCIRCUIT.{k}"] for k in (1, 2, 3)}
pos, neg = {k: borne(SM[k], "+vSm") for k in SM}, {k: borne(SM[k], "-vSm") for k in SM}
# potência: a cascata, um fio reto entre a célula de cima (−vSm) e a de baixo (+vSm)
for k in (1, 2):
    a, b = neg[k], pos[k + 1]; assert a[0] == b[0], (a, b)
    fio([list(a), list(b)], f"n{k}")
# a carga, à esquerda: vo → L.1 → o → R.1 → gnd, e o ramo do degrau o → S.1 → c → R.2 → gnd
XL, XS = X0 - 12, X0 - 20
for nome, x, y, tipo in (("L.1", XL, 10, "L"), ("R.1", XL, 20, "R"), ("S.1", XS, 14, "S"), ("R.2", XS, 22, "R")):
    c("CREATE", [nome, x, y, tipo]); gira(nome, 503)
E = els(); bo = lambda n: sorted(((t["x"], t["y"]) for t in E[n]["terminais"]), key=lambda q: q[1])
(l1a, l1b), (r1a, r1b), (s1a, s1b), (r2a, r2b) = (bo(n) for n in ("L.1", "R.1", "S.1", "R.2"))
print({n: bo(n) for n in ("L.1", "R.1", "S.1", "R.2")})
p1, n3 = pos[1], neg[3]
ytopo, ybase = p1[1] - 3, max(n3[1], r1b[1], r2b[1]) + 3
fio([list(p1), [p1[0] - 2, p1[1]], [p1[0] - 2, ytopo], [l1a[0], ytopo], list(l1a)], "vo")
fio([list(l1b), list(r1a)], "o")
yo = (l1b[1] + r1a[1]) // 2
fio([[l1b[0], yo], [s1a[0], yo], list(s1a)], "")
fio([list(s1b), list(r2a)], "c")
fio([list(n3), [n3[0] - 2, n3[1]], [n3[0] - 2, ybase], [r2b[0], ybase], list(r2b)], "gnd")
fio([list(r1b), [r1b[0], ybase]], "")
c("SETP", ["L.1", "L", 10e-3]); c("SETP", ["R.1", "R", 100.0]); c("SETP", ["R.2", "R", 100.0])
# controle: um CONST por célula à direita (o atuador EXT_Sk, ligado ao borne S) e o do degrau de carga
for k in (1, 2, 3):
    s = borne(SM[k], "S"); nome = f"CONST_S{k}"
    c("CREATE", [nome, s[0] + 6, s[1], "CONST"])
    for _ in range(4):                                              # a saída virada para a célula
        o = els()[nome]["terminais"][0]
        if o["x"] < els()[nome]["x"]: break
        c("ROTATE", [nome])
    c("SETP", [nome, "const", 0.0]); c("OUTNODE", [nome, 0, f"EXT_S{k}"])
    o = els()[nome]["terminais"][0]
    if (o["x"], o["y"]) != s: fio([[o["x"], o["y"]], [s[0] + 2, o["y"]], [s[0] + 2, s[1]], list(s)] if o["y"] != s[1] else [[o["x"], o["y"]], list(s)], "", "CONTROL")
g = livre("GATE")
c("CREATE", ["CONST.1", XS - 8, 9, "CONST"]); c("CREATE", [g, XS - 3, 9, "GATE"])
c("SETP", ["CONST.1", "const", 0.0]); c("OUTNODE", ["CONST.1", 0, "CONST_CARGA"])
E = els(); a_, b_ = E["CONST.1"]["terminais"][0], E[g]["terminais"][0]
if (a_["x"], a_["y"]) != (b_["x"], b_["y"]): fio([[a_["x"], a_["y"]], [b_["x"], b_["y"]]], "", "CONTROL")
ok(api("editor/mede", {"nome": g, "tipo": "G", "componente": "S.1"}), "gate")
# medidores da folha principal
vm, am = livre("VOLT"), livre("AMP")
for nome, x, y, rot in ((vm, XS - 8, 26, "v_o"), (am, XS - 8, 30, "i_o")):
    c("CREATE", [nome, x, y, nome.split(".")[0]]); c("OUTNODE", [nome, 0, rot])
ok(api("editor/mede", {"nome": vm, "tipo": "V", "no1": "vo", "no2": "gnd"}), "v_o")
ok(api("editor/mede", {"nome": am, "tipo": "I", "componente": "L.1"}), "i_o")
# os nomes de fora nos bornes de controle de cada célula: o gatilho EXT_Sk entra, a tensão do capacitor sai como VC_SMk
for k in (1, 2, 3):
    c("INNODE", [f"SUBCIRCUIT.{k}", 2, f"EXT_S{k}"]); c("INNODE", [f"SUBCIRCUIT.{k}", 4, f"VC_SM{k}"])
# só as variáveis globais que as células usam (o SM-HB da biblioteca traz as do circuito de onde veio)
r = api("editor/estado")
usadas = {v for f in r["folhas"].values() for e in f["elementos"] for k, v in e["par"].items() if k.endswith("_var") and v}
sobra = sorted(set(r.get("globais", {})) - usadas)
if sobra: ok(api("editor/variavel", {"acao": "apaga", "nomes": sobra}), ("apaga", sobra))
print("variáveis tiradas:", sobra)
r = api("editor/estado"); print("encaixe", r["encaixe"])
print({e["nome"]: [t.get("rotulo") for t in e["terminais"]] for e in r["folhas"]["0"]["elementos"] if e["tipo"] == "SUBCIRCUIT"})
print("globais", sorted(r.get("globais", {})))
if "--salvar" in sys.argv:
    print(ok(api("editor/salvar", {"nome": "exemplo_cascata_hb", "pasta": "pew", "sobrescrever": True}), "salvar"))
