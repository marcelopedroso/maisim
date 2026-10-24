# Outro controlador do circuito (MaiSim / simu). Em "controladores" (no painel) ele ganha um nome, as medidas que lê (m) e
# as atuações que escreve; ou vale em subcircuitos (uma instância por subcircuito, com os nomes sem o prefixo).
#   envia("outro", {"x": valor})   manda uma mensagem a outro controlador (chega depois da latência da rede)
#   recebe()                       as mensagens que chegaram: [{"de": nome, "t": instante do envio, "dados": {...}}]
#   p["id"]                        o nome desta instância (p["subcircuito"]: o subcircuito dela)
# Guia completo: o "?" do painel.

def iniciar(p, e):
    pass


def passo(t, m, p, e):
    return {}
