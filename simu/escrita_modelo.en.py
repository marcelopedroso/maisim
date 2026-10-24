# Writing (a module): what goes from the control to the circuit. controle.py calls escrita.passo(u, p, estado) at the end of
# every sample, with the computed actuations {actuator name: value}. The actuator's limits go here: duty-cycle or voltage
# saturation, PWM counter resolution… What passo() returns is what goes to the CONST blocks marked as actuation.
# Contract of every MaiSim module: iniciar(p) → the module's state; passo(entrada, p, estado) → the output.


def iniciar(p):
    return {}


def passo(u, p, estado):
    return dict(u)                               # no limits for now
