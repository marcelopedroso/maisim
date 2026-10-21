"""Módulos do controle (instância de teste 8768), pedido de Marcelo em 19/10: o circuito novo vem com leitura.py → controle.py
→ escrita.py; todo .py que não é controlador é um módulo, importado e chamado na mesma amostra, sem atraso. Prova: o PI de
corrente do teste_controle (RL com fonte controlada) escrito em módulos (leitura → pi → escrita) dá o MESMO resultado,
bit a bit, que o PI todo no controle.py. E os riscos: nome de módulo do Python, import que não existe, import de um
controlador, módulo que ninguém importa, ciclo, módulo com cara de controlador, erro dentro de um módulo (arquivo e linha),
e um controle de antes dos módulos continua como era."""
import json, math, os, time, urllib.request
from pathlib import Path
import numpy as np
RAIZ_PROJ = str(Path(__file__).resolve().parents[2])   # a raiz do projeto (validacao → simu → raiz)
B = "http://localhost:8768/pew/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read())}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
c = lambda op, args: api("editor/cmd", {"op": op, "args": args})
R, L, dt, Ts, tfim, iref, Vmax = 1.0, 10e-3, 1e-6, 100e-6, 0.01, 5.0, 100.0
wc = 2 * math.pi * 200; Kp, Ki = L * wc, R * wc
PARS = [{"nome": "Kp", "valor": Kp, "unidade": "V/A"}, {"nome": "Ki", "valor": Ki, "unidade": "V/(A·s)"},
        {"nome": "i_ref", "valor": iref, "unidade": "A"}, {"nome": "Vmax", "valor": Vmax, "unidade": "V"}]
# 1. o circuito novo: leitura.py → controle.py → escrita.py
api("editor/novo", {"modo": "descartar"})
r = api("editor/controle")
cc = r["controle"]
ok(sorted(cc["arquivos"]) == ["escrita.py", "leitura.py"] and r.get("modulos") == ["escrita.py", "leitura.py"] and "import leitura" in cc["codigo"]
   and "import escrita" in cc["codigo"] and not r["erros"] and not r["avisos"], f"circuito novo: controle.py + os módulos {r.get('modulos')}, sem erros nem avisos")
# o circuito do teste_controle: RL com fonte controlada pelo CONST u_ctrl, i_L medida
for a in (["U.1", 10, 10, "U"], ["R.1", 20, 10, "R"], ["L.1", 30, 10, "L"], ["CONST.1", 40, 6, "CONST"], ["AMP.1", 40, 12, "AMP"]):
    c("CREATE", a)
for nome, i, o in (("U.1", "a", "gnd"), ("R.1", "a", "b"), ("L.1", "b", "gnd")):
    c("INNODE", [nome, 0, i]); c("OUTNODE", [nome, 0, o])
c("SETP", ["R.1", "R", R]); c("SETP", ["L.1", "L", L]); c("SETP", ["CONST.1", "const", 0.0]); c("OUTNODE", ["CONST.1", 0, "u_ctrl"])
api("editor/fonte_sinal", {"nome": "U.1", "sinal": "u_ctrl"})
c("OUTNODE", ["AMP.1", 0, "i_L"]); api("editor/mede", {"nome": "AMP.1", "tipo": "I", "componente": "L.1"})
def roda(cfg, nome):
    r = api("editor/controle", {"controle": dict({"ativo": True, "Ts": Ts, "atuacoes": ["u_ctrl"], "parametros": PARS, "controladores": []}, **cfg)})
    if r.get("ERRO") or r.get("erros"):
        return None, r
    j = api("editor/rodar", {"dt": repr(dt), "tfim": repr(tfim), "nome": nome, "amostras": "100000"})
    while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.4); j = api("editor/rodada")
    if j.get("estado") != "fim":
        return None, j
    p = j["arquivo"] if os.path.isabs(j["arquivo"]) else os.path.join(RAIZ_PROJ, j["arquivo"])
    return np.load(p), j
