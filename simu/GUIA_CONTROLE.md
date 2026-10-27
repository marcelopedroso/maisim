# Guia do Controle — MaiSim / simu

Este guia explica como o código de controle (`controle.py`, painel **Controle** do `/maisim/simu`) conversa com a simulação
no GeckoCIRCUITS. Ele cobre onde se configura cada coisa, a linha do tempo de uma amostra e o atraso de uma atuação até o
circuito. Também traz os cuidados que evitam resultados errados, os dois exemplos prontos e, no fim, o roteiro para quem
automatiza (inclusive o Claude Code). Os números citados foram medidos neste MaiSim: os scripts dos ensaios estão em
`simu/validacao/` e as rodadas de referência dos exemplos em `~/.local/share/maisim/rodadas/`. O que ainda não foi
testado está marcado como tal.

## 1. O que acontece numa rodada

O Gecko integra o circuito com passo fixo Δt. O controle é amostrado com período Ts = n·Δt (n inteiro). A cada amostra k,
no instante t_k = k·Ts:

1. o servidor lê as medidas no instante t_k (`m`);
2. chama `passo(t_k, m, p, e)` do seu código, num processo Python separado;
3. escreve as atuações devolvidas nos blocos **CONST** marcados como atuação;
4. manda o Gecko andar n passos (Ts).

```
   amostra k (t_k = k·Ts)                           amostra k+1 (t_k + Ts)
   │ m = medidas em t_k                             │ m = medidas em t_k + Ts
   │ a = passo(t_k, m, p, e)                        │
   ├────Δt────┼────Δt────┼──── … ────┼────Δt────────┤
   └─ o circuito sente a em t_k + d·Δt (d do painel: logo = 1, amostra = n, ou latência τ)
```

A atuação fica valendo até ser escrita de novo. Se `passo()` não devolver um atuador numa amostra, o CONST mantém o
último valor.

## 2. Onde se configura cada coisa

| O quê | Onde | Observações |
|---|---|---|
| Δt (passo do Gecko) e tempo final | botão **⚙** (Parâmetros da simulação), ao lado do ▶, que roda com eles sem perguntar | Ao abrir um modelo diferente do último, a tela adota o Δt e o tempo final gravados no `.ipes` (o Gecko guarda os da última rodada). Assim um modelo feito para Δt = 1 µs não roda com o Δt que sobrou de outro. Reabrir o mesmo modelo não mexe no que você escolheu. |
| amostras guardadas | botão **⚙**, ao lado do ▶ | Limite de amostras no scope. Com o controle ligado, o scope recebe uma amostra a cada `cada` períodos de controle (o painel mostra quantas). |
| Ts | painel Controle | Vira n = round(Ts/Δt) passos; o código recebe o efetivo em `p["Ts"] = n·Δt`. Ts menor que Δt vira Δt. O painel avisa quando Ts não é múltiplo de Δt e mostra quantas vezes `passo()` vai rodar. |
| atraso da atuação | painel Controle | **logo** (t + Δt), **amostra seguinte** (t + Ts, como num DSP que atualiza o PWM na amostra seguinte) ou **latência** τ (t + round(τ/Δt)·Δt, entre Δt e Ts). |
| atuações | painel Controle, lista **atuações** | Cada bloco CONST do circuito é um atuador possível; o nome no código é o rótulo da saída dele (ou o nome do bloco). Dentro de um subcircuito, leva o nome dele na frente: `Sub_1_x` para o SUBCIRCUIT.1 do Gecko, ou o nome que você deu ao bloco (renomeado `filtro`: `filtro_x`). O painel mostra aonde cada um chega (ex.: `CONST.1 → chave S.1`). |
| medidas | automáticas | Na folha principal, as saídas dos blocos de controle e dos medidores (nome = rótulo da saída; um bloco de várias saídas, como o abc>>dq, dá uma medida por saída: sem rótulo, `<bloco>_<saída>`, ex. `ABCDQ_1_d`); dentro dos subcircuitos, os medidores e as tags, com o nome do subcircuito na frente (`Sub_1_vCSm`; renomeado `SM1`: `SM1_vCSm`). São as chaves de `m` e as colunas do scope; no painel do componente, duas caixinhas dizem para onde vai cada uma: **→ Scope** (coluna gravada na rodada) e **→ Controle** (chave de `m`). Só no controle, ela não é gravada (rodadas menores), e o código ainda a manda ao scope com `scope("x", m["x"])`; só no scope, ler `m["x"]` é erro. A **tag** (paleta, aba Measure) dá a qualquer ponto de controle o nome que se quiser: por exemplo, um voltímetro de dentro de um subcircuito sai por um Control Terminal e, no Main, a tag dá o nome. |
| parâmetros | painel Controle | `p["nome"]`; ganhos, referências, limites. Podem mudar no meio da rodada por um acionamento. |
| acionamentos | painel Controle | Mudanças no tempo, com ou sem o controle: um CONST (ex.: degrau de carga) ou um `p[...]` (ex.: degrau de referência). |
| código | editor do painel | Guardado numa cópia de trabalho e, ao salvar o circuito (disquete), em `<modelo>.controle.json` ao lado do `.ipes`. |

