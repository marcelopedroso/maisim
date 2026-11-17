"""THD de uma ponte completa em PWM / THD of a full bridge with PWM.

pt: a tensão de saída de uma ponte completa com PWM senoidal unipolar (3 níveis: -Vdc, 0, Vdc), uma FFT sobre ciclos
    inteiros de 60 Hz, a fundamental, as harmônicas maiores e a THD. Aqui sem laço: o numpy faz tudo de uma vez.
    No Scope: a tensão PWM, a média móvel num período da portadora e a fundamental tirada da FFT.
en: the output voltage of a full bridge with unipolar sine PWM (3 levels: -Vdc, 0, Vdc), an FFT over whole 60 Hz cycles,
    the fundamental, the largest harmonics and the THD. No loop here: numpy does it all at once. In the Scope: the PWM
    voltage, the moving average over one carrier period and the fundamental taken from the FFT.
"""
import numpy as np
import maisim

Vdc = 400.0                  # pt: barramento (V) / en: DC link (V)
f1, fp = 60.0, 3000.0        # pt: fundamental e portadora (Hz) / en: fundamental and carrier (Hz)
m = 0.8
ciclos, dt = 4, 1e-6

t = np.arange(int(round(ciclos / f1 / dt))) * dt
ref = m * np.sin(2 * np.pi * f1 * t)
fase = (t * fp) % 1.0
port = np.where(fase < 0.5, 4 * fase - 1, 3 - 4 * fase)        # pt: triangular de -1 a 1 / en: triangle from -1 to 1
v = Vdc * ((ref > port).astype(float) - (-ref > port).astype(float))   # pt: as duas pernas / en: the two legs

X = np.fft.rfft(v) / len(v) * 2                      # pt: amplitudes de pico / en: peak amplitudes
f = np.fft.rfftfreq(len(v), dt)
k1 = int(round(f1 * len(v) * dt))                    # pt: o índice da fundamental / en: index of the fundamental
V1 = abs(X[k1])
harm = np.abs(X[k1 + 1:])
thd = np.sqrt(np.sum(harm ** 2)) / V1

janela = int(round(1 / fp / dt))
v_media = np.convolve(v, np.ones(janela) / janela, mode="same")
fund = np.abs(X[k1]) * np.cos(2 * np.pi * f1 * t + np.angle(X[k1]))

maisim.scope("pwm_thd", t, {"v": v, "v_avg": v_media, "fundamental": fund}, panels=[["v", "v_avg", "fundamental"]])

print(f"fundamental: {V1:.1f} V (esperado / expected m*Vdc = {m * Vdc:.1f} V)")
print(f"THD: {thd * 100:.1f} %")
print("maiores harmônicas / largest harmonics:")
for j in np.argsort(harm)[::-1][:5]:
    print(f"  {f[k1 + 1 + j]:7.0f} Hz: {harm[j]:6.1f} V ({harm[j] / V1 * 100:4.1f} %)")
