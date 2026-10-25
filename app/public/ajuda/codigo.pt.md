# Controle em Python

O painel de Controle (aba `</>` ou janela dedicada `?vista=codigo`) permite programar controladores digitais em Python que interagem dinamicamente com a simulação a cada período de amostragem $T_s$.

## Estrutura do código do controlador

Todo controlador define duas funções principais:

```python
def iniciar(p, e):
    e["integral"] = 0.0


def passo(t, m, p, e):
    erro = p["v_ref"] - m["v_out"]
    e["integral"] += erro * p["Ts"]
    u = p["Kp"] * erro + p["Ki"] * e["integral"]
    scope("u", u)
    return {"d": u}
```

- **iniciar(p, e):** executada uma única vez antes do primeiro instante de simulação para inicializar variáveis no dicionário de estado `e`.
- **passo(t, m, p, e):** executada periodicamente a cada $T_s$. Recebe o tempo atual `t`, as leituras dos sensores `m`, os parâmetros do painel `p` e o estado `e`.
- **scope(nome, valor):** envia variáveis internas do algoritmo em tempo real para visualização nos gráficos do osciloscópio.
- **Retorno:** devolve um dicionário `{atuador: valor}` conectando os valores de saída diretamente aos blocos de atuação (como fontes CONST) do circuito.

## Parâmetros e arquitetura

- **Taxa de amostragem ($T_s$):** frequência de execução do laço de controle e modelo de atraso de atuação configuráveis no cabeçalho do painel.
- **Tabela de parâmetros e acionamentos:** defina referências e ganhos de sintonia no painel; crie degraus e transições temporais programadas.
- **Divisão em arquivos:** separe a lógica em `leitura.py`, `controle.py` e `escrita.py`, ou importe módulos auxiliares escritos em Python padrão.
- **Diagrama em blocos:** o botão **◇ diagrama** gera uma representação visual clara de quais sinais estão sendo medidos, calculados e acionados.
