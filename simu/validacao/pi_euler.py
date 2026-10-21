"""O resíduo de ~1e-4 A do PI no RL (passo 2) some com a referência por Euler implícito (o solverType 0 do Gecko)?"""
import math, json, glob
from pathlib import Path
import numpy as np
R, L, dt, Ts, tfim, Vmax = 1.0, 10e-3, 1e-6, 100e-6, 0.012, 100.0
n, N = int(round(Ts / dt)), int(round(tfim / dt))
wc = 2 * math.pi * 200; Kp, Ki = L * wc, R * wc
def ref(d, j_dist, k_ref, euler):
    a_ = math.exp(-R * dt / L)
    i = np.zeros(N + 1); integ, u_ant, u_k = 0.0, 0.0, 0.0
    for j in range(N):
        k, o = divmod(j, n)
        if o == 0:
            ir = 8.0 if k >= k_ref else 5.0
            erro = ir - i[j]; integ += erro * n * dt
            u_ant, u_k = u_k, max(-Vmax, min(Vmax, Kp * erro + Ki * integ))
        u = u_k if o >= d else u_ant
        v = 10.0 if (j_dist is not None and j >= j_dist) else 0.0
        i[j + 1] = (i[j] + (u - v) * dt / L) / (1 + R * dt / L) if euler else i[j] * a_ + ((u - v) / R) * (1 - a_)
    return i
j_dist, k_ref = int(round(7.0123e-3 / dt)), -(-int(round(5.03e-3 / dt)) // n)
for nome, d, jd, kr in (("A_logo", 1, None, 10**9), ("B_amostra", n, j_dist, k_ref)):
    arq = sorted(glob.glob(str(Path.home() / f".cache/maisim_teste/rodadas/*_{nome}/scope_{nome}.npz")))[-1]
    z = np.load(arq); iL = z["i_L"]; K = len(iL) - 1
    for euler in (False, True):
        e = np.max(np.abs(iL[:K] - ref(d, jd, kr, euler)[::n][:K]))
        print(f"{nome}: referência {'Euler implícito' if euler else 'exponencial exata'}: max|i_L − ref| = {e:.2e} A")
