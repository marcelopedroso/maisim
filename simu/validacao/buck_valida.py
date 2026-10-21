import json, time, urllib.request, sys
import numpy as np
B = "http://localhost:8768/pew/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=600).read())
    except urllib.error.HTTPError as e: return {"ERRO": json.loads(e.read())}
j = api("editor/rodar", {"dt": "1e-06", "tfim": "0.01", "nome": sys.argv[1], "amostras": "100000"})
while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.5); j = api("editor/rodada")
print("estado", j.get("estado"), j.get("erro"), "· segundos", j.get("segundos"), "· avisos", j.get("avisos"), "· pasta", j["arquivo"].rsplit("/", 1)[0])
d = np.load(j["arquivo"]); t, v, i, dd = d["t"], d["v_sw"], d["i_L"], d["d"]
meta = json.loads(str(d["meta"])); print("meta.controle", {k: meta["controle"][k] for k in ("Ts", "atraso_passos", "escrita_passos", "destinos")})
print("colunas", list(d.keys()))
for a, b, ir in ((4e-3, 5e-3, 10), (9e-3, 10e-3, 15)):
    m = (t >= a) & (t < b)
    print(f"  {a*1e3:.0f}–{b*1e3:.0f} ms: ⟨i_L⟩ {i[m].mean():.3f} A (ref {ir}) · ondulação {i[m].max()-i[m].min():.2f} A · d {np.nanmean(dd[m]):.3f} · ⟨v_sw⟩ {v[m].mean():.2f} V · ⟨i_med⟩ {np.nanmean(d['i_med'][m]):.3f}")
print("  v_sw: valores entre 1 e 95 V:", int(((v > 1) & (v < 95)).sum()), "de", len(v), "· mín", round(v.min(), 3), "máx", round(v.max(), 3))
up = np.where((v[1:] > 50) & (v[:-1] < 50))[0]; print("  períodos de chaveamento (µs):", sorted(set(np.round(np.diff(t[up + 1]) * 1e6, 3))))
np.savez("buck_ultima.npz", **{k: d[k] for k in d.keys()})
