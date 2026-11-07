## In STM32CubeIDE (`alvos/stm32/stm32.c`)

1. In CubeMX: a sampling timer with period **Ts** triggering the ADC (Trigger: TIMx TRGO), the ADC with circular DMA and
   the end-of-conversion interrupt; a PWM timer for the actuations.
2. Copy the controller's folder into `Core/` (or add it to the source and include folders).
3. Call `maisim_alvo_iniciar()` after the `MX_..._Init()` calls and start the sampling timer.
4. Fill in the TODOs: each measurement's index in `adc_bruto[]` (gain and offset) and each actuation's comparator.

## Caveats

- **Precision**: on a Cortex-M4F/M33, `float` is the (single) FPU; `double` is emulated. On an M7 with a double FPU, `double` works.
- **Timing**: the callback must finish before the next Ts (measure it with a GPIO).
