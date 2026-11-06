# pll — biblioteca do MaiSim: o PLL trifásico no referencial síncrono (SRF-PLL), para conversores ligados à rede.
# Clarke (abc → αβ, invariante em amplitude), Park (αβ → dq) com o ângulo da amostra e o PI (pi.py) zerando vq:
# ω = 2π·f_nominal + PI(vq). Com va = Vm·cos(θ), trava com vd = Vm e vq = 0. As mesmas contas, na mesma ordem, do pll.c.
# Os ganhos valem para vq em volts: um ponto de partida é kp = 2·ζ·ωn/Vm e ki = ωn²/Vm (ζ ≈ 0,7, ωn ≈ 2π·20 Hz).
# Uso, no controle.py:
#   import pll
#   no iniciar: e["pll"] = pll.iniciar(f_nominal=60.0, kp=0.5, ki=50.0, ts=p["Ts"], desvio_max=10.0)
#   no passo:   th = pll.passo(e["pll"], m["v_a"], m["v_b"], m["v_c"])   # o ângulo desta amostra; e e["pll"]["vd"], ["vq"], ["w"]
import math

import pi


def iniciar(f_nominal, kp, ki, ts, desvio_max=10.0):
    desvio = 2.0 * math.pi * desvio_max  # o quanto ω pode sair do nominal, em rad/s
    w0 = 2.0 * math.pi * f_nominal
    return {"w0": w0, "ts": ts, "pi": pi.iniciar(kp, ki, ts, -desvio, desvio), "theta": 0.0, "w": w0, "vd": 0.0, "vq": 0.0}


def passo(estado, va, vb, vc):
    alfa = (2.0 / 3.0) * (va - 0.5 * vb - 0.5 * vc)
    beta = (vb - vc) / math.sqrt(3.0)
    th = estado["theta"]
    s = math.sin(th)
    c = math.cos(th)
    estado["vd"] = alfa * c + beta * s
    estado["vq"] = -alfa * s + beta * c
    estado["w"] = estado["w0"] + pi.passo(estado["pi"], estado["vq"])
    proximo = th + estado["w"] * estado["ts"]
    if proximo >= 2.0 * math.pi:
        proximo = proximo - 2.0 * math.pi
    elif proximo < 0.0:
        proximo = proximo + 2.0 * math.pi
    estado["theta"] = proximo
    return th
