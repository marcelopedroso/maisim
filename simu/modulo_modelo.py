# Um módulo do controle (MaiSim / simu): o controle.py (ou outro módulo) faz `import <nome>` e chama, na mesma amostra, sem
# atraso — roda no processo de quem chama. Contrato de todo módulo: iniciar(p) → o estado do módulo (um dicionário seu);
# passo(entrada, p, estado) → a saída. scope("nome", valor) funciona aqui também.


def iniciar(p):
    return {}


def passo(entrada, p, estado):
    return entrada
