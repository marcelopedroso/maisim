# Controle do circuito (PEW / simu). O PEW chama iniciar() uma vez e passo() a cada Ts:
#   t  tempo (s) da amostra
#   m  medidas no instante t: m["nome no scope"] (os medidores e as saídas dos blocos de controle)
#   p  parâmetros da tela: p["nome"]; p["Ts"] é o período de amostragem efetivo
#   e  estado seu: guarde o que quiser de uma amostra para a outra (integrais, valores anteriores…)
# passo() devolve as atuações {nome do atuador: valor}, escritas nos blocos CONST marcados como atuação. O circuito sente
# a atuação em t + d·Δt (d no painel: logo = 1 Δt, amostra = Ts, ou uma latência) e ela fica até a próxima.
# scope("nome", valor) manda uma variável sua para o scope (os mesmos nomes em toda amostra); print() vai para a saída.
# Uma amostra, como num DSP: leitura (ADC e sensores) → controle → escrita (PWM/DAC). Os outros .py da árvore são
# módulos: importe e chame aqui (ou de dentro de outro módulo), na ordem que quiser — rodam neste processo, na MESMA
# amostra, sem atraso. Guia completo (tempo, Ts × Δt, módulos, cuidados, exemplos): o "?" do painel, ou GUIA_CONTROLE.md.
import leitura
import escrita


def iniciar(p, e):
    e["leitura"] = leitura.iniciar(p)
    e["escrita"] = escrita.iniciar(p)


def passo(t, m, p, e):
    x = leitura.passo(m, p, e["leitura"])        # 1. ler: as medidas tratadas (veja leitura.py)
    u = {}                                       # 2. controlar: com x, calcule as atuações {nome do atuador: valor}
    return escrita.passo(u, p, e["escrita"])     # 3. escrever: os limites do atuador (veja escrita.py)
