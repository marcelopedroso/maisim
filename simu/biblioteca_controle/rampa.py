# rampa — biblioteca do MaiSim: o limitador de taxa (rampa) da referência, para uma partida suave.
# A saída anda no máximo taxa·Ts por amostra até a referência. As mesmas contas, na mesma ordem, do rampa.c.
# Uso, no controle.py (taxa em unidades por segundo, por exemplo A/s):
#   import rampa
#   no iniciar: e["rampa"] = rampa.iniciar(taxa=1000.0, ts=p["Ts"])
#   no passo:   ref = rampa.passo(e["rampa"], p["i_ref"])


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
