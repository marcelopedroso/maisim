# pi — MaiSim library: the discrete PI controller, with saturation and anti-windup (conditional integration).
# The same operations, in the same order, as pi.c: Compare Python × C gives bit-identical results.
# Use, in controle.py:
#   import pi
#   in iniciar: e["pi"] = pi.iniciar(kp=p["Kp"], ki=p["Ki"], ts=p["Ts"], minimo=0.0, maximo=1.0)
#   in passo:   d = pi.passo(e["pi"], p["i_ref"] - m["i_L"])
# Two loops (current and voltage)? Two states: e["pi_i"] and e["pi_v"], each with its own gains.
# Careful: with `from math import pi` in the same file, the name pi becomes the number; use math.pi.


def iniciar(kp, ki, ts, minimo, maximo, inicial=0.0):
    return {"kp": kp, "ki": ki, "ts": ts, "minimo": minimo, "maximo": maximo, "integral": inicial}


def passo(estado, erro):
    integral = estado["integral"] + estado["ki"] * estado["ts"] * erro
    u = estado["kp"] * erro + integral
    if u > estado["maximo"]:
        u = estado["maximo"]
        if erro > 0.0:
            integral = estado["integral"]  # saturated high: the integral stops growing (anti-windup)
    elif u < estado["minimo"]:
        u = estado["minimo"]
        if erro < 0.0:
            integral = estado["integral"]  # saturated low: the integral stops falling
    estado["integral"] = integral
    return u
