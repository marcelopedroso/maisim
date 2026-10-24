# A control module (MaiSim / simu): controle.py (or another module) does `import <name>` and calls it, in the same sample,
# with no delay — it runs in the caller's process. Contract of every module: iniciar(p) → the module's state (a dictionary
# of yours); passo(entrada, p, estado) → the output. scope("name", value) works here too.


def iniciar(p):
    return {}


def passo(entrada, p, estado):
    return entrada