Durante a rodada o painel e o editor ficam travados (o servidor também recusa mudanças: HTTP 409). Ao fim, os CONST
escritos pela rodada voltam ao valor de antes; se o servidor cair no meio, ele os devolve na próxima partida.

## 3. O código: `iniciar` e `passo`

```python
def iniciar(p, e):          # uma vez, antes da 1ª amostra
    e["integral"] = 0.0


def passo(t, m, p, e):      # a cada Ts
    erro = p["i_ref"] - m["i_L"]
    e["integral"] += erro * p["Ts"]
    u = p["Kp"] * erro + p["Ki"] * e["integral"]
    scope("u", u)           # manda uma variável sua para o scope
    return {"u_ctrl": u}    # atuações: {atuador: valor}
```

* `t`: tempo da amostra (s); a primeira é t = 0.
* `m`: medidas no instante `t`. Em t = 0, o estado inicial do circuito: com as condições iniciais dele (o uC(0) de um
  capacitor, o Temp(0) de uma Cth, o y0 de um integrador, a velocidade inicial da máquina) e, sem elas, o valor de partida
  (a corrente de um indutor 0, a máquina parada); as perdas (FLOW de um Pv) valem 0 — nada foi dissipado ainda.
* `p`: parâmetros do painel, mais `p["Ts"]` (o efetivo).
  O scope pode gravar mais fino que o Ts (a amostra pedida menor): dentro do Ts, o circuito a cada amostra, e as colunas do
  `scope()` com o valor do instante do Ts; o `m` continua só no instante do Ts.
* `e`: dicionário seu, que persiste entre amostras.
* O retorno é um dicionário `{atuador: valor}` (ou `None`). Cada chave tem de ser uma atuação marcada no painel, e cada
  valor tem de virar `float` finito; senão a rodada para com erro.
* `scope("nome", valor)` cria uma coluna no scope. As colunas se fixam na **primeira amostra**: chame `scope()` com os
  mesmos nomes em toda amostra (guarde o valor em `e` e mande sempre). Um nome que aparece depois não vai para o scope, e
  a rodada avisa. O nome de um sinal que a rodada já grava (ou `t`) vira `ctrl_x` (`scope("v_o", …)` → `ctrl_v_o`).
* `print()` vai para a saída do controle (embaixo do editor) e para `controle.log` da rodada.
* `math` e `scope` já vêm prontos. Pode importar o que estiver no Python do sistema (a biblioteca padrão, e o numpy 1.21).
  O processo roda com `python3 -I` (isolado: sem o diretório do usuário nem PYTHONPATH).
