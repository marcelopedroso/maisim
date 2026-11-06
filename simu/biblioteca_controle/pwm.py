# pwm — biblioteca do MaiSim: o PWM digital, a portadora (dente de serra ou triangular, 0 → 1) comparada com o duty.
# As mesmas contas, na mesma ordem, do pwm.c. A chave fica ligada enquanto a portadora está abaixo do duty.
# Uso, no controle.py (com Ts bem menor que 1/fsw: a resolução do PWM é o Ts):
#   import pwm
#   no iniciar: e["pwm"] = pwm.iniciar(fsw=p["fsw"], portadora=pwm.SERRA)   # ou pwm.TRIANGULAR
#   no passo:   g = pwm.passo(e["pwm"], t, d)   # 1.0 ou 0.0; e["pwm"]["portadora"] vai ao scope
import math

SERRA = 0
TRIANGULAR = 1


def iniciar(fsw, portadora=SERRA):
    return {"fsw": fsw, "tipo": portadora, "portadora": 0.0}


def passo(estado, t, d):
    x = t * estado["fsw"]
    c = x - math.floor(x + 1e-9)  # a fração do período (o 1e-9 segura t·fsw que cai exato num inteiro)
    if estado["tipo"] == TRIANGULAR:
        c = 1.0 - abs(2.0 * c - 1.0)
    estado["portadora"] = c
    return 1.0 if c < d else 0.0
