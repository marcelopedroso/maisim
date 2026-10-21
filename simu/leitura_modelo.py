# Leitura (um módulo): o que o ADC e os sensores entregam ao controle. O controle.py chama leitura.passo(m, p, estado) no
# começo de cada amostra. Aqui entram os limites da medição: ganho e offset do sensor, faixa e resolução do ADC
# (quantização), saturação, um filtro digital… (o filtro analógico anti-aliasing é do circuito: monte-o lá).
# Contrato de todo módulo do PEW: iniciar(p) → o estado do módulo; passo(entrada, p, estado) → a saída.


def iniciar(p):
    return {}


def passo(m, p, estado):
    return dict(m)                               # por enquanto, as medidas como vieram (ideais)