* Prazos: `iniciar` (com o carregamento) tem 20 s; cada `passo` tem 5 s. Estourou (laço infinito?), a rodada para com
  erro. Um erro no seu código mostra a linha e o rastro só com as linhas do `controle.py`.

### 3.0 Onde fica o painel

O painel do controle abre na doca do simu (o botão `</>` do cabeçalho) ou numa **janela só dele**, pelo `</>` do trilho
do MaiSim: para deixar o circuito num monitor e o código no outro. A janela do código fica ligada ao circuito aberto no
simu; o ▶ fica na janela do circuito (é ela que roda e chama os controladores), e a do código trava a edição durante a
rodada. O botão no começo da barra do editor recolhe a coluna da esquerda (mais espaço para o código).

### 3.0.1 Módulos: ler → controlar → escrever (o padrão)

O circuito novo vem com três arquivos, no caminho de uma amostra de um DSP:

```
amostra k:  leitura.py (ADC e sensores)  →  controle.py (o orquestrador e o controle)  →  escrita.py (PWM/DAC)
```

**Todo `.py` que não é controlador é um módulo**: o `controle.py` (ou outro módulo) faz `import leitura` e chama — no
mesmo processo e na **mesma amostra**, sem atraso. A ordem é a ordem das chamadas; chamar 1 ou 10 vezes (um PLL por
fase) é só um `for`. Contrato de todo módulo:

```python
def iniciar(p):                  # roda uma vez: devolve o estado do módulo (um dicionário seu)
    return {}

def passo(entrada, p, estado):   # a cada chamada: devolve a saída
    return entrada
```

O `controle.py` do modelo guarda o estado de cada módulo em `e` e chama os três:

```python
import leitura
import pll
import escrita

def iniciar(p, e):
    e["leitura"], e["pll"], e["escrita"] = leitura.iniciar(p), pll.iniciar(p), escrita.iniciar(p)

def passo(t, m, p, e):
    x = leitura.passo(m, p, e["leitura"])        # 1. ler: medidas tratadas (ganho, offset, quantização do ADC…)
    th = pll.passo(x, p, e["pll"])                # 2. controlar: os módulos, na ordem
    u = {"u_ctrl": ...}
    return escrita.passo(u, p, e["escrita"])     # 3. escrever: saturação, resolução do PWM… → as atuações
```

* **Mesma amostra, prova:** o PI de corrente do exemplo escrito em módulos (`leitura → pi → escrita`) dá o MESMO
  resultado, bit a bit, que o PI todo no `controle.py` (`validacao/modulos_api.py`).
* **Módulo × controlador.** Módulo organiza o código (sem atraso). Controlador (§3.1) é um processo à parte, que emula
  outro DSP e conversa com ≥ 1 amostra de atraso: só para controle distribuído de verdade — **nunca** para dividir um
  laço (o atraso entraria na malha). Na árvore: "Virar controlador" (o botão ⤴) e "Virar módulo". "+ Arquivo" cria um
  módulo.
* **O tempo de cálculo é zero dentro da amostra.** Ler, calcular e escrever acontecem no mesmo instante simulado,
  quantos arquivos houver. O atraso real (conversão do ADC, cálculo, atualização do PWM) é o do painel (§4): `logo`,
  `amostra` (o clássico: calcula durante o período, atualiza no começo do próximo) ou uma latência τ.
* **Os riscos que o MaiSim acusa:** nome de módulo do Python (`json.py`, `math.py`: erro, renomeie); `import` de arquivo que
  não existe (erro); `import` de um controlador (erro: o atraso entraria na malha); módulo que ninguém importa (aviso: não
  roda); imports em ciclo (aviso); módulo com `passo(t, m, p, e)` — cara de controlador (aviso); o mesmo módulo em dois
  controladores (aviso: cada um tem a sua cópia, sem memória comum). Erro dentro de um módulo aponta o arquivo e a linha
  dele.
