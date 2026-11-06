# pll — MaiSim library: the three-phase PLL in the synchronous reference frame (SRF-PLL), for grid-tied converters.
# Clarke (abc → αβ, amplitude-invariant), Park (αβ → dq) with the sample's angle, and the PI (pi.py) driving vq to zero:
# ω = 2π·f_nominal + PI(vq). With va = Vm·cos(θ), it locks with vd = Vm and vq = 0. The same operations, in the same order, as pll.c.
# The gains are for vq in volts: a starting point is kp = 2·ζ·ωn/Vm and ki = ωn²/Vm (ζ ≈ 0.7, ωn ≈ 2π·20 Hz).
# Use, in controle.py:
#   import pll
#   in iniciar: e["pll"] = pll.iniciar(f_nominal=60.0, kp=0.5, ki=50.0, ts=p["Ts"], desvio_max=10.0)
#   in passo:   th = pll.passo(e["pll"], m["v_a"], m["v_b"], m["v_c"])   # the angle of this sample; also e["pll"]["vd"], ["vq"], ["w"]
import math

import pi


def iniciar(f_nominal, kp, ki, ts, desvio_max=10.0):
    desvio = 2.0 * math.pi * desvio_max  # how far ω may move from nominal, in rad/s
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
