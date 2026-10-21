# Exemplo do PEW: buck com o PWM feito aqui no controle.py, e um PI de corrente atualizado uma vez por período.
#
# A cada Ts (no painel: 2 µs, com Δt = 1 µs), o código:
#   1. gera a portadora dente de serra (0 → 1, a fsw) a partir do tempo t;
#   2. soma i_L para tirar a média do período de chaveamento (a média de um período tira a ondulação);
#   3. no começo de cada período, roda o PI sobre a média do período anterior e calcula o ciclo de trabalho d;
#   4. compara a portadora com d e devolve o comando da chave: g = 1 (S.1 liga) ou 0 (desliga).
# A atuação "g" é o CONST.1, que entra no GATE.1, acoplado à chave S.1 (liga com entrada > 0,5).
#
# Ts define a resolução do PWM: d só muda em passos de Ts·fsw (aqui, 2 µs × 5 kHz = 1 %), e as bordas da chave caem
# na grade de Ts. Ts menor = PWM mais fino, mas mais chamadas de passo() (e a rodada demora mais).

def iniciar(p, e):
    e["periodo"] = -1      # índice do período de chaveamento em curso
    e["soma"] = 0.0        # soma de i_L no período (para a média)
    e["n"] = 0
    e["integral"] = 0.0
    e["d"] = 0.0           # ciclo de trabalho em uso
    e["i_med"] = 0.0       # média de i_L no último período


def passo(t, m, p, e):
    fsw = p["fsw"]
    k = int(t * fsw + 1e-9)                 # período de chaveamento atual (o 1e-9 evita erro de arredondamento na borda)
    portadora = t * fsw - k                 # dente de serra, 0 → 1

    if k != e["periodo"]:                   # começou um período novo: PI sobre a média do anterior
        if e["n"] > 0:
            i_med = e["soma"] / e["n"]
            erro = p["i_ref"] - i_med
            integral = e["integral"] + erro / fsw
            d = (p["Kp"] * erro + p["Ki"] * integral) / p["Vdc"]
            if 0.0 <= d <= p["dmax"]:       # anti-windup: só integra fora da saturação
                e["integral"] = integral
            e["d"] = min(p["dmax"], max(0.0, d))
            e["i_med"] = i_med
        e["periodo"], e["soma"], e["n"] = k, 0.0, 0

    e["soma"] += m["i_L"]
    e["n"] += 1

    g = 1.0 if portadora < e["d"] else 0.0  # PWM: a chave fica ligada enquanto a portadora está abaixo de d
    scope("portadora", portadora)            # scope(): os mesmos nomes em toda amostra (as colunas se fixam na 1ª)
    scope("d", e["d"])
    scope("i_med", e["i_med"])
    return {"g": g}
