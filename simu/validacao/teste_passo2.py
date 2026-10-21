"""Validação do passo 2 do Controle: atraso da atuação (logo / amostra / latência) e acionamentos no tempo (CONST e p),
com e sem o controle, contra uma referência independente (RL exato a cada Δt)."""
import json, math, time, urllib.request
import numpy as np
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": json.loads(e.read())}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
c = lambda op, args: api("editor/cmd", {"op": op, "args": args})
R, L, dt, Ts, tfim, Vmax = 1.0, 10e-3, 1e-6, 100e-6, 0.012, 100.0
n, N, a_ = int(round(Ts / dt)), int(round(tfim / dt)), math.exp(-R * dt / L)
wc = 2 * math.pi * 200; Kp, Ki = L * wc, R * wc
# circuito: U.1 (u_ctrl) → R → L → U.2 (v_dist, em série, contra) → gnd
api("editor/abrir", {"arq": "exemplos/exemplo_cascata_hb.ipes", "descartar": True}); api("editor/novo", {"descartar": True})
for a in (["U.1", 10, 10, "U"], ["R.1", 20, 10, "R"], ["L.1", 30, 10, "L"], ["U.2", 36, 10, "U"], ["CONST.1", 44, 6, "CONST"], ["CONST.2", 44, 9, "CONST"], ["AMP.1", 44, 13, "AMP"]): c("CREATE", a)
for nome, i, o in (("U.1", "a", "gnd"), ("R.1", "a", "b"), ("L.1", "b", "cc"), ("U.2", "cc", "gnd")): c("INNODE", [nome, 0, i]); c("OUTNODE", [nome, 0, o])
c("SETP", ["R.1", "R", R]); c("SETP", ["L.1", "L", L])
for k_, rot in (("CONST.1", "u_ctrl"), ("CONST.2", "v_dist")): c("SETP", [k_, "const", 0.0]); c("OUTNODE", [k_, 0, rot])
for u_, sig in (("U.1", "u_ctrl"), ("U.2", "v_dist")): r = api("editor/fonte_sinal", {"nome": u_, "sinal": sig}); assert "ERRO" not in r, r
c("OUTNODE", ["AMP.1", 0, "i_L"]); api("editor/mede", {"nome": "AMP.1", "tipo": "I", "componente": "L.1"})
CODIGO = '''def iniciar(p, e):
    e["integral"] = 0.0


def passo(t, m, p, e):
    erro = p["i_ref"] - m["i_L"]
    e["integral"] += erro * p["Ts"]
    scope("ref", p["i_ref"])
    return {"u_ctrl": max(-p["Vmax"], min(p["Vmax"], p["Kp"] * erro + p["Ki"] * e["integral"]))}
'''
PAR = [{"nome": "Kp", "valor": Kp}, {"nome": "Ki", "valor": Ki}, {"nome": "i_ref", "valor": 5.0}, {"nome": "Vmax", "valor": Vmax}]
EV = [{"t": 5.03e-3, "alvo": "p:i_ref", "valor": 8.0}, {"t": 7.0123e-3, "alvo": "CONST:v_dist", "valor": 10.0}]

def referencia(d, j_dist, k_ref, iref0=5.0, iref1=8.0, malha=True, j_u=None, u_ab=0.0):
    i = np.zeros(N + 1); integ, u_ant, u_k = 0.0, 0.0, 0.0
    for j in range(N):
        k, o = divmod(j, n)
        if malha and o == 0:
            ir = iref1 if k >= k_ref else iref0
            erro = ir - i[j]; integ += erro * n * dt
            u_ant, u_k = u_k, max(-Vmax, min(Vmax, Kp * erro + Ki * integ))
        u = (u_k if o >= d else u_ant) if malha else (u_ab if j >= j_u else 0.0)
        v = 10.0 if (j_dist is not None and j >= j_dist) else 0.0
        i[j + 1] = (i[j] + (u - v) * dt / L) / (1 + R * dt / L)      # Euler implícito (solverType 0 do Gecko)
    return i

def roda(nome, cfg):
    r = api("editor/controle", {"controle": cfg}); assert "ERRO" not in r and not r["erros"], r
    j = api("editor/rodar", {"dt": repr(dt), "tfim": repr(tfim), "nome": nome, "amostras": "100000"})
    while j.get("estado") in ("rodando", "pausada"): time.sleep(0.3); j = api("editor/rodada")
    return j

