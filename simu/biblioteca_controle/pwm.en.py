# pwm — MaiSim library: the digital PWM. The same operations, in the same order, as pwm.c. Two ways:
#
# 1. The ePWM of a DSP (the counter at f_clk, the registers in the panel parameters, C2000 names):
#      f_clk      the counter clock (TBCLK), in Hz
#      TBPRD      the period, in counts
#      CTRMODE    0 = up (period TBPRD + 1), 1 = down, 2 = up-down (period 2·TBPRD, pulse centered on zero)
#      SHDWAMODE  when the written CMPA takes effect (shadow register): 0 = at CTR = 0, 1 = at CTR = PRD, 2 = at both
#      INTSEL     the event that triggers the interrupt (passo()): 1 = CTR = 0, 2 = CTR = PRD, 3 = both
#      DB         the dead time, in counts (delays the rising edge of output A and of the complementary B)
#      TBPHS      the counter phase, in counts (optional)
#    With f_clk and TBPRD in the panel, MaiSim takes Ts from them (the period, or half of it with INTSEL 3). Use, in controle.py:
#      import pwm
#      in iniciar: e["pwm"] = pwm.iniciar_registradores(p)
#      in passo:   a, b = pwm.pulsos(e["pwm"], t, CMPA)        # CMPA in counts (e.g. d * p["TBPRD"])
#                  return {"g": a}                              # (and {"g_baixo": b}, the complementary with the dead time)
#    a and b are the pulse of the whole interval, one value per Δt (the pattern within the sample): the output is 1 while
#    the counter is below the CMPA in effect. The CMPA written now only takes effect at the next load event (the DSP's
#    one-sample delay). Use the "Right away" actuation: the delay is the shadow register's.
#
# 2. The PWM compared every Ts (the earlier one; the PWM resolution is Ts):
#      in iniciar: e["pwm"] = pwm.iniciar(fsw=p["fsw"], portadora=pwm.SERRA)   # or pwm.TRIANGULAR
#      in passo:   g = pwm.passo(e["pwm"], t, d)   # 1.0 or 0.0; e["pwm"]["portadora"] can go to the scope
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


def iniciar_registradores(p):
    tbprd = float(p["TBPRD"])
    modo = int(p["CTRMODE"]) if "CTRMODE" in p else 2
    intsel = int(p["INTSEL"]) if "INTSEL" in p else 1
    e = {"tbprd": tbprd, "modo": modo, "shdw": int(p["SHDWAMODE"]) if "SHDWAMODE" in p else 0, "db": float(p["DB"]) if "DB" in p else 0.0,
         "periodo": 2.0 * tbprd if modo == 2 else tbprd + 1.0,
         "cps": float(p["dt"]) * float(p["f_clk"]),               # counts per simulation step
         "dt": float(p["dt"]), "n": max(1, int(math.floor(float(p["Ts"]) / float(p["dt"]) + 0.5))),
         "cmpa": 0.0, "sombra": [], "bruto": 0, "borda": -1e300, "contador": 0.0}
    # the counter starts so that the interrupt event falls at t = k·Ts (at PRD, the counter advanced by TBPRD)
    e["fase"] = (float(p["TBPHS"]) if "TBPHS" in p else 0.0) + (tbprd if intsel == 2 else 0.0)
    return e


def _contagem(e, j):
    return j * e["cps"] + e["fase"]


def _valor(e, N):
    x = N - e["periodo"] * math.floor(N / e["periodo"] + 1e-12)     # the position in the period, from 0 to the period
    if e["modo"] == 2:
        return x if x <= e["tbprd"] else e["periodo"] - x
    if e["modo"] == 1:
        return e["tbprd"] - x
    return x


def _eventos(e, N):
    # how many load events have passed up to count N (zero and/or PRD, per SHDWAMODE)
    z = math.floor(N / e["periodo"] + 1e-12)
    pr = math.floor((N - e["tbprd"]) / e["periodo"] + 1e-12)
    if e["shdw"] == 0:
        return z
    if e["shdw"] == 1:
        return pr
    return z + pr


def pulsos(e, t, CMPA):
    k = int(math.floor(t / e["dt"] + 0.5))
    Nw = _contagem(e, k)
    e["sombra"].append((_eventos(e, Nw), float(CMPA)))   # the written CMPA goes to the shadow register
    a, b = [], []
    for o in range(e["n"]):
        N = _contagem(e, k + 1 + o)                        # step k + 1 + o (the first one after the write)
        ev = _eventos(e, N)
        while e["sombra"] and e["sombra"][0][0] < ev:      # a load event after the write: the CMPA takes effect
            if len(e["sombra"]) == 1 or e["sombra"][1][0] >= ev:
                e["cmpa"] = e["sombra"][0][1]
            e["sombra"].pop(0)
        c = _valor(e, N)
        # the comparator: sets when the down-counting counter reaches CMPA (c ≤ CMPA) and clears when the up-counting counter
        # reaches it (c < CMPA): the pulse has 2·CMPA counts in up-down and CMPA in up count
        desce = e["modo"] == 1 or (e["modo"] == 2 and N - e["periodo"] * math.floor(N / e["periodo"] + 1e-12) >= e["tbprd"])
        bruto = 1 if (c <= e["cmpa"] if desce else c < e["cmpa"]) and e["cmpa"] > 0 else 0
        if bruto != e["bruto"]:
            e["bruto"], e["borda"] = bruto, N
        pronto = N - e["borda"] >= e["db"]                 # the dead time: the rising edge of each output waits DB counts
        a.append(1.0 if bruto and pronto else 0.0)
        b.append(1.0 if (not bruto) and pronto else 0.0)
        e["contador"] = c
    return a, b
