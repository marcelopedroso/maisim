# Reading (a module): what the ADC and the sensors deliver to the control. controle.py calls leitura.passo(m, p, estado) at
# the start of every sample. The measurement's limits go here: sensor gain and offset, ADC range and resolution
# (quantization), saturation, a digital filter… (the analog anti-aliasing filter belongs to the circuit: build it there).
# Contract of every MaiSim module: iniciar(p) → the module's state; passo(entrada, p, estado) → the output.


def iniciar(p):
    return {}


def passo(m, p, estado):
    return dict(m)                               # for now, the measurements as they came (ideal)
