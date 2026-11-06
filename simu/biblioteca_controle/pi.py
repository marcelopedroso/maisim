# pi — biblioteca do MaiSim: o controlador PI discreto, com saturação e anti-windup (integração condicional).
# As mesmas contas, na mesma ordem, do pi.c: o Comparar Python × C dá igual bit a bit.
# Uso, no controle.py:
#   import pi
#   no iniciar: e["pi"] = pi.iniciar(kp=p["Kp"], ki=p["Ki"], ts=p["Ts"], minimo=0.0, maximo=1.0)
#   no passo:   d = pi.passo(e["pi"], p["i_ref"] - m["i_L"])
# Dois laços (corrente e tensão)? Dois estados: e["pi_i"] e e["pi_v"], cada um com os seus ganhos.
# Cuidado: com `from math import pi` no mesmo arquivo, o nome pi vira o número; use math.pi.


def iniciar(kp, ki, ts, minimo, maximo, inicial=0.0):
    return {"kp": kp, "ki": ki, "ts": ts, "minimo": minimo, "maximo": maximo, "integral": inicial}


def passo(estado, erro):
    integral = estado["integral"] + estado["ki"] * estado["ts"] * erro
    u = estado["kp"] * erro + integral
    if u > estado["maximo"]:
        u = estado["maximo"]
        if erro > 0.0:
            integral = estado["integral"]  # saturado em cima: o integral não cresce mais (anti-windup)
    elif u < estado["minimo"]:
        u = estado["minimo"]
        if erro < 0.0:
            integral = estado["integral"]  # saturado embaixo: o integral não desce mais
    estado["integral"] = integral
    return u
