# variáveis globais ($) pela API (instância de teste 7201): criar, ligar um parâmetro (como no Gecko: digitar $Vdc no campo),
# a simulação usar o valor da variável (e mudar com ela), desligar (o parâmetro volta a ser número), apagar (quem usava fica
# com o valor), dentro de um subcircuito, Ctrl+Z, e os erros (nome sem $, repetida, parâmetro que não é número)
import json, os, urllib.request, time
from pathlib import Path
import numpy as np
RAIZ_PROJ = str(Path(__file__).resolve().parents[2])   # a raiz do projeto (validacao → simu → raiz)
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read())}
cmd = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
var = lambda **k: api("editor/variavel", k)
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def el(r, nome, folha="0"):
    return next(e for e in r["folhas"][folha]["elementos"] if e["nome"] == nome)
def roda(nome):
    r = api("editor/rodar", {"dt": "1e-6", "tfim": "0.0005", "nome": nome, "amostras": "100"})
    for _ in range(200):
        if r.get("estado") not in ("rodando", "pausada", "preparando"): break
        time.sleep(0.3); r = api("editor/rodada")
    if r.get("estado") != "fim": return None, r
    p = r["arquivo"] if os.path.isabs(r["arquivo"]) else os.path.join(RAIZ_PROJ, r["arquivo"])
    return np.load(p, allow_pickle=True), r
api("editor/novo", {"modo": "descartar"})
g0 = dict(api("editor/estado")["globais"])
cmd("CREATE", "U.1", 10, 10, "U"); cmd("CREATE", "R.1", 20, 10, "R"); cmd("CREATE", "AMP.1", 30, 10, "AMP")
cmd("INNODE", "U.1", 0, "a"); cmd("OUTNODE", "U.1", 0, "gnd"); cmd("INNODE", "R.1", 0, "a"); cmd("OUTNODE", "R.1", 0, "gnd")
api("editor/mede", {"nome": "AMP.1", "tipo": "I", "componente": "R.1"}); cmd("OUTNODE", "AMP.1", 0, "i_r")
# criar
r = var(acao="nova", nome="$Vdc", valor=10)
ok(r.get("globais", {}).get("$Vdc") == 10 and all(r["globais"].get(k) == v for k, v in g0.items()), f"nova $Vdc = 10 (as {len(g0)} que já havia ficam)")
ok(var(acao="nova", nome="$Vdc", valor=3).get("ERRO") == 409, "a mesma de novo: recusada")
ok(var(acao="nova", nome="Vdc", valor=3).get("ERRO") == 409 and var(acao="nova", nome="$1x", valor=3).get("ERRO") == 409, "nome sem $ ou começando por número: recusado")
# ligar: uDC do U.1 → $Vdc; R do R.1 → $R (não existe: criada com o valor pedido)
r = var(acao="liga", componente="U.1", parametro="uDC", nome="$Vdc")
ok(el(r, "U.1")["par"].get("dcValue_var") == "$Vdc" and el(r, "U.1")["par"].get("dcValue") == 10, f"liga U.1.uDC a $Vdc: no arquivo dcValue$ParameterName $Vdc, valor 10")
r = var(acao="liga", componente="R.1", parametro="R", nome="$R", valor=5)
ok(r["globais"].get("$R") == 5 and el(r, "R.1")["par"].get("resistance_var") == "$R", "liga R.1.R a $R, que não existia: criada com 5")
r = var(acao="liga", componente="U.1", parametro="uMAX", nome="$Vp_t", valor=325)
ok(el(r, "U.1")["par"].get("amplitude_var") == "$Vp_t" and el(r, "U.1")["par"].get("dcValue_var") == "$Vdc",
   "liga U.1.uMAX a $Vp_t: é a amplitude (o \"uMAX\" também é nome alternativo do uDC no Gecko; o uDC continua em $Vdc)")
pr = api("editor/params?nome=U.1&dom=LK&typ=4")
u = next(p for p in pr if p["nome"] == "uDC")
ok(u.get("id") == "dcValue" and u.get("pode_var") is True and u.get("valor") == 10, f"o painel: uDC → id dcValue, pode vir de variável, o Gecko diz {u.get('valor')}")
ok(var(acao="liga", componente="U.1", parametro="type", nome="$Vdc").get("ERRO") == 409, "o tipo da fonte (não é número): recusado")
# a simulação usa a variável, e acompanha quando ela muda
d, j = roda("var_a")
i1 = float(np.median(d["i_r"][5:])) if d is not None else j.get("erro")
cmd("SETG", "$Vdc", 20)
d, j = roda("var_b")
i2 = float(np.median(d["i_r"][5:])) if d is not None else j.get("erro")
ok(isinstance(i1, float) and abs(i1 - 2) < 1e-9 and isinstance(i2, float) and abs(i2 - 4) < 1e-9, f"simulado: i = $Vdc/$R = 10/5 = {i1} A; $Vdc = 20 → {i2} A")
# desligar: o parâmetro volta a número
r = var(acao="desliga", componente="R.1", parametro="R", valor=4)
ok("resistance_var" not in el(r, "R.1")["par"] and el(r, "R.1")["par"].get("resistance") == 4 and "$R" in r["globais"], "desliga R.1.R com 4 Ω: sem a variável ($R continua na lista)")
d, j = roda("var_c")
i3 = float(np.median(d["i_r"][5:])) if d is not None else None
ok(i3 is not None and abs(i3 - 5) < 1e-9, f"simulado: 20/4 = {i3} A")
# Ctrl+Z volta a ligação
r = api("editor/desfazer", {})
ok(el(r, "R.1")["par"].get("resistance_var") == "$R", "Ctrl+Z: R.1.R ligado a $R de novo")
# apagar: quem usava fica com o valor
r = var(acao="apaga", nome="$Vdc")
ok("$Vdc" not in r["globais"] and "dcValue_var" not in el(r, "U.1")["par"] and el(r, "U.1")["par"].get("dcValue") == 20, "apaga $Vdc: U.1 fica com uDC = 20, sem a variável")
# dentro de um subcircuito (as cópias iguais: folhas)
cmd("CREATE", "SUBCIRCUIT.1", 50, 10, "SUBCIRCUIT"); cmd("CREATE", "SUBCIRCUIT.1#C.1", 20, 20, "C")
uid = el(api("editor/estado"), "SUBCIRCUIT.1")["uid"]
r = var(acao="liga", componente="C.1", parametro="C", nome="$CSm", folhas=[uid])
ok(el(r, "C.1", uid)["par"].get("capacitance_var") == "$CSm", f"dentro do subcircuito: C.1.C ligado a $CSm ({el(r, 'C.1', uid)['par'].get('capacitance')} F)")
# a variável no fim da lista (o Gecko separa só pela "/": um espaço depois do último nome entraria no nome → NaN)
r = var(acao="nova", nome="$ultima", valor=7); r = var(acao="liga", componente="U.1", parametro="uDC", nome="$ultima")
ok(r["globais"].get("$ultima") == 7 and el(r, "U.1")["par"].get("dcValue") == 7, f"ligado à última da lista: uDC = {el(r, 'U.1')['par'].get('dcValue')} (não NaN)")
api("editor/novo", {"modo": "descartar"})
for k in set(api("editor/estado")["globais"]) - set(g0):   # o "novo" não apaga as variáveis: tira as do teste
    var(acao="apaga", nome=k)
ok(api("editor/estado")["globais"] == g0, "as variáveis do teste saíram (ficam as de antes)")
print("falhas:", falhas)
