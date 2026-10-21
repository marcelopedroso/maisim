# Escrita (um módulo): o que vai do controle ao circuito. O controle.py chama escrita.passo(u, p, estado) no fim de cada
# amostra, com as atuações calculadas {nome do atuador: valor}. Aqui entram os limites do atuador: saturação do duty ou da
# tensão, resolução do contador do PWM… O que passo() devolve é o que vai aos blocos CONST marcados como atuação.
# Contrato de todo módulo do PEW: iniciar(p) → o estado do módulo; passo(entrada, p, estado) → a saída.


def iniciar(p):
    return {}


def passo(u, p, estado):
    return dict(u)                               # por enquanto, sem limites
