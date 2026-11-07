## No Code Composer Studio (`alvos/c2000/c2000_isr.c`)

1. Crie um projeto do seu C2000 (ou abra um exemplo do C2000Ware, como `adc_soc_epwm`) e copie a pasta do controlador.
2. Configure o ePWM de amostragem com período **Ts**, o ADC disparado por ele e a interrupção `maisim_adc_isr` no PIE.
3. Chame `maisim_alvo_iniciar()` uma vez, depois de configurar o ADC e o ePWM.
4. Complete os TODO do `c2000_isr.c`: o canal, a escala e o offset de cada medida, e para onde vai cada atuação.

## Cuidados

- **Precisão**: no C28x, `float` é a conta rápida da FPU; `double` de 64 bits é emulado (lento). Teste no MaiSim em `float`
  e compare com o `double` antes de ir para o chip.
- **`sin`, `cos`, `sqrt`**: use a TMU (`--tmu_support`) ou a FastRTS do C2000Ware; os valores podem diferir do PC no último bit.
- **PWM**: se o seu controle gera o PWM no código (a portadora comparada a cada Ts), no DSP use o ePWM: escreva o duty no
  comparador (`CMPA`) e deixe a portadora para o hardware.
- **Tempo**: `maisim_passo` tem de terminar antes do próximo Ts (meça com um GPIO ou o contador da CPU).
