# HIL em tempo real dentro da placa: a planta num núcleo, o controle em outro

Sem PC nem rede no laço: o `rt_hil` roda, num Linux (um Raspberry Pi, por exemplo), duas threads fixas em núcleos diferentes:

- a **planta**, a cada `--dt-us` (1 µs por padrão): a RL do buck do `exemplo_controle_pwm`, discretizada exata com a chave parada no passo (`i' = a·i + (1-a)·g·Vdc/R`, `a = exp(-R·dt/L)`). **A planta é escrita à mão para este circuito**: gerar a planta de qualquer circuito do MaiSim é outro assunto (um gerador de C da planta, o par do "Exportar C" do controle);
- o **controle**, a cada `--ts-us`: o mesmo `controle.c` do SIL (`maisim_controle.h`), sem o calço do SIL (`maisim_scope`, `maisim_envia`, `maisim_recebeu` vazios, como num alvo).

As duas presas ao mesmo relógio (`CLOCK_MONOTONIC`) e **esperando o instante do próximo passo girando** (nunca dormindo: um `sleep` devolve o núcleo ao escalonador e traz o jitter de volta). O tempo de simulação é o tempo real. Uma amostra do controle que vence durante o passo anterior **se perde**, como a interrupção de um microcontrolador que não deu conta; elas são contadas. A planta, atrasada, recupera os passos (o modelo não perde tempo).

O cenário é o do exemplo (10 ms: `i_ref` 10 → 15 A em 5 ms → 8 A em 7,5 ms), repetido `--runs` vezes. Cada amostra do controle grava: o atraso do início em relação ao instante previsto, o tempo de execução, a idade da medida (do passo da planta que ele leu), `i` e `g`.

## Usar

```bash
python3 simu/hil/rt/rt_prepara.py ~/maisim_rt                # gera o maisim_sinais.h/rt_params.h do exemplo e compila (gcc)
sudo sysctl kernel.sched_rt_runtime_us=-1                    # senão o SCHED_FIFO em laço é parado 50 ms por segundo
sudo ~/maisim_rt/rt_hil --ts-us 10 --runs 200 --out x.bin    # --core-ctl N --core-planta M --prio 80 --vazio
python3 simu/hil/rt/rt_analisa.py rotulo=x.bin --fig x.png   # percentis, perdas e os histogramas (precisa do numpy e do matplotlib)
```

`--vazio` não chama o `maisim_passo` (só o relógio): o piso do jitter da máquina. `--prio 0` roda sem SCHED_FIFO (sem `sudo`). `sched_rt_runtime_us=-1` vale só durante a medida (o padrão é 950000).

## Preparar a placa

Isolar dois núcleos é o que mais importa. No Raspberry Pi OS, no fim da única linha de `/boot/firmware/cmdline.txt` (guarde uma cópia) e reinicie:

```
isolcpus=2,3 irqaffinity=0,1
```

Governor `performance` durante a medida. Com isso a placa fica com 2 núcleos para o resto do sistema. O kernel do Pi (6.18 `PREEMPT`) não tem `NO_HZ_FULL` nem `PREEMPT_RT`: não foi trocado, e a medida abaixo é assim.

## O que se mediu (Raspberry Pi 3 Model B, ~70 °C, 14–15/11/2026)

A mesma rodada na mesma inicialização, alternando, com o resto do sistema rodando (100 cenários de 10 ms por lado, 4 vezes, Ts = 10 µs):

| núcleos | amostras perdidas | atraso do início, p99,99 | pior atraso por rodada |
|---|---|---|---|
| 0 e 1 (sem isolar) | 2,7 % | 93 µs | 0,4 / 35 / 4 / 21 ms |
| 2 e 3 (isolados, `SCHED_FIFO`) | 0,04 % | 14,5 µs | 94–205 µs |

No isolado, o controle do exemplo gasta ~0,2 µs por passo (cache quente) e a malha fecha (i_L ≈ 8,05–8,14 A com `i_ref` = 8 A) com Ts de 20, 10, 5 e 2 µs; perde 0,01 a 0,38 % das amostras. Quase tudo isso vem de paradas isoladas de 50–260 µs que o Pi 3 tem até num laço que só lê o relógio (`--vazio`): uma parada de 100 µs a Ts = 2 µs perde 50 amostras. O mesmo isolamento, no estudo de tempo do MPC do nosso artigo (N = 3, Ts = 200 µs), deu 3 perdas de prazo em 10 000 (0,03 %; sem isolar, 0,5–0,7 %).

Limites: o Pi 3 não segura prazo duro abaixo de ~50–260 µs; um Pi 4/5 é o alvo melhor. A planta de 1 passo de 1 µs só cabe porque é uma RL com uma chave.

## Teste

`simu/validacao/rt_hil_offline.py` (Linux com gcc e 2 CPUs, no CI): compila, roda 10 cenários em dois núcleos sem SCHED_FIFO e confere a conta das amostras (executadas + perdidas = previstas), os passos da planta, a malha fechada (i_L perto de `i_ref`), o degrau de `i_ref` e que, com `--vazio`, a corrente fica em zero. Numa máquina ocupada (menos de 90 % das amostras executadas) o fechamento da malha e o degrau não são conferidos: sem prioridade de tempo real isso é o esperado.
