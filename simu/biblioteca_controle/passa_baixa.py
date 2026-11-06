# passa_baixa — biblioteca do MaiSim: o filtro passa-baixa digital de 1ª ordem (Euler para trás), para uma medida ruidosa.
# y += a·(x − y), com a = Ts / (Ts + 1/(2π·fc)). As mesmas contas, na mesma ordem, do passa_baixa.c.
# Uso, no controle.py:
#   import passa_baixa
#   no iniciar: e["filtro_v"] = passa_baixa.iniciar(fc=500.0, ts=p["Ts"])
#   no passo:   v = passa_baixa.passo(e["filtro_v"], m["v_o"])
import math


def iniciar(fc, ts, inicial=0.0):
    return {"a": ts / (ts + 1.0 / (2.0 * math.pi * fc)), "y": inicial}


def passo(estado, x):
    estado["y"] = estado["y"] + estado["a"] * (x - estado["y"])
    return estado["y"]
