"""Referência independente do buck com o PWM do controle: o mesmo código de controle (reimplementado aqui), o circuito
resolvido por Euler implícito a cada Δt (o solverType 0 do Gecko), a chave ideal (rON) e o diodo (uF + rON, bloqueia i < 0).
Semântica do MaiSim (atraso "logo"): a amostra k é em t = k·Ts = k·n·Δt, mede i[k·n]; a atuação vale do passo k·n + 1 em diante."""
import json, sys, math
import numpy as np
d = np.load(sys.argv[1]); P = json.loads(sys.argv[2]); EV = json.loads(sys.argv[3]) if len(sys.argv) > 3 else []
dt, n = 1e-6, 2
ATRASO_CHAVE = int(sys.argv[4]) if len(sys.argv) > 4 else 1   # a partir de qual passo do período a atuação vale na chave
Vdc, L, R, rS, rD, uF = 100.0, 1e-3, 2.0, 0.01, 0.01, 0.6
N = int(round(float(d["t"][-1]) / dt)); K = N // n
fsw = P["fsw"]
i = np.zeros(N + 1); gs = np.zeros(K + 1)
st = dict(periodo=-1, soma=0.0, n=0, integral=0.0, d=0.0)
g_ant = g = 0.0
def passo_rl(i0, v, Rt):                           # Euler implícito (solverType 0 do Gecko): L·(i1 − i0)/Δt = v − Rt·i1
    return (i0 + v * dt / L) / (1 + Rt * dt / L)
for k in range(K):
    t = k * n * dt
    p = dict(P)
    for q in EV:                                   # p[...] na 1ª amostra com t ≥ t do acionamento
        if k >= -(-round(q["t"] / dt) // n): p[q["alvo"].split(":")[1]] = q["valor"]
    kk = int(t * fsw + 1e-9); port = t * fsw - kk
    if kk != st["periodo"]:
        if st["n"] > 0:
            im = st["soma"] / st["n"]; erro = p["i_ref"] - im; integ = st["integral"] + erro / fsw
            dd = (p["Kp"] * erro + p["Ki"] * integ) / p["Vdc"]
            if 0.0 <= dd <= p["dmax"]: st["integral"] = integ
            st["d"] = min(p["dmax"], max(0.0, dd))
        st["periodo"], st["soma"], st["n"] = kk, 0.0, 0
    st["soma"] += i[k * n]; st["n"] += 1
    g_ant, g = g, (1.0 if port < st["d"] else 0.0); gs[k] = g
    for o in range(n):
        j = k * n + o
        on = (g if o >= ATRASO_CHAVE else g_ant) > 0.5
        if on: i[j + 1] = passo_rl(i[j], Vdc, R + rS)
        else:
            x = passo_rl(i[j], -uF, R + rD) if i[j] > 0 else 0.0
            i[j + 1] = max(0.0, x)
iL = d["i_L"][:K]; ir = i[::n][:K]
e = np.abs(iL - ir); print(f"max|i_L(Gecko) − i_L(referência)| = {e.max():.3e} A (em {K} amostras; |i_L| até {np.abs(ir).max():.1f} A) · no instante {d['t'][e.argmax()]*1e3:.4f} ms")
print("comando g igual em todas as amostras:", np.array_equal(d["g"][1:K], gs[:K - 1]), "(g medido em t_k = o escrito na amostra k−1)")
# a mesma referência com o atraso errado (atuação já no passo k·n): o teste tem que enxergar a diferença
gk = d["g"][:K + 1]
dif = np.where(gk[1:K] != gs[:K - 1])[0]
print("1ª divergência do g na amostra", dif[:5], "t(us)", d["t"][dif[:5] + 1] * 1e6 if len(dif) else "")
e1 = np.where(e > 1e-3)[0]; print("1º erro > 1e-3 A na amostra", e1[:3], "t(us)", d["t"][e1[:3]] * 1e6 if len(e1) else "")
for k0 in (list(e1[:1]) or [0]):
    for k in range(max(0, k0 - 4), k0 + 4): print(k, f"t={d['t'][k]*1e6:.0f}us g_gecko={gk[k]:.0f} g_ref(k-1)={gs[k-1] if k else 0:.0f} iG={iL[k]:.5f} iR={ir[k]:.5f} vsw={d['v_sw'][k]:.3f}")
