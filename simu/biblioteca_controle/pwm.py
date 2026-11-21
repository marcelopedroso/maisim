# pwm — biblioteca do MaiSim: o PWM digital. As mesmas contas, na mesma ordem, do pwm.c. Dois jeitos:
#
# 1. O ePWM de um DSP (o contador a f_clk, os registradores nos parâmetros do painel, nomes do C2000):
#      f_clk      o clock do contador (TBCLK), em Hz
#      TBPRD      o período, em contagens
#      CTRMODE    0 = crescente (período TBPRD + 1), 1 = decrescente, 2 = sobe-desce (período 2·TBPRD, pulso centrado no zero)
#      SHDWAMODE  quando o CMPA escrito entra em vigor (registrador sombra): 0 = em CTR = 0, 1 = em CTR = PRD, 2 = nos dois
#      INTSEL     o evento que dispara a interrupção (o passo()): 1 = CTR = 0, 2 = CTR = PRD, 3 = os dois
#      DB         o tempo morto, em contagens (atrasa a subida da saída A e da complementar B)
#      TBPHS      a fase do contador, em contagens (opcional)
#    Com f_clk e TBPRD no painel, o MaiSim tira o Ts deles (o período, ou a metade com INTSEL 3). Uso, no controle.py:
#      import pwm
#      no iniciar: e["pwm"] = pwm.iniciar_registradores(p)
#      no passo:   a, b = pwm.pulsos(e["pwm"], t, CMPA)        # CMPA em contagens (ex.: d * p["TBPRD"])
#                  return {"g": a}                              # (e {"g_baixo": b}, a complementar com o tempo morto)
#    a e b são o pulso do intervalo inteiro, um valor por Δt (o padrão dentro da amostra): a saída fica em 1 enquanto o
#    contador está abaixo do CMPA em vigor. O CMPA escrito agora só vale no evento de carga seguinte (o atraso de uma
#    amostra do DSP). Use a Atuação "Logo": o atraso é o do registrador sombra.
#
# 2. O PWM comparado a cada Ts (o de antes; a resolução do PWM é o Ts):
#      no iniciar: e["pwm"] = pwm.iniciar(fsw=p["fsw"], portadora=pwm.SERRA)   # ou pwm.TRIANGULAR
#      no passo:   g = pwm.passo(e["pwm"], t, d)   # 1.0 ou 0.0; e["pwm"]["portadora"] vai ao scope
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


def iniciar_registradores(p):
    tbprd = float(p["TBPRD"])
    modo = int(p["CTRMODE"]) if "CTRMODE" in p else 2
    intsel = int(p["INTSEL"]) if "INTSEL" in p else 1
    e = {"tbprd": tbprd, "modo": modo, "shdw": int(p["SHDWAMODE"]) if "SHDWAMODE" in p else 0, "db": float(p["DB"]) if "DB" in p else 0.0,
         "periodo": 2.0 * tbprd if modo == 2 else tbprd + 1.0,
         "cps": float(p["dt"]) * float(p["f_clk"]),               # contagens por passo da simulação
         "dt": float(p["dt"]), "n": max(1, int(math.floor(float(p["Ts"]) / float(p["dt"]) + 0.5))),
         "cmpa": 0.0, "sombra": [], "bruto": 0, "borda": -1e300, "contador": 0.0}
    # o contador começa de modo que o evento da interrupção caia em t = k·Ts (no PRD, o contador adiantado de TBPRD)
    e["fase"] = (float(p["TBPHS"]) if "TBPHS" in p else 0.0) + (tbprd if intsel == 2 else 0.0)
    return e


def _contagem(e, j):
    return j * e["cps"] + e["fase"]


def _valor(e, N):
    x = N - e["periodo"] * math.floor(N / e["periodo"] + 1e-12)     # a posição no período, de 0 a período
    if e["modo"] == 2:
        return x if x <= e["tbprd"] else e["periodo"] - x
    if e["modo"] == 1:
        return e["tbprd"] - x
    return x


def _eventos(e, N):
    # quantos eventos de carga já passaram até a contagem N (o zero e/ou o PRD, conforme o SHDWAMODE)
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
    e["sombra"].append((_eventos(e, Nw), float(CMPA)))   # o CMPA escrito vai ao registrador sombra
    a, b = [], []
    for o in range(e["n"]):
        N = _contagem(e, k + 1 + o)                        # o passo k + 1 + o (o primeiro depois da escrita)
        ev = _eventos(e, N)
        while e["sombra"] and e["sombra"][0][0] < ev:      # um evento de carga depois da escrita: o CMPA entra em vigor
            if len(e["sombra"]) == 1 or e["sombra"][1][0] >= ev:
                e["cmpa"] = e["sombra"][0][1]
            e["sombra"].pop(0)
        c = _valor(e, N)
        # o comparador: liga quando o contador descendo chega ao CMPA (c ≤ CMPA) e desliga quando o contador subindo chega
        # a ele (c < CMPA): o pulso tem 2·CMPA contagens no sobe-desce e CMPA no crescente
        desce = e["modo"] == 1 or (e["modo"] == 2 and N - e["periodo"] * math.floor(N / e["periodo"] + 1e-12) >= e["tbprd"])
        bruto = 1 if (c <= e["cmpa"] if desce else c < e["cmpa"]) and e["cmpa"] > 0 else 0
        if bruto != e["bruto"]:
            e["bruto"], e["borda"] = bruto, N
        pronto = N - e["borda"] >= e["db"]                 # o tempo morto: a subida de cada saída espera DB contagens
        a.append(1.0 if bruto and pronto else 0.0)
        b.append(1.0 if (not bruto) and pronto else 0.0)
        e["contador"] = c
    return a, b
