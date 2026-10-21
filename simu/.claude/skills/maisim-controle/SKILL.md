---
name: maisim-controle
description: Escrever, revisar ou depurar o código de controle (controle.py) do painel Controle do MaiSim / simu, que roda em co-simulação com o GeckoCIRCUITS — passo(t, m, p, e), atuações em blocos CONST, Ts × Δt, atraso da atuação, acionamentos, PWM no código, e rodar/conferir simulações pela API HTTP do simu.
when_to_use: Quando o pedido envolver o controle.py do MaiSim, o painel Controle do /maisim/simu, um <modelo>.controle.json, uma rodada em ~/.local/share/maisim/rodadas/, ou como o controle conversa com a simulação no Gecko.
---

# Controle do MaiSim / simu (controle.py ↔ Gecko)

O guia completo é `simu/GUIA_CONTROLE.md`. Ele traz a linha do tempo, onde configurar cada coisa,
a tabela de atrasos medidos, a lista de conferência, os exemplos validados e a API HTTP. Leia-o antes de mudar código de
controle ou tirar conclusões sobre o tempo. O essencial:

## Contrato do código
- `iniciar(p, e)` roda uma vez. `passo(t, m, p, e)` roda a cada Ts e devolve `{atuador: valor}` (ou `None`).
- `m`: medidas em t (medidores e saídas de blocos de controle; dentro de um subcircuito, `Sub_1_<nome>` ou `<nome do subcircuito>_<nome>`). `p`: parâmetros do
  painel, mais `p["Ts"]` (o efetivo, n·Δt). `e`: estado seu entre amostras.
- Só as atuações marcadas no painel. Valores `float` finitos. Prazo de 5 s por `passo` e de 20 s para carregar + `iniciar`.
- `scope("nome", v)`: os mesmos nomes desde a 1ª amostra (as colunas se fixam nela). `print()` vai para `controle.log`.
- Roda com `python3 -I` num processo à parte; `math` e `scope` já vêm prontos; numpy disponível.
- Módulos (GUIA_CONTROLE.md §3.0.1): todo .py que não é controlador. O controller faz `import x` e chama na MESMA amostra,
  no mesmo processo, sem atraso. Contrato: `iniciar(p)` → estado; `passo(entrada, p, estado)` → saída. Circuito novo:
  `leitura.py` (ADC/sensores) → `controle.py` (orquestrador) → `escrita.py` (PWM/DAC, devolve as atuações). Use módulo para
  organizar; controlador só para emular outro DSP (≥ 1 amostra de atraso). Nome de módulo do Python, import inexistente ou
  de um controlador: erro. Tempo de cálculo é zero na amostra: o atraso real é o do painel. Ordem conferida (aviso): no
  passo(), leitura.passo() 1º, escrita.passo() por último e o return é o que ele devolve; cada módulo iniciado no iniciar().
- Vários controladores (GUIA_CONTROLE.md §3.1): `arquivos` (outros .py), `controladores` [{nome, arquivo, medidas,
  atuacoes, subcircuitos}] e `rede` {latencia} no `.controle.json`. Cada um num processo (isolado), todos calculando juntos
  a cada amostra; `m` só com as medidas dele (em subcircuito, sem o prefixo), atuação com dono único; `envia(para, dados)`
  e `recebe()`: chega na 1ª amostra depois do envio com t ≥ t + latência (nunca na mesma). Sem lista: o controle.py vê tudo.

## Tempo
- Ts = n·Δt, com n = round(Ts/Δt). Δt e o tempo final ficam no botão ⚙ ao lado do ▶ (ao abrir outro
  modelo, vêm os do `.ipes`).
- O circuito sente a atuação da amostra t em t + d·Δt (d: logo = 1, amostra = n, latência = round(τ/Δt)) em qualquer
  destino. O servidor compensa o atraso próprio do Gecko (chave direto no GATE 0; fonte 1; bloco no meio +1). O que não
  dá para compensar vira aviso.
- Acionamento de CONST em t vale a partir do passo round(t/Δt); de `p[...]`, na 1ª amostra com t_k ≥ t.
- Parâmetro de componente (R, L…) mudado no meio da rodada não tem efeito no Gecko: use CONST + chave ou fonte controlada.
- GATE: entrada > 0,5 liga a chave.
- PWM no código: a resolução de d é Ts·fsw. Grandeza chaveada amostrada no começo do período pega o vale (use a média do
  período ou amostre no meio).

## Rodar e conferir (sem a tela)
Servidor: `http://localhost:7101/maisim/simu/` (MAISIM_PORTA_SIMU).
- Configuração: `GET editor/controle`, `POST editor/controle {"controle": {...}}` (recusado durante a rodada).
- Rodada: `POST editor/rodar {"dt", "tfim", "nome", "amostras"}`, depois consulte `GET editor/rodada` até `fim` ou `erro`.
- Resultado: `scope_<nome>.npz` (caminho relativo à raiz do projeto), com `meta` em JSON.

O Gecko do MaiSim roda **uma rodada por vez**: veja `editor/rodada` antes de rodar. Confira com números (médias,
ondulação, frequência) e, quando der, contra uma referência independente (Euler implícito, como o Gecko). O teste tem de
distinguir o atraso certo do errado. Registre falhas e avisos como vieram. O texto para o usuário é em português.
