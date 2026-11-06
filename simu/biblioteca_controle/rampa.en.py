# rampa — MaiSim library: the rate limiter (ramp) for the reference, for a soft start.
# The output moves at most rate·Ts per sample towards the reference. The same operations, in the same order, as rampa.c.
# Use, in controle.py (rate in units per second, e.g. A/s):
#   import rampa
#   in iniciar: e["rampa"] = rampa.iniciar(taxa=1000.0, ts=p["Ts"])
#   in passo:   ref = rampa.passo(e["rampa"], p["i_ref"])


def iniciar(taxa, ts, inicial=0.0):
    return {"passo_max": taxa * ts, "y": inicial}


def passo(estado, ref):
    dif = ref - estado["y"]
    if dif > estado["passo_max"]:
        estado["y"] = estado["y"] + estado["passo_max"]
    elif dif < -estado["passo_max"]:
        estado["y"] = estado["y"] - estado["passo_max"]
    else:
        estado["y"] = ref
    return estado["y"]
