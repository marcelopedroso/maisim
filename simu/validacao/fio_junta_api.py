"""Um fio com uma ponta no MEIO de outro (instância de teste 7201), achado de Marcelo em 30/10 ao gravar o vídeo do divisor
resistivo: o conector "gnd" (um toco com uma ponta solta) saindo do meio do fio do terra; o voltímetro b–gnd zerava a rodada
inteira, sem erro, até a corrente. O Gecko liga os fios pelas pontas: o editor agora divide o fio no ponto da junção.
Confere, no divisor 12 V / 10 Ω / 10 Ω (v_b = 6 V, i = 0,6 A): o toco saindo do meio, de um canto, terminando no meio,
desenhado antes do fio (o fio novo passa pela ponta dele), em duas folhas não (só a principal), e que os pedaços do fio
dividido guardam o rótulo; um fio que só cruza outro (sem ponta no meio) continua inteiro."""
import json, time, urllib.request
import numpy as np
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read())}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def cmd(op, *a): return api("editor/cmd", {"op": op, "args": list(a)})
def fio(rot, *pts): return api("editor/fio", {"acao": "novo", "cantos": [list(p) for p in pts], "dom": "LK", "rotulo": rot})
def fios(r): return [([tuple(p) for p in w["pts"]], w["rotulo"]) for w in r["folhas"]["0"]["fios"]]
def divisor():
    """U.1 12 V em (4,10), R.1 em (8,6), R.2 em (12,10): os nós a e b; o retorno fica para cada caso."""
    api("editor/novo", {"modo": "descartar"})
    for nome, x, y, tipo in (("U.1", 4, 10, "U"), ("R.1", 8, 6, "R"), ("R.2", 12, 10, "R")):
        cmd("CREATE", nome, x, y, tipo)
    for nome, d in (("U.1", 503), ("R.1", 502), ("R.2", 503)):
        for _ in range(4):
            e = next(x for x in api("editor/estado")["folhas"]["0"]["elementos"] if x["nome"] == nome)
            if e["dir"] == d: break
            cmd("ROTATE", nome)
    cmd("SETP", "U.1", "type", 401); cmd("SETP", "U.1", "uDC", 12.0); cmd("SETP", "R.1", "R", 10.0); cmd("SETP", "R.2", "R", 10.0)
    fio("a", (4, 8), (4, 6), (6, 6)); fio("b", (10, 6), (12, 6), (12, 8))
def mede_e_roda(no2="gnd"):
    for nome, tipo, saida, m in (("VOLT.1", "VOLT", "v_b", {"tipo": "V", "no1": "b", "no2": no2}), ("AMP.1", "AMP", "i_R2", {"tipo": "I", "componente": "R.2"})):
        cmd("CREATE", nome, 17, 10 if tipo == "VOLT" else 13, tipo); cmd("OUTNODE", nome, 0, saida); api("editor/mede", dict(nome=nome, **m))
    j = api("editor/rodar", {"dt": "1e-6", "tfim": "1e-3", "nome": "fio_junta", "amostras": "1000"})
    while j.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.3); j = api("editor/rodada")
    z = np.load(j["arquivo"]) if j.get("arquivo") else None
    return (float(z["v_b"][-1]), float(z["i_R2"][-1])) if z is not None else (None, None)
FUNDO = ((4, 12), (4, 14), (12, 14), (12, 12))
casos = {
    "o toco do conector saindo do meio do fio do terra": lambda: (fio("", *FUNDO), fio("gnd", (8, 14), (8, 16))),
    "o toco saindo de um canto do fio do terra": lambda: (fio("", *FUNDO), fio("gnd", (4, 14), (2, 14))),
    "o toco terminando no meio do fio do terra": lambda: (fio("", *FUNDO), fio("gnd", (8, 16), (8, 14))),
    "o toco desenhado antes; o fio do terra passa pela ponta dele": lambda: (fio("gnd", (8, 16), (8, 14)), fio("", *FUNDO)),
}
for nome, monta in casos.items():
    divisor(); monta(); v, i = mede_e_roda()
    ok(v is not None and abs(v - 6) < 1e-6 and abs(i - 0.6) < 1e-6, f"{nome}: v_b = {v} V (6), i_R2 = {i} A (0,6)")
# os pedaços do fio dividido: o rótulo vai junto e juntos cobrem o fio de antes
divisor(); fio("terra", *FUNDO); r = fio("gnd", (8, 14), (8, 16))
pedacos = [(p, rot) for p, rot in fios(r) if rot == "terra"]
juntos = sorted({q for p, _ in pedacos for q in p})
ok(len(pedacos) == 2 and all((8, 14) in (p[0], p[-1]) for p, _ in pedacos) and len(juntos) == 13,
   f"o fio 'terra' dividido em (8,14): {len(pedacos)} pedaços com o rótulo, ponta na junção, {len(juntos)} pontos (13)")
# desfazer o toco: o fio do terra volta inteiro (um passo só no desfazer)
r = api("editor/desfazer", {})
ok(len([w for w in fios(r) if w[1] == "terra"]) == 1 and not any(w[1] == "gnd" for w in fios(r)),
   f"desfazer o toco: o fio 'terra' volta inteiro e o toco sai ({[(len(p), rot) for p, rot in fios(r)]})")
# um fio que só cruza outro (nenhuma ponta no meio do outro) não divide nada
divisor(); fio("", *FUNDO); r = fio("x", (8, 12), (8, 16))
ok(len([w for w in fios(r) if w[1] == ""]) == 1, "um fio cruzando o do terra pelo meio (sem ponta nele): o do terra continua inteiro")
print(f"\n{'tudo certo' if not falhas else f'{falhas} falha(s)'}")
raise SystemExit(1 if falhas else 0)