* **A ordem é conferida** no `passo()` de cada controlador: `leitura.passo()` é a 1ª chamada de módulo e `escrita.passo()`
  a última, e o `return` devolve o que o escrita devolveu (senão os limites do atuador ficam de fora); todo módulo chamado
  no `passo()` é iniciado no `iniciar()`. Desvio vira aviso na tela e no contexto do Claude, que corrige junto.
* **O Claude do MaiSim** edita o `controle.py` e os módulos e cria módulos novos (só `.py` na pasta dele), seguindo o
  contrato e a ordem; a proposta mostra a diferença de cada arquivo (uma aba por arquivo), aplicar leva os módulos, e
  "voltar ao de antes" e "ver a mudança" também. Ele não apaga arquivos nem transforma módulo em controlador.
* **Controle de antes dos módulos** continua como era (só o `controle.py`); na árvore, "Organizar como um DSP" cria o
  `leitura.py` e o `escrita.py` dos modelos sem mexer no `controle.py`.

### 3.1 Vários controladores (controle distribuído)

Um circuito pode ter mais de um controlador: aquisição e controle, um por submódulo, um por fase, um central e vários
locais… **Cada arquivo `.py` é um controlador** (com o mesmo `iniciar`/`passo`), com o nome do arquivo:
`aquisicao.py` é o controlador `aquisicao` (o destino de `envia` e o `p["id"]`). No painel, a coluna da esquerda tem
duas abas: **Variáveis** (Ts, atuações, medidas, parâmetros, acionamentos) e **Arquivos** (os `.py` e, embaixo de cada
um, **lê** — algumas medidas ou **todas** —, **escreve** e **em subcircuitos**; e a rede). O `+` ao lado das abas do
editor (ou "+ Arquivo") cria um módulo (§3.0.1); "Virar controlador" (o botão ⤴), na árvore, o põe a rodar à parte; duplo clique
renomeia (o controlador acompanha); o × apaga o arquivo e o controlador dele. Marcar uma atuação num controlador tira dos outros (um dono só).

* **Isolados e em paralelo.** Cada controlador roda no seu processo Python: sem memória comum (o que um guarda num
  módulo, o outro não vê). A cada amostra, o MaiSim entrega as medidas a todos ao mesmo tempo, eles calculam juntos e o MaiSim
  recolhe as atuações.
* **Visão local imposta.** `m` só tem as medidas do controlador; ler outra é erro (`KeyError`, com o arquivo e a linha).
  Devolver uma atuação que não é dele também é erro. Cada atuação tem **um dono só**.
* **Um código, várias instâncias.** Um controlador pode valer **em subcircuitos**: uma instância por subcircuito
  (`sm_Sub_1`, `sm_Sub_2`, …), cada uma lendo as medidas e escrevendo as atuações de dentro do seu subcircuito **sem o
  prefixo** (`m["vCSm"]`, não `m["Sub_3_vCSm"]`). O mesmo código serve para todos; `p["id"]` é o nome da instância e
  `p["subcircuito"]`, o subcircuito dela.
* **Mensagens.** `envia("controle", {"i": x})` manda (a um controlador ou a uma lista); `recebe()` devolve o que chegou:
  `[{"de": nome, "t": instante do envio, "dados": {...}}]`. Como todos calculam juntos, **uma mensagem nunca chega na
  mesma amostra**: chega na 1ª amostra depois do envio com t ≥ t_envio + latência da rede (latência 0: na amostra
  seguinte, como entre dois DSPs). Latência τ: atraso de max(1, ⌈τ/Ts⌉) amostras.
  Cada valor da mensagem é um número, `None` (sem valor ainda) ou uma lista curta de números (até 64): um fasor vai
  como `(re, im)` e chega como `[re, im]` (`re, im = msg["dados"]["vf1"]`). Nada de texto nem de dicionário dentro.
* **Scope e print.** As variáveis do `scope()` dos outros controladores levam o nome da instância na frente
  (`aquisicao_x`); as do `controle.py` ficam com os nomes de sempre (as colunas das rodadas não mudam só por existir
  outro controlador). O `print()` vai para o log com `[instância]` na frente.
