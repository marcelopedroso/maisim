"""PWM multinível de 5 níveis / 5-level multilevel PWM.

pt: portadoras deslocadas em nível (disposição em fase, PD): quatro triangulares de 1 kHz, uma em cada faixa de
    [-1, 1]; a cada passo, o nível de saída é quantas portadoras a referência de 60 Hz passa, menos 2 (de -2 a 2).
    No Scope: a referência e as quatro portadoras num painel, o nível no outro.
en: level-shifted carriers (phase disposition, PD): four 1 kHz triangles, one in each band of [-1, 1]; at each step the
    output level is how many carriers the 60 Hz reference is above, minus 2 (from -2 to 2). In the Scope: the reference
    and the four carriers in one panel, the level in the other.
"""
import numpy as np
import maisim

f_ref = 60.0                 # pt: frequência da referência (Hz) / en: reference frequency (Hz)
f_port = 1000.0              # pt: frequência das portadoras (Hz) / en: carrier frequency (Hz)
m = 0.9                      # pt: índice de modulação / en: modulation index
ciclos = 3                   # pt: ciclos de 60 Hz / en: 60 Hz cycles
dt = 1e-6                    # pt: passo (s) / en: time step (s)
faixas = [(-1.0, -0.5), (-0.5, 0.0), (0.0, 0.5), (0.5, 1.0)]   # pt: uma portadora por faixa / en: one carrier per band

n = int(round(ciclos / f_ref / dt))
t = np.empty(n)
ref = np.empty(n)
port = np.empty((len(faixas), n))
nivel = np.empty(n)

for k in range(n):                                   # pt: um passo de cada vez / en: one step at a time
    t[k] = k * dt
    ref[k] = m * np.sin(2 * np.pi * f_ref * t[k])
    fase = (t[k] * f_port) % 1.0
    tri = 2 * fase if fase < 0.5 else 2 - 2 * fase   # pt: triangular de 0 a 1 / en: triangle from 0 to 1
    acima = 0
    for j, (baixo, alto) in enumerate(faixas):
        port[j, k] = baixo + (alto - baixo) * tri
        acima += ref[k] > port[j, k]
    nivel[k] = acima - 2

sinais = {"ref": ref, "level": nivel}
sinais.update({f"carrier{j + 1}": port[j] for j in range(len(faixas))})
maisim.scope("pwm_5_levels", t, sinais, panels=[["ref", "carrier1", "carrier2", "carrier3", "carrier4"], ["level"]])

for v in range(-2, 3):
    print(f"nível / level {v:+d}: {np.mean(nivel == v) * 100:5.1f} % do tempo / of the time")