j_dist, k_ref = int(round(7.0123e-3 / dt)), -(-int(round(5.03e-3 / dt)) // n)
print(f"esperado: v_dist vale a partir do passo {j_dist} (t = {j_dist * dt * 1e3:.3f} ms); i_ref = 8 a partir da amostra {k_ref} (t = {k_ref * Ts * 1e3:.1f} ms)")
casos = [("A_logo", {"modo": "logo", "tempo": 0}, [], 1, None, 10**9),
         ("B_amostra", {"modo": "amostra", "tempo": 0}, EV, n, j_dist, k_ref),
         ("C_latencia_30us", {"modo": "tempo", "tempo": 30e-6}, EV, 30, j_dist, k_ref)]
for nome, atraso, ev, d, jd, kr in casos:
    j = roda(nome, {"ativo": True, "Ts": Ts, "atuacoes": ["u_ctrl"], "parametros": PAR, "codigo": CODIGO, "atraso": atraso, "acionamentos": ev})
    if j.get("estado") != "fim": ok(False, f"{nome}: {j.get('estado')} {j.get('erro')}"); continue
    dd = np.load(j["arquivo"]); iL, ref_ = dd["i_L"], dd["ref"]; K = len(ref_) - 1
    meta = json.loads(str(dd["meta"]))
    i_r = referencia(d, jd, kr)
    e_i = np.max(np.abs(iL[:K] - i_r[::n][:K]))
    ok(e_i < 1e-9, f"{nome}: atraso {meta['controle']['atraso_passos']} Δt · max|i_L − referência| = {e_i:.2e} A · acionamentos no meta {[(round(q['t']*1e3, 4), q['alvo']) for q in meta['acionamentos']]}")
    if ev:
        k_vis = int(np.argmax(ref_ > 6.5))
        ok(k_vis == k_ref, f"   p[\"i_ref\"] = 8 chega ao código na amostra {k_vis} (t = {dd['t'][k_vis]*1e3:.3f} ms)")
        # com o atraso trocado, a referência deixa de bater (o teste distingue os modos)
        e_err = np.max(np.abs(iL[:K] - referencia(1 if d != 1 else n, jd, kr)[::n][:K]))
        ok(e_err > 50 * e_i, f"   com o atraso errado na referência o erro vira {e_err:.2e} A (o teste enxerga a diferença)")
    vals = [float(api("editor/params?nome=" + b_)[0]["valor"]) for b_ in ("CONST.1", "CONST.2")]
    ok(vals == [0.0, 0.0], f"   CONST.1 e CONST.2 de volta ao valor de antes: {vals}")
# D: controle desligado; acionamento de CONST em malha aberta (u_ctrl = 10 V em 2,0007 ms) e um p[...] que deve ser ignorado com aviso
j_u = int(round(2.0007e-3 / dt))
j = roda("D_malha_aberta", {"ativo": False, "Ts": Ts, "atuacoes": ["u_ctrl"], "parametros": PAR, "codigo": CODIGO, "atraso": {"modo": "logo", "tempo": 0},
         "acionamentos": [{"t": 2.0007e-3, "alvo": "CONST:u_ctrl", "valor": 10.0}, {"t": 1e-3, "alvo": "p:i_ref", "valor": 1.0}]})
ok(j.get("estado") == "fim" and any("ignorado" in a for a in j.get("avisos", [])), f"D: rodada {j.get('estado')} · avisos {j.get('avisos')}")
dd = np.load(j["arquivo"]); t_, iL = dd["t"], dd["i_L"]
i_r = referencia(1, None, 10**9, malha=False, j_u=j_u, u_ab=10.0)
idx = np.rint(t_ / dt).astype(int)
e_i = np.max(np.abs(iL - i_r[np.clip(idx, 0, N)]))
ok(e_i < 1e-9, f"D: malha aberta, u_ctrl = 10 V a partir do passo {j_u}: max|i_L − referência| = {e_i:.2e} A em {len(t_)} amostras")
vals = [float(api("editor/params?nome=" + b_)[0]["valor"]) for b_ in ("CONST.1", "CONST.2")]
ok(vals == [0.0, 0.0], f"   CONST de volta: {vals}")
print("falhas:", falhas)
