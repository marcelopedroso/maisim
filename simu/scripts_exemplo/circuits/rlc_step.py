"""RLC série no degrau / Series RLC step response.

pt: um degrau de 10 V num RLC série (ζ = 0,5), integrado passo a passo (Euler semi-implícito) e comparado com a solução
    analítica. No Scope: a tensão no capacitor (simulada e analítica) e a corrente.
en: a 10 V step on a series RLC (ζ = 0.5), integrated step by step (semi-implicit Euler) and compared with the analytical
    solution. In the Scope: the capacitor voltage (simulated and analytical) and the current.
"""
import numpy as np
import maisim

V = 10.0                     # pt: degrau (V) / en: step (V)
R, L, C = 10.0, 10e-3, 100e-6
dt, t_fim = 1e-6, 15e-3      # pt: passo e duração (s) / en: step and duration (s)

w0 = 1 / np.sqrt(L * C)      # pt: frequência natural (rad/s) / en: natural frequency (rad/s)
zeta = R / 2 * np.sqrt(C / L)
n = int(round(t_fim / dt))
t, vc, i_s = np.empty(n), np.empty(n), np.empty(n)
i = v = 0.0
for k in range(n):
    t[k], vc[k], i_s[k] = k * dt, v, i
    i += dt * (V - R * i - v) / L                    # pt: primeiro a corrente... / en: first the current...
    v += dt * i / C                                  # pt: ...depois a tensão, com a corrente nova / en: ...then the voltage

wd = w0 * np.sqrt(1 - zeta ** 2)                     # pt: subamortecido (ζ < 1) / en: underdamped (ζ < 1)
vc_analitico = V * (1 - np.exp(-zeta * w0 * t) * (np.cos(wd * t) + zeta / np.sqrt(1 - zeta ** 2) * np.sin(wd * t)))

maisim.scope("rlc_step", t, {"vc": vc, "vc_analytical": vc_analitico, "i": i_s}, panels=[["vc", "vc_analytical"], ["i"]])

print(f"w0 = {w0:.0f} rad/s, zeta = {zeta:.2f}, sobressinal / overshoot = {(vc.max() / V - 1) * 100:.1f} %")
print(f"maior diferença para a analítica / largest gap to the analytical: {np.abs(vc - vc_analitico).max() * 1e3:.2f} mV")
