# Circuit control (MaiSim / simu). MaiSim calls iniciar() once and passo() every Ts:
#   t  time (s) of the sample
#   m  measurements at time t: m["name in the scope"] (the meters and the outputs of the control blocks)
#   p  parameters from the panel: p["name"]; p["Ts"] is the effective sampling period
#   e  your state: keep whatever you want from one sample to the next (integrals, previous values…)
# passo() returns the actuations {actuator name: value}, written to the CONST blocks marked as actuation. The circuit feels
# the actuation at t + d·Δt (d in the panel: right away = 1 Δt, sample = Ts, or a latency) and it holds until the next one.
# scope("name", value) sends a variable of yours to the scope (the same names in every sample); print() goes to the output.
# One sample, as in a DSP: reading (ADC and sensors) → control → writing (PWM/DAC). The other .py files in the tree are
# modules: import them and call them here (or from inside another module), in any order you like — they run in this
# process, in the SAME sample, with no delay. Full guide (time, Ts × Δt, modules, caveats, examples): the panel's "?", or
# GUIA_CONTROLE.en.md.
import leitura
import escrita


def iniciar(p, e):
    e["leitura"] = leitura.iniciar(p)
    e["escrita"] = escrita.iniciar(p)


def passo(t, m, p, e):
    x = leitura.passo(m, p, e["leitura"])        # 1. read: the processed measurements (see leitura.py)
    u = {}                                       # 2. control: from x, compute the actuations {actuator name: value}
    return escrita.passo(u, p, e["escrita"])     # 3. write: the actuator's limits (see escrita.py)
