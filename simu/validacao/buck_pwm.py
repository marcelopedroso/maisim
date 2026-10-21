# Buck com o PWM feito aqui: portadora dente de serra a fsw comparada com o ciclo de trabalho d.
def iniciar(p, e):
    e["periodo"] = -1


def passo(t, m, p, e):
    k = int(t * p["fsw"] + 1e-9)          # período de chaveamento atual
    portadora = t * p["fsw"] - k          # dente de serra, 0 → 1
    g = 1.0 if portadora < p["d"] else 0.0
    scope("portadora", portadora)
    return {"g": g}