# 2. o PI todo no controle.py (como antes)
UM = '''def iniciar(p, e):
    e["integral"] = 0.0


def passo(t, m, p, e):
    erro = p["i_ref"] - m["i_L"]
    e["integral"] += erro * p["Ts"]
    u = p["Kp"] * erro + p["Ki"] * e["integral"]
    u = max(-p["Vmax"], min(p["Vmax"], u))
    scope("erro", erro)
    return {"u_ctrl": u}
'''
A, ja = roda({"codigo": UM, "arquivos": {}}, "modulos_um")
ok(A is not None, f"PI num arquivo só: {ja.get('estado')} {ja.get('erro', '')}")
# 3. o mesmo PI em módulos: leitura → pi → escrita, chamados pelo controle.py
ORQ = '''import leitura
import pi
import escrita


def iniciar(p, e):
    e["leitura"], e["pi"], e["escrita"] = leitura.iniciar(p), pi.iniciar(p), escrita.iniciar(p)


def passo(t, m, p, e):
    x = leitura.passo(m, p, e["leitura"])
    u = pi.passo(x, p, e["pi"])
    return escrita.passo({"u_ctrl": u}, p, e["escrita"])
'''
LEI = '''def iniciar(p):
    return {}


def passo(m, p, estado):
    return {"i": m["i_L"]}
'''
PI = '''def iniciar(p):
    return {"integral": 0.0}


def passo(x, p, estado):
    erro = p["i_ref"] - x["i"]
    estado["integral"] += erro * p["Ts"]
    scope("erro", erro)
    return p["Kp"] * erro + p["Ki"] * estado["integral"]
'''
ESC = '''def iniciar(p):
    return {}


def passo(u, p, estado):
    return {k: max(-p["Vmax"], min(p["Vmax"], v)) for k, v in u.items()}
'''
MODS = {"leitura.py": LEI, "pi.py": PI, "escrita.py": ESC}
Bm, jb = roda({"codigo": ORQ, "arquivos": MODS}, "modulos_tres")
ok(Bm is not None, f"o mesmo PI em módulos (leitura → pi → escrita): {jb.get('estado')} {jb.get('erro', '')}")
if A is not None and Bm is not None:
    iguais = all(np.array_equal(A[k], Bm[k], equal_nan=True) for k in ("t", "i_L", "u_ctrl", "erro"))
    ok(iguais and abs(A["i_L"][-2] - iref) < 1e-3, f"bit a bit iguais (t, i_L, u_ctrl, erro: {len(A['t'])} amostras); i_L final {A['i_L'][-2]:.5f} A — módulo na mesma amostra, sem atraso")
# 4. os riscos
def painel(cod, arqs, ctls=None):
    return api("editor/controle", {"controle": {"ativo": False, "Ts": Ts, "atuacoes": ["u_ctrl"], "parametros": PARS, "codigo": cod, "arquivos": arqs, "controladores": ctls or []}})
r = painel("import json\n" + ORQ, dict(MODS, **{"json.py": "x = 1\n"}))
ok(any(x["arquivo"] == "json.py" and "módulo do Python" in x["msg"] for x in r["erros"]), "json.py: o nome é de um módulo do Python → erro (renomeie)")
r = painel("import nada\n" + ORQ, MODS)
ok(any(x["arquivo"] == "controle.py" and x["linha"] == 1 and "não há nada.py" in x["msg"] for x in r["erros"]), "import nada (não existe) → erro na linha 1 do controle.py")
r = painel(ORQ, dict(MODS, **{"sobra.py": LEI}))
ok(any("sobra.py (módulo) não é importado" in a for a in r["avisos"]) and not r["erros"], "sobra.py que ninguém importa → aviso (não impede rodar)")
r = painel("import a1\n" + ORQ, dict(MODS, **{"a1.py": "import a2\n", "a2.py": "import a1\n"}))
ok(any("ciclo" in a and "a1.py → a2.py → a1.py" in a for a in r["avisos"]), "a1 ↔ a2 → aviso de import em ciclo")
r = painel(ORQ, dict(MODS, **{"pi.py": "def passo(t, m, p, e):\n    return {}\n"}))
ok(any("pi.py: passo(t, m, p, e) é a assinatura de um controlador" in a for a in r["avisos"]), "módulo com passo(t, m, p, e) → aviso (cara de controlador)")
r = painel(ORQ, MODS, [{"nome": "controle", "arquivo": "controle.py", "todas": True, "medidas": [], "atuacoes": ["u_ctrl"], "subcircuitos": []},
                       {"nome": "pi", "arquivo": "pi.py", "todas": False, "medidas": [], "atuacoes": [], "subcircuitos": []}])
