"""PWM senoidal / Sinusoidal PWM.

pt: três ciclos de uma senoide de 60 Hz comparada, passo a passo, com uma portadora triangular de 1 kHz; o pulso vale 1
    quando a referência está acima da portadora. No Scope: a referência e a portadora num painel, o pulso no outro.
en: three cycles of a 60 Hz sine compared, step by step, with a 1 kHz triangular carrier; the pulse is 1 while the
    reference is above the carrier. In the Scope: the reference and the carrier in one panel, the pulse in the other.
"""
import numpy as np
import maisim

f_ref = 60.0            # pt: frequência da referência (Hz) / en: reference frequency (Hz)
f_port = 1000.0         # pt: frequência da portadora (Hz) / en: carrier frequency (Hz)
m = 0.8                 # pt: índice de modulação / en: modulation index
ciclos = 3              # pt: ciclos de 60 Hz simulados / en: 60 Hz cycles simulated
dt = 1e-6               # pt: passo (s) / en: time step (s)

n = int(round(ciclos / f_ref / dt))
t = np.empty(n)
ref = np.empty(n)
port = np.empty(n)
pulso = np.empty(n)

for k in range(n):                                   # pt: um passo de cada vez / en: one step at a time
    t[k] = k * dt
    ref[k] = m * np.sin(2 * np.pi * f_ref * t[k])
    fase = (t[k] * f_port) % 1.0                     # pt: fase da portadora em [0, 1) / en: carrier phase in [0, 1)
    port[k] = 4 * fase - 1 if fase < 0.5 else 3 - 4 * fase   # pt: triangular entre -1 e 1 / en: triangle from -1 to 1
    pulso[k] = 1.0 if ref[k] > port[k] else 0.0

maisim.scope("sine_pwm", t, {"ref": ref, "carrier": port, "pulse": pulso},
             panels=[["ref", "carrier"], ["pulse"]])

print(f"{n} passos / steps, dt = {dt:g} s, t final = {t[-1]:.4f} s")
print(f"ciclo de trabalho médio / mean duty cycle: {pulso.mean():.3f}")
