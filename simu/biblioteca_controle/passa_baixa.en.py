# passa_baixa — MaiSim library: the first-order digital low-pass filter (backward Euler), for a noisy measurement.
# y += a·(x − y), with a = Ts / (Ts + 1/(2π·fc)). The same operations, in the same order, as passa_baixa.c.
# Use, in controle.py:
#   import passa_baixa
#   in iniciar: e["filtro_v"] = passa_baixa.iniciar(fc=500.0, ts=p["Ts"])
#   in passo:   v = passa_baixa.passo(e["filtro_v"], m["v_o"])
import math


def iniciar(fc, ts, inicial=0.0):
    return {"a": ts / (ts + 1.0 / (2.0 * math.pi * fc)), "y": inicial}


def passo(estado, x):
    estado["y"] = estado["y"] + estado["a"] * (x - estado["y"])
    return estado["y"]