ok(any("import pi: pi.py é um controlador" in x["msg"] for x in r["erros"]) and "pi.py" not in (r.get("modulos") or []), "pi.py virou controlador e o controle.py o importa → erro (o atraso entraria na malha)")
# 4b. a ordem de uma amostra (ler → controlar → escrever): os desvios viram aviso; o fluxo certo, nenhum
r = painel(ORQ, MODS)
ok(not [a for a in r["avisos"] if "passo()" in a or "iniciar()" in a], f"o fluxo leitura → pi → escrita, com os iniciar(): sem aviso de ordem")
ORDEM_ERRADA = ORQ.replace("    x = leitura.passo(m, p, e[\"leitura\"])\n    u = pi.passo(x, p, e[\"pi\"])", "    u0 = pi.passo({\"i\": m[\"i_L\"]}, p, e[\"pi\"])\n    x = leitura.passo(m, p, e[\"leitura\"])\n    u = u0")
r = painel(ORDEM_ERRADA, MODS)
ok(any("leitura.passo() deve ser a 1ª chamada" in a for a in r["avisos"]), "pi.passo() antes da leitura → aviso: ler antes de calcular")
ESC_NO_MEIO = ORQ.replace("    return escrita.passo({\"u_ctrl\": u}, p, e[\"escrita\"])", "    s = escrita.passo({\"u_ctrl\": u}, p, e[\"escrita\"])\n    pi.passo(x, p, e[\"pi\"])\n    return s")
r = painel(ESC_NO_MEIO, MODS)
ok(any("escrita.passo() deve ser a última chamada" in a for a in r["avisos"]), "um módulo depois do escrita → aviso: escrever depois de calcular")
SEM_ESC = ORQ.replace("    return escrita.passo({\"u_ctrl\": u}, p, e[\"escrita\"])", "    escrita.passo({\"u_ctrl\": u}, p, e[\"escrita\"])\n    return {\"u_ctrl\": u}")
r = painel(SEM_ESC, MODS)
ok(any("o return de passo() não é o que o escrita.passo() devolve" in a for a in r["avisos"]), "return que pula o escrita → aviso: os limites do atuador ficam de fora")
SEM_INI = ORQ.replace('    e["leitura"], e["pi"], e["escrita"] = leitura.iniciar(p), pi.iniciar(p), escrita.iniciar(p)', '    e["leitura"], e["escrita"] = leitura.iniciar(p), escrita.iniciar(p)\n    e["pi"] = {"integral": 0.0}')
r = painel(SEM_INI, MODS)
ok(any("pi.iniciar() não é chamado no iniciar()" in a for a in r["avisos"]), "pi usado sem pi.iniciar() → aviso: o estado não começa")
# 5. erro dentro de um módulo, na rodada: o arquivo e a linha dele
_, j = roda({"codigo": ORQ, "arquivos": dict(MODS, **{"pi.py": PI.replace('x["i"]', 'x["nao_tem"]')})}, "modulos_erro")
ec = j.get("erro_controle") or {}
ok(j.get("estado") == "erro" and ec.get("arquivo") == "pi.py" and ec.get("linha") == 6 and "nao_tem" in j.get("erro", ""), f"erro no pi.py: a rodada diz pi.py linha {ec.get('linha')} ({j.get('erro', '')[:70]})")
# 5b. "Salvar como" leva os módulos (dentro do <nome>.controle.json) e reabrir os traz de volta (Marcelo, 19/10: "duplica tudo")
painel(ORQ, MODS)
sv = api("editor/salvar", {"nome": "modulos_salvar_como", "pasta": "pew", "sobrescrever": True})
pasta_sv = os.path.dirname(sv["salvo"]) if os.path.isabs(sv.get("salvo", "")) else os.path.expanduser("~/.cache/pew_simu_teste/pew")
jsv = json.load(open(os.path.join(pasta_sv, "modulos_salvar_como.controle.json")))
api("editor/novo", {"modo": "descartar"})
api("editor/abrir", {"arq": os.path.join(pasta_sv, "modulos_salvar_como.ipes"), "modo": "descartar"})
r = api("editor/controle")
ok(jsv["arquivos"] == MODS and jsv["codigo"] == ORQ and r["controle"]["arquivos"] == MODS and r["modulos"] == sorted(MODS),
   f"salvar como: o .controle.json leva o controle.py e os módulos {sorted(jsv['arquivos'])}; reaberto, os mesmos")
# 6. um controle de antes dos módulos continua como era (o exemplo congelado, sem arquivos)
pi_arq = os.path.expanduser("~/.cache/pew_simu_teste/pew/exemplo_controle_pi.ipes")
api("editor/abrir", {"arq": pi_arq, "modo": "descartar"})
r = api("editor/controle")
ok(r["controle"]["arquivos"] == {} and r.get("modulos") == [] and "import leitura" not in r["controle"]["codigo"], "o exemplo de antes dos módulos abre como era (sem leitura.py nem escrita.py)")
api("editor/novo", {"modo": "descartar"})
print("falhas:", falhas)
