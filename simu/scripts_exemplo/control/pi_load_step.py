"""Controle PI de velocidade com degrau de carga / PI speed control with a load step.

pt: um motor CC (modelo elétrico e mecânico) integrado passo a passo; um PI discreto de velocidade, amostrado a 1 kHz,
    com saturação da tensão e anti-windup, calcula a tensão do motor. Em t = 0,1 s a referência vai a 100 rad/s; em
    t = 1 s entra um torque de carga. No Scope: a velocidade e a referência, a corrente, a tensão e o torque de carga.
en: a DC motor (electrical and mechanical model) integrated step by step; a discrete speed PI, sampled at 1 kHz, with
    voltage saturation and anti-windup, sets the motor voltage. At t = 0.1 s the reference steps to 100 rad/s; at
    t = 1 s a load torque comes in. In the Scope: speed and reference, current, voltage and load torque.
"""
import numpy as np
import maisim

# pt: motor / en: motor
R, L = 1.0, 10e-3            # pt: resistência (Ω) e indutância (H) da armadura / en: armature resistance and inductance
K = 0.1                      # pt: constante de torque e de tensão (N·m/A = V·s/rad) / en: torque and back-EMF constant
J, B = 1e-3, 1e-4            # pt: inércia (kg·m²) e atrito viscoso (N·m·s) / en: inertia and viscous friction
# pt: controle / en: control
Ts = 1e-3                    # pt: período de amostragem do PI (s) / en: PI sampling period (s)
Kp, Ki = 0.8, 8.0            # pt: ganhos do PI (V·s/rad, V/rad) / en: PI gains
v_max = 24.0                 # pt: tensão máxima do conversor (V) / en: converter voltage limit (V)
# pt: ensaio / en: test
w_alvo, t_ref = 100.0, 0.1   # pt: degrau de referência (rad/s) e quando / en: reference step and when
T_c, t_carga = 0.2, 1.0      # pt: degrau de torque de carga (N·m) e quando / en: load torque step and when
dt, t_fim = 1e-5, 1.5        # pt: passo da planta e duração (s) / en: plant step and duration (s)

n = int(round(t_fim / dt))
a_cada = int(round(Ts / dt))  # pt: passos da planta por amostra do PI / en: plant steps per PI sample
t, w_ref, w_s, i_s, v_s, tc_s = (np.empty(n) for _ in range(6))
i = w = integ = v = 0.0

for k in range(n):
    tk = k * dt
    ref = w_alvo if tk >= t_ref else 0.0
    carga = T_c if tk >= t_carga else 0.0
    if k % a_cada == 0:                              # pt: o PI só roda na amostragem / en: the PI only runs at sampling
        erro = ref - w
        v_livre = Kp * erro + integ + Ki * Ts * erro
        v = min(max(v_livre, -v_max), v_max)
        if v == v_livre:                             # pt: anti-windup: integra só fora da saturação / en: anti-windup
            integ += Ki * Ts * erro
    i += dt * (v - R * i - K * w) / L                # pt: Euler, passo a passo / en: Euler, step by step
    w += dt * (K * i - B * w - carga) / J
    t[k], w_ref[k], w_s[k], i_s[k], v_s[k], tc_s[k] = tk, ref, w, i, v, carga

maisim.scope("pi_load_step", t, {"w_ref": w_ref, "w": w_s, "i": i_s, "v": v_s, "T_load": tc_s},
             panels=[["w_ref", "w"], ["i"], ["v"], ["T_load"]])

antes = w_s[int(0.99 / dt)]
queda = antes - w_s[int(t_carga / dt):].min()
print(f"velocidade antes da carga / speed before the load: {antes:.2f} rad/s")
print(f"queda com a carga / dip with the load: {queda:.2f} rad/s; no fim / at the end: {w_s[-1]:.2f} rad/s")