* **Sem nenhum controlador na lista**, vale o de sempre: o `controle.py` lê todas as medidas e escreve as atuações
  marcadas. O primeiro "Virar controlador" põe esse na lista (com a mesma visão) e acrescenta o novo.

Exemplo (aquisição + controle, com o PI do `exemplo_controle_pi`):

```python
# aquisicao.py — lê i_L
def passo(t, m, p, e):
    envia("controle", {"i": m["i_L"]})

# controle.py — escreve u_ctrl; não lê i_L: recebe pela rede
def iniciar(p, e):
    e["integral"] = 0.0
    e["i"] = 0.0

def passo(t, m, p, e):
    for msg in recebe():
        e["i"] = msg["dados"]["i"]
    erro = p["i_ref"] - e["i"]
    ...
```

Conferido na instância de teste (`validacao/controladores_api.py`): este par dá **exatamente** a mesma corrente que um
controlador único que usa a medida de 1 amostra atrás (latência 0) ou de 3 amostras atrás (latência 2,5·Ts) — diferença
0,0 nas 301 amostras.

## 4. Tempo e atraso: o que o circuito sente, e quando

### 4.1 O atraso próprio do Gecko e a compensação

Dentro de um passo, o Gecko faz, nesta ordem (`SimulationsKern.simulateOneTimeStep`):

1. a chave lê a entrada do GATE;
2. o circuito é resolvido;
3. as fontes controladas por sinal leem o sinal (valem no passo seguinte);
4. os blocos de controle calculam, todos numa passada.

Escrever um CONST muda a saída dele na hora. Por isso, uma escrita feita antes do passo s chega ao circuito em momentos
diferentes conforme o caminho do CONST até o destino. Medido com Δt = 1 µs:

| Caminho | O circuito sente no passo |
|---|---|
| CONST → GATE → chave | s |
| CONST → bloco(s) → GATE → chave | s + 1 |
| CONST → fonte controlada por sinal | s + 1 |
| CONST → bloco(s) → fonte | s + 2 |
| CONST_S1 → SM (terminal → AND, ou NOT → AND → GATE) → IGBT, modelo 03 | s + 1 |

O terminal de subcircuito não acrescenta passo, porque o Gecko liga o rótulo de fora ao de dentro como uma só rede. O
passo a mais no SM do modelo 03 vem do AND (lógica de tempo morto).

O servidor segue as ligações de controle de cada atuação até a chave ou a fonte e **escreve mais cedo o quanto for
preciso**. Assim o circuito sente a atuação em t + d·Δt **em qualquer destino**. A mesma compensação vale para os
acionamentos de CONST. O traçado segue o que o Gecko faz:

* usa rótulos (inclusive o de dentro do terminal de subcircuito), conexões e a regra de ligação (há ligação onde uma
  ponta cai noutra conexão; cruzamento sem ponta não liga);
* atravessa blocos, subcircuitos e terminais globais de controle (os de mesmo nome são a mesma rede, em qualquer folha);
* ignora elemento desativado e GATE sem chave, que o Gecko também ignora;
* só conta uma fonte controlada por sinal quando um bloco da mesma folha dela alimenta o rótulo, porque o Gecko procura
  o sinal só entre as saídas de blocos daquela folha.

O que não dá para compensar fica avisado no painel e na rodada, inclusive nos acionamentos de CONST:

* **o mínimo do Gecko é maior que o pedido**: por exemplo, atraso "logo" (1 Δt) com um bloco antes de uma fonte, que
  precisa de 2 Δt;
* **o mesmo CONST chega a destinos com atrasos diferentes**: o que sente primeiro fica exato e os outros sentem depois;
* **a atuação não chega a chave nem a fonte** pelo traçado: o atraso é tratado como o de uma fonte, sem garantia.

A coluna do próprio CONST no scope mostra o instante da escrita, que pode vir até 2 passos antes do circuito sentir.
Os blocos do seu circuito continuam agindo por cima (por exemplo, o tempo morto dos DELAY dentro do SM).

