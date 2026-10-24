# Another controller of the circuit (MaiSim / simu). In "controllers" (in the panel) it gets a name, the measurements it
# reads (m) and the actuations it writes; or it applies to subcircuits (one instance per subcircuit, with the names without
# the prefix).
#   envia("other", {"x": value})   sends a message to another controller (it arrives after the network latency)
#   recebe()                       the messages that arrived: [{"de": name, "t": time it was sent, "dados": {...}}]
#   p["id"]                        the name of this instance (p["subcircuito"]: its subcircuit)
# Full guide: the panel's "?".

def iniciar(p, e):
    pass


def passo(t, m, p, e):
    return {}
