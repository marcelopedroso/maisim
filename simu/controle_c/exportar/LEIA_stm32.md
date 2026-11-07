## No STM32CubeIDE (`alvos/stm32/stm32.c`)

1. No CubeMX: um timer de amostragem com período **Ts** disparando o ADC (Trigger: TIMx TRGO), o ADC com DMA circular e
   a interrupção de fim de conversão; um timer de PWM para as atuações.
2. Copie a pasta do controlador para `Core/` (ou adicione-a às pastas de fontes e de include).
3. Chame `maisim_alvo_iniciar()` depois dos `MX_..._Init()` e ligue o timer de amostragem.
4. Complete os TODO: o índice de cada medida em `adc_bruto[]` (escala e offset) e o comparador de cada atuação.

## Cuidados

- **Precisão**: no Cortex-M4F/M33, `float` é a FPU (simples); `double` é emulado. Num M7 com FPU dupla, `double` serve.
- **Tempo**: o callback tem de terminar antes do próximo Ts (meça com um GPIO).