### 4.2 Acionamentos

* Um acionamento de **CONST** em t vale no circuito a partir do passo j = round(t/Δt), compensado como acima.
* Um acionamento de **`p[...]`** vale na primeira amostra com t_k ≥ t (o código o vê nessa amostra).
* As marcas no scope ficam nesses instantes efetivos. Se dois acionamentos caem no mesmo instante, vale o último (com
  aviso). Acionamento depois do fim não acontece (com aviso).

### 4.3 Medidas

As medidas em `m` são as do instante t_k, já com o efeito do que foi aplicado até t_k. Atenção às grandezas chaveadas:
amostrar a corrente do indutor sempre no começo do período de chaveamento pega o vale da ondulação, não a média. O
exemplo do buck tira a média do período no próprio código. Outra saída é amostrar no meio do tempo ligado.

As **perdas** (os medidores FLOW de um Pv: `Pv_…`, `Pcond_…`, `Psw_…`) são a exceção: em `m` vem a **média do último
Ts**, não o valor do instante. A perda de chaveamento do Gecko é E/Δt num passo só (o da comutação), e o valor do instante
seria zero quase sempre e um pico às vezes. A temperatura (`Tj_…`) vem no instante, como as outras.

## 5. Como não errar (lista de conferência)

1. **Δt resolve o circuito**: bem menor que as constantes de tempo e que o período de chaveamento. O Gecko usa Euler
   implícito por padrão (`solverType 0`). As referências independentes só batem até a precisão de máquina com Euler
   implícito; com a exponencial exata sobra um erro pequeno (1e-4 A em 5 A no exemplo do PI).
2. **Ts múltiplo de Δt**: o painel avisa; o código recebe o Ts efetivo em `p["Ts"]`.
3. **PWM feito no código**: as bordas caem na grade de Ts, e a resolução do ciclo de trabalho é Ts·fsw (Ts = 2 µs a
   5 kHz dá 1 %). O PI então alterna d entre dois degraus vizinhos para acertar a média. No buck do exemplo, no patamar
   de 10 A, o tempo ligado alterna entre 40 e 42 µs.
4. **Custo**: `passo()` roda tfim/Ts vezes, e cada chamada custa de 1 a 3 ms no buck do exemplo (medido, já com o
   Gecko, que num circuito pequeno é rápido; num MMC grande o Gecko pesa mais). O painel faz a conta. O buck do exemplo
   (5 000 chamadas) levou de 5 a 13 s, e uma vez 19 s com a máquina ocupada. Numa medição, o atraso "amostra" levou
   5 s contra 10 s do "logo": a escrita cai no começo do trecho e o Gecko anda o período de uma vez.
5. **Alternativa mais barata para PWM** (ainda sem exemplo pronto neste MaiSim): portadora e comparador em blocos do Gecko,
   com o código escrevendo só o ciclo de trabalho, uma vez por período (Ts = 1/fsw). O bloco no meio entra na
   compensação (+1 passo).
6. **Parâmetros de componente (R, L, …) não mudam no meio da rodada** no Gecko: a mudança não tem efeito. Para um
   degrau de carga, use uma chave comandada por um CONST (como o `CONST_CARGA` do modelo 03) ou uma fonte controlada.
7. **GATE**: entrada > 0,5 liga a chave e ≤ 0,5 desliga (S, MOSFET, IGBT; `SimulationsKern.checkForSwitchAction`). O
   tiristor é diferente: > 0,5 dispara, e ele só bloqueia quando a corrente zera.
8. **scope()**: os mesmos nomes desde a primeira amostra.
9. **Uma rodada por vez** no Gecko do MaiSim (ele é um só).
10. **Confira contra uma referência**: um modelo pequeno resolvido à parte (como nos testes abaixo). Com o atraso
    trocado, a diferença tem de aparecer; senão, o teste não está medindo nada.

