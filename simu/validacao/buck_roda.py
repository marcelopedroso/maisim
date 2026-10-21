"""Roda o buck com o PWM no controle.py e confere: v_sw só 0/Vdc (± quedas), fsw, ⟨i_L⟩, ondulação."""
import json, time, urllib.request, sys
import numpy as np
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=600).read())
    except urllib.error.HTTPError as e: return {"ERRO": json.loads(e.read())}
CODIGO = open(sys.argv[1]).read()
dt, Ts, tfim = float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
PAR = json.loads(sys.argv[5]); EV = json.loads(sys.argv[6]) if len(sys.argv) > 6 else []
cfg = {"ativo": True, "Ts": Ts, "atuacoes": ["g"], "parametros": [{"nome": k, "valor": v} for k, v in PAR.items()], "codigo": CODIGO,
       "atraso": {"modo": sys.argv[7] if len(sys.argv) > 7 else "logo", "tempo": 0}, "acionamentos": EV}
r = api("editor/controle", {"controle": cfg}); assert "ERRO" not in r and not r["erros"], r
t0 = time.time()
j = api("editor/rodar", {"dt": repr(dt), "tfim": repr(tfim), "nome": "buck_pwm", "amostras": "100000"})
while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.5); j = api("editor/rodada")
print("estado", j.get("estado"), j.get("erro"), "· segundos", j.get("segundos"), "· avisos", j.get("avisos"))
if j.get("saida_controle"): print("saída:", j["saida_controle"][-500:])
d = np.load(j["arquivo"]); print("colunas", list(d.keys()), "amostras", len(d["t"]))
np.savez("buck_ultima.npz", **{k: d[k] for k in d.keys()})
