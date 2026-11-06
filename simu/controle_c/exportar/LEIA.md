# {{CIRCUITO}} — o controle em C para o TI C2000

Gerado pelo MaiSim a partir do mesmo C que rodou na simulação (o SIL). Precisão: **{{PRECISAO}}**.

{{CONTROLADORES}}

## O que tem em cada pasta (um controlador = um firmware)

- `*.c`, `*.h`: o controle (o mesmo do MaiSim) e os módulos dele.
- `maisim_controle.h`: o contrato (`maisim_iniciar`, `maisim_passo`, `maisim_scope`, `maisim_envia`, `maisim_recebeu`).
- `maisim_sinais.h`: os índices das medidas (`M_…`), dos parâmetros (`P_…`) e das atuações (`U_…`) deste controlador.
- `maisim_parametros.h`: o Ts e os valores dos parâmetros do painel (o `p[]` de partida).
- `maisim_alvo.c`: o que o alvo dá ao controle (scope e mensagens): complete as mensagens se houver mais de um controlador.
- `alvos/c2000/c2000_isr.c`: o esqueleto da interrupção do ADC (ler `m[]`, `maisim_passo`, escrever `u[]`), com os TODO dos seus canais.
- `teste/replay.c`: o mesmo controle no PC a partir de um CSV de medidas, para comparar com a rodada do MaiSim antes do hardware.

## No Code Composer Studio

1. Crie um projeto do seu C2000 (ou abra um exemplo do C2000Ware, como `adc_soc_epwm`) e copie a pasta do controlador.
2. Configure o ePWM de amostragem com período **Ts**, o ADC disparado por ele e a interrupção `maisim_adc_isr` no PIE.
3. Chame `maisim_alvo_iniciar()` uma vez, depois de configurar o ADC e o ePWM.
4. Complete os TODO do `c2000_isr.c`: o canal, a escala e o offset de cada medida, e para onde vai cada atuação.

## Cuidados

- **Precisão**: no C28x, `float` é a conta rápida da FPU; `double` de 64 bits é emulado (lento). Teste no MaiSim em `float`
  (o seletor de precisão) e compare com o `double` antes de ir para o chip.
- **`sin`, `cos`, `sqrt`**: use a TMU (`--tmu_support`) ou a FastRTS do C2000Ware; os valores podem diferir do PC no último bit.
- **PWM**: se o seu controle gera o PWM no código (a portadora comparada a cada Ts), no DSP use o ePWM: escreva o duty no
  comparador (`CMPA`) e deixe a portadora para o hardware.
- **Tempo**: `maisim_passo` tem de terminar antes do próximo Ts (meça com um GPIO ou o contador da CPU).
