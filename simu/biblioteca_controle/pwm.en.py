# pwm — MaiSim library: digital PWM, the carrier (sawtooth or triangular, 0 → 1) compared with the duty cycle.
# The same operations, in the same order, as pwm.c. The switch is on while the carrier is below the duty cycle.
# Use, in controle.py (with Ts much smaller than 1/fsw: the PWM resolution is Ts):
#   import pwm
#   in iniciar: e["pwm"] = pwm.iniciar(fsw=p["fsw"], portadora=pwm.SERRA)   # or pwm.TRIANGULAR
#   in passo:   g = pwm.passo(e["pwm"], t, d)   # 1.0 or 0.0; e["pwm"]["portadora"] can go to the scope
import math

SERRA = 0
TRIANGULAR = 1


def iniciar(fsw, portadora=SERRA):
    return {"fsw": fsw, "tipo": portadora, "portadora": 0.0}


def passo(estado, t, d):
    x = t * estado["fsw"]
    c = x - math.floor(x + 1e-9)  # the fraction of the period (1e-9 holds t·fsw that lands exactly on an integer)
    if estado["tipo"] == TRIANGULAR:
        c = 1.0 - abs(2.0 * c - 1.0)
    estado["portadora"] = c
    return 1.0 if c < d else 0.0