## 6. Exemplos prontos (Abrir → `exemplo…`)

### 6.1 `exemplo_controle_pi`: PI de corrente num RL

* **Circuito**: fonte controlada pelo sinal `u_ctrl` → R = 1 Ω → L = 10 mH → fonte de perturbação `v_dist` → volta.
* **Controle**: Ts = 100 µs, atraso "amostra seguinte", PI com anti-windup (Kp = L·ωc, Ki = R·ωc, fc = 200 Hz).
* **Acionamentos**: i_ref 5 → 8 A em 12 ms; v_dist = 20 V em 22 ms.
* **Validação**:
  * contra o RL resolvido à parte por Euler implícito (a regra do Gecko), com o mesmo PI e o mesmo atraso, o erro é de
    **1,4e-13 A**, precisão de máquina, nos modos "logo" e "amostra" (1,6e-13 A com latência de 30 µs);
  * com a exponencial exata no lugar de Euler, ficava em 9,4e-5 A (logo), 1,1e-4 A (amostra) e 9,8e-5 A (latência 30 µs);
  * com o atraso trocado na referência, a diferença vira 0,63 A ou 0,18 A, ou seja, o teste distingue os modos.

### 6.2 `exemplo_controle_pwm`: buck com o PWM feito no `controle.py`

* **Circuito**: Vdc = 100 V → chave ideal S.1 → L = 1 mH → R = 2 Ω, com diodo de roda livre D.1. O CONST.1 (atuação
  `g`) entra no GATE.1, que comanda a S.1. Medidores: `v_sw` (tensão chaveada), `v_o` e `i_L`.
* **Δt** = 1 µs, **Ts** = 2 µs, **tempo final** = 10 ms (gravados no arquivo).
* **Controle**:
  * a cada Ts, uma portadora dente de serra a fsw = 5 kHz é comparada com o ciclo de trabalho d, o que dá `g` = 1 ou 0;
  * no começo de cada período, um PI roda sobre a média de i_L no período anterior, com
    Kp = 1,885 V/A, Ki = 3 770 V/(A·s) e d limitado a [0; 0,95].
* **Acionamento**: i_ref 10 → 15 A em 5 ms.
* **Resultado**:
  * `v_sw` só assume 0 V ou 100 V (cerca de −0,7 V na roda livre: 0,6 V do diodo mais rON·i); período de 200,0 µs;
  * ⟨i_L⟩ = 10,008 A e 15,026 A, com d = 0,200 e 0,300;
  * no patamar de 10 A (d ≈ 0,2), o tempo ligado alterna entre 40 e 42 µs (a resolução de 1 %), e a ondulação período
    a período (3,24 a 3,31 A) bate com (Vdc − v_o)·t_on/L (3,20 a 3,36 A).
* **Validação**:
  * contra a referência independente (o mesmo código e o buck resolvido por Euler implícito), o erro é de **1,0e-5 A**
    em 5 000 amostras, que é a fuga pela chave aberta (100 V / rOFF de 10 MΩ = 1e-5 A, que a referência não modela), e
    as 5 000 decisões de chaveamento são idênticas;
  * nos modos "logo" e "amostra", o modo certo dá 1,0e-5 A e os errados dão 0,26 A.

## 7. Arquivos

