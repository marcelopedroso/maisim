"""Atraso através do terminal de subcircuito (exemplo da cascata): CONST_S1 (folha principal) → SUBCIRCUIT.1 → GATE dentro do SM.
Rodada sem controle; um acionamento vira CONST_S1 em t = 8 µs (passo j = 8); compara com a rodada sem acionamento:
a primeira amostra diferente diz em que passo o circuito sentiu (amostra j+1 → passo j)."""
import json, time, urllib.request
import numpy as np
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=600).read())
    except urllib.error.HTTPError as e: return {"ERRO": json.loads(e.read())}
api("editor/abrir", {"arq": "exemplos/exemplo_cascata_hb.ipes", "descartar": True})
v0 = float(api("editor/params?nome=CONST_S1")[0]["valor"]); print("CONST_S1 =", v0)
def roda(acs):
    cfg = {"ativo": False, "Ts": 1e-6, "atuacoes": [], "parametros": [], "codigo": "def passo(t, m, p, e):\n    return {}\n",
           "atraso": {"modo": "logo", "tempo": 0}, "acionamentos": acs}
    r = api("editor/controle", {"controle": cfg}); assert "ERRO" not in r, r
    j = api("editor/rodar", {"dt": "1e-06", "tfim": "2e-05", "nome": "atraso_sub", "amostras": "100000"})
    while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.2); j = api("editor/rodada")
    assert j["estado"] == "fim", j
    d = np.load(j["arquivo"]); return {k: d[k] for k in d.keys() if k != "meta"}, j.get("avisos")
a, _ = roda([])
b, av = roda([{"t": 8e-6, "alvo": "CONST:EXT_S1", "valor": 1.0 - v0}])
print("avisos:", av)
dif = {k: int(np.argmax(np.abs(a[k] - b[k]) > 0)) for k in a if k not in ("t", "EXT_S1") and np.any(np.abs(a[k] - b[k]) > 0)}   # o circuito (não o CONST)
prim = min(dif.values()) if dif else None
print("primeira amostra diferente no circuito:", prim, "(t =", a["t"][prim] * 1e6 if prim is not None else None, "µs) →",
      f"sentiu no passo {prim - 1} (pedido: 8) · {'OK' if prim == 9 else 'FALHA'}" if prim else "", "· sinais:", sorted(dif.items(), key=lambda x: x[1])[:6])
