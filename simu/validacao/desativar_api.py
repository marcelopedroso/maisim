"""Desativar um componente (instância de teste 7201), pedido de Marcelo em 19/10 ("um check: preparado no circuito, mas
desabilitado, na cor cinza"): o enabled do Gecko (0 desativado, 1 ativo, 2 em curto; gravado como enabledShorted). Confere:
SETP <comp> enabled 0 chega ao Gecko e ao arquivo (o MaiSim lê ativo = false), vale para bloco de controle, o Ctrl+Z volta, e
a SIMULAÇÃO o respeita: fonte de 10 V com dois resistores de 5 Ω em paralelo dá 4 A; com um desativado, 2 A."""
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
el = lambda r, n: next((e for e in r["folhas"]["0"]["elementos"] if e["nome"] == n), None)
api("editor/novo", {"modo": "descartar"})
for a in (("U.1", 10, 10, "U"), ("R.1", 20, 10, "R"), ("R.2", 30, 10, "R"), ("AMP.1", 40, 14, "AMP"), ("GAIN.1", 40, 4, "GAIN")):
    c("CREATE", *a)
for n in ("U.1", "R.1", "R.2"):
    c("INNODE", n, 0, "a"); c("OUTNODE", n, 0, "gnd")
c("SETP", "U.1", "uDC", 10.0); c("SETP", "R.1", "R", 5.0); c("SETP", "R.2", "R", 5.0)
c("OUTNODE", "AMP.1", 0, "i_U"); api("editor/mede", {"nome": "AMP.1", "tipo": "I", "componente": "U.1"})
api("editor/controle", {"controle": {"ativo": False, "Ts": 1e-4, "atuacoes": [], "parametros": [], "acionamentos": [], "controladores": []}})
def roda(nome):
    j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.001", "nome": nome, "amostras": "200"})
    while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.3); j = api("editor/rodada")
    if j.get("estado") != "fim": return None, j
    p = j["arquivo"] if os.path.isabs(j["arquivo"]) else os.path.join(RAIZ_PROJ, j["arquivo"])
    return float(np.abs(np.load(p)["i_U"][-1])), j
i0, j0 = roda("desativar_ambos")
ok(i0 is not None and abs(i0 - 4.0) < 0.01, f"os dois resistores: |i_U| = {i0} A (10 V / 2,5 Ω) {j0.get('erro', '')}")
r = c("SETP", "R.2", "enabled", 0)
e = el(r, "R.2")
ok(e and e["ativo"] is False and not e["curto"] and "enabledShorted 0" in e["bruto"], "SETP R.2 enabled 0: o MaiSim lê ativo = false (enabledShorted 0 no arquivo)")
i1, j1 = roda("desativar_um")
ok(i1 is not None and abs(i1 - 2.0) < 0.01, f"R.2 desativado: |i_U| = {i1} A (só o R.1) — o Gecko simula como se ele não existisse {j1.get('erro', '')}")
r = api("editor/desfazer", {})
ok(el(r, "R.2")["ativo"] is True, "Ctrl+Z: o R.2 volta ativo")
r = c("SETP", "GAIN.1", "enabled", 0)
ok(el(r, "GAIN.1")["ativo"] is False, "bloco de controle (GAIN.1) também desativa")
r = c("SETP", "R.1", "enabled", 2)
ok(el(r, "R.1")["curto"] is True and el(r, "R.1")["ativo"] is False, "em curto (enabled 2): o MaiSim lê curto = true")
api("editor/novo", {"modo": "descartar"})
print("falhas:", falhas)
raise SystemExit(1 if falhas else 0)
