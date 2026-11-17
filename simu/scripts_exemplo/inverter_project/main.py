"""Projeto: inversor monofásico com carga RL / Project: single-phase inverter with an RL load.

pt: um exemplo de projeto em pastas: este script importa as funções da pasta libs/ ao lado dele, como num projeto
    Python comum (from libs import ...). Ponte completa com PWM unipolar de 5 kHz alimentando uma carga RL; no Scope:
    a tensão de saída, a corrente e a corrente esperada em regime (fasor). Nos seus scripts, uma pasta libs/ na raiz
    também serve a todos os scripts.
en: an example of a project in folders: this script imports functions from the libs/ folder next to it, as in a plain
    Python project (from libs import ...). Full bridge with 5 kHz unipolar PWM feeding an RL load; in the Scope: the
    output voltage, the current and the expected steady-state current (phasor). In your scripts, a libs/ folder at the
    top also serves every script.
"""
import numpy as np
import maisim
from libs import modulation
from libs.load import RLLoad

Vdc, m = 200.0, 0.9          # pt: barramento (V) e índice de modulação / en: DC link (V) and modulation index
f1, fp = 60.0, 5000.0        # pt: fundamental e portadora (Hz) / en: fundamental and carrier (Hz)
R, L = 10.0, 20e-3           # pt: a carga / en: the load
ciclos, dt = 5, 2e-6

load = RLLoad(R, L)
n = int(round(ciclos / f1 / dt))
t, v, i = np.empty(n), np.empty(n), np.empty(n)
for k in range(n):
    t[k] = k * dt
    ref = m * np.sin(2 * np.pi * f1 * t[k])
    _, _, u = modulation.spwm_unipolar(ref, modulation.triangle(t[k], fp))
    v[k] = Vdc * u
    i[k] = load.step(v[k], dt)

Z = complex(R, 2 * np.pi * f1 * L)                   # pt: o fasor da fundamental / en: the fundamental phasor
i_regime = m * Vdc / abs(Z) * np.sin(2 * np.pi * f1 * t - np.angle(Z))

maisim.scope("inverter_rl", t, {"v": v, "i": i, "i_steady": i_regime}, panels=[["v"], ["i", "i_steady"]])

ultimo = t >= (ciclos - 1) / f1
print(f"corrente de pico no último ciclo / peak current in the last cycle: {i[ultimo].max():.2f} A "
      f"(fasor / phasor: {m * Vdc / abs(Z):.2f} A)")
