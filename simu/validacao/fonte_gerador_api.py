"""A fonte como gerador (instância de teste 7201), pedido de Marcelo em 24/10 ("o sentido da corrente sempre do + pro −
… podíamos deixar lá como está e mostrar no nosso o certo"). O Gecko mede toda corrente do terminal 1 para o 2, por dentro
do componente: na fonte de tensão (+ no terminal 1) a corrente que ela entrega dava negativa. O MaiSim a lê com o sinal
trocado (sentido_gerador): positiva quando sai pelo +. A fonte de corrente empurra do terminal 1 para o 2 e o Gecko já a mede
como gerador: sem troca. Confere: 10 V em 5 Ω → i_U = +2 A; 1 A em 10 Ω → i_I = +1 A e v = +10 V no terminal 2; a
corrente de um resistor não muda (a mesma convenção de antes)."""
import json, os, time, urllib.request
from pathlib import Path
import numpy as np
RAIZ_PROJ = str(Path(__file__).resolve().parents[2])   # a raiz do projeto (validacao → simu → raiz)
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(q, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read() or b"{}")}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
c = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
api("editor/novo", {"modo": "descartar"})
for a in (("U.1", 10, 10, "U"), ("R.1", 20, 10, "R"), ("I.1", 10, 30, "I"), ("R.2", 20, 30, "R"),
          ("AMP.1", 40, 6, "AMP"), ("AMP.2", 40, 10, "AMP"), ("AMP.3", 40, 26, "AMP"), ("VOLT.1", 40, 30, "VOLT")):
    c("CREATE", *a)
for n, i, o in (("U.1", "a", "gnd"), ("R.1", "a", "gnd"), ("I.1", "gnd", "b"), ("R.2", "b", "gnd")):
    c("INNODE", n, 0, i); c("OUTNODE", n, 0, o)
c("SETP", "U.1", "uDC", 10.0); c("SETP", "R.1", "R", 5.0); c("SETP", "I.1", "iMAX", 1.0); c("SETP", "R.2", "R", 10.0)
for amp, comp, canal in (("AMP.1", "U.1", "i_U"), ("AMP.2", "R.1", "i_R"), ("AMP.3", "I.1", "i_I")):
    api("editor/mede", {"nome": amp, "tipo": "I", "componente": comp}); c("OUTNODE", amp, 0, canal)
api("editor/mede", {"nome": "VOLT.1", "tipo": "V", "no1": "b", "no2": "gnd"}); c("OUTNODE", "VOLT.1", 0, "v_b")
api("editor/controle", {"controle": {"ativo": False, "Ts": 1e-4, "atuacoes": [], "parametros": [], "acionamentos": [], "controladores": []}})
j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.001", "nome": "fonte_gerador_api", "amostras": "100"})
while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.3); j = api("editor/rodada")
ok(j.get("estado") == "fim", f"rodada até o fim ({j.get('estado')} {j.get('erro', '')})")
d = {}
if j.get("estado") == "fim":
    p = j["arquivo"] if os.path.isabs(j["arquivo"]) else os.path.join(RAIZ_PROJ, j["arquivo"])
    z = np.load(p); d = {k: float(z[k][-1]) for k in ("i_U", "i_R", "i_I", "v_b") if k in z}
ok(abs(d.get("i_U", 0) - 2.0) < 1e-6, f"fonte de tensão como gerador: i_U = {d.get('i_U')} A (+2 A: 10 V em 5 Ω, saindo pelo +)")
ok(abs(d.get("i_R", 0) - 2.0) < 1e-6, f"resistor como antes (do terminal 1 para o 2): i_R = {d.get('i_R')} A")
ok(abs(d.get("i_I", 0) - 1.0) < 1e-6, f"fonte de corrente sem troca: i_I = {d.get('i_I')} A (o valor dela)")
ok(abs(d.get("v_b", 0) - 10.0) < 1e-6, f"a fonte de corrente empurra para o terminal 2: v_b = {d.get('v_b')} V (+10 V em 10 Ω)")
api("editor/novo", {"modo": "descartar"})
if j.get("estado") == "fim":
    import shutil; shutil.rmtree(os.path.dirname(p), ignore_errors=True)
print(f"\n{5 - falhas}/5")
raise SystemExit(1 if falhas else 0)