| Arquivo | O que é |
|---|---|
| `<pasta dos circuitos>/<modelo>.ipes` | o circuito (o Gecko o abre) |
| `<pasta dos circuitos>/<modelo>.controle.json` | o controle do modelo: `ativo`, `Ts`, `atuacoes`, `parametros`, `atraso`, `acionamentos`, `codigo` (o controle.py), `arquivos` (os outros .py: módulos, e os controladores da lista), `controladores` e `rede` |
| `~/.local/share/maisim/rodadas/<data>_<nome>/` | uma rodada: `<nome>.ipes` (o circuito exato), `controle.py` (e os outros .py), `controle.json`, `controle.log`, `scope_<nome>.npz` |
| `scope_<nome>.npz` | colunas `t`, as medidas, as variáveis do `scope()` e `meta` (JSON). No `meta`: `dt_gecko` é o Δt; `dt` e `Ts` são o intervalo entre as amostras do scope; `controle.Ts` é o do controle; e há `controle.atraso_passos`, `controle.escrita_passos`, `controle.destinos` e os `acionamentos` efetivos. |
| `simu/controle_worker.py` | o processo que roda o código de um controlador (um por controlador; protocolo JSON por linha); importa os módulos da memória |
| `simu/{controle,leitura,escrita,modulo}_modelo.py` | os modelos: o controle.py do circuito novo, o leitura.py, o escrita.py e o de um módulo novo |
| `simu/servidor.py` | o laço da rodada (`_rodar`), o traçado (`destinos_controle`), a configuração (`confere_controle`) |

## 8. Para automatizar (e para o Claude Code)

O servidor do simu atende em `http://localhost:7101/maisim/simu/` (MAISIM_PORTA_SIMU; o `npm run maisim` o sobe). Tudo o que o painel faz passa
por estas rotas (JSON):

| Rota | Para quê |
|---|---|
| `POST editor/abrir {"arq": "exemplos/exemplo_controle_pwm.ipes"}` | abre um modelo no Gecko do MaiSim (o controle dele vem junto). O servidor só recusa (e pede `"descartar": true`) quando o modelo mudou fora do editor, pela janela do Gecko. Mudança feita pelo editor e não salva se perde sem aviso: veja antes `GET editor/pendente` (`{"pendente": true}` = há o que salvar). |
| `GET editor/controle` | a configuração (`controle`), erros e avisos do código, `entradas` (as medidas), `atuadores` (com `destinos` e `atraso_gecko`) |
| `POST editor/controle {"controle": {...}}` | grava a configuração (recusada durante a rodada) |
| `POST editor/destino {"uid": "…", "scope": true, "controle": false}` | para onde vai o sinal de um componente (as caixinhas → Scope e → Controle; recusado durante a rodada); `GET editor/estado` traz `fora_scope` e `fora_controle` |
| `POST editor/rodar {"dt": "1e-6", "tfim": "0.01", "nome": "teste", "amostras": "100000"}` | começa a rodada (o controle vai junto se `ativo`) |
| `GET editor/rodada` | `estado` (preparando, rodando, pausada, fim, erro ou parada), `t`, `avisos`, `erro`, `erro_controle` (`linha`, `rastro`), `saida_controle`, `arquivo` (o `.npz`), `segundos` |
| `POST editor/pausar`, `editor/continuar`, `editor/parar` | durante a rodada |

Roteiro de uma alteração no controle, sem a tela:

```python
import json, time, urllib.request
import numpy as np
B = "http://localhost:7101/maisim/simu/"
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=600).read())

c = api("editor/controle")["controle"]            # a configuração atual do modelo aberto
c["codigo"] = open("controle.py").read()           # o código novo
api("editor/controle", {"controle": c})
j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.01", "nome": "teste", "amostras": "100000"})
while j["estado"] in ("preparando", "rodando", "pausada"):
    time.sleep(0.5); j = api("editor/rodada")
print(j["estado"], j.get("erro"), j.get("avisos"))
d = np.load(j["arquivo"])                          # caminho relativo à raiz do projeto (ou absoluto)
```

Regras para quem mexe no controle, gente ou agente:

* Só escreva atuações marcadas no painel. Não mude parâmetros de componente no meio da rodada (seção 5, item 6).
* Mantenha os nomes do `scope()` desde a primeira amostra.
* O Gecko do MaiSim roda uma rodada por vez. Antes de rodar, veja se `editor/rodada` não está `rodando`.
* Confira o resultado com números (médias, ondulação, frequência) e, quando der, contra uma referência independente.
  Registre falhas e avisos como vieram; não esconda nem arredonde para caber.
* O texto para o usuário é em português.
