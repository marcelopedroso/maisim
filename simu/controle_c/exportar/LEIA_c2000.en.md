## In Code Composer Studio (`alvos/c2000/c2000_isr.c`)

1. Create a project for your C2000 (or open a C2000Ware example such as `adc_soc_epwm`) and copy the controller's folder.
2. Set up the sampling ePWM with period **Ts**, the ADC triggered by it and the `maisim_adc_isr` interrupt in the PIE.
3. Call `maisim_alvo_iniciar()` once, after setting up the ADC and the ePWM.
4. Fill in the TODOs in `c2000_isr.c`: the channel, gain and offset of each measurement, and where each actuation goes.

## Caveats

- **Precision**: on the C28x, `float` is the fast FPU math; 64-bit `double` is emulated (slow). Test in MaiSim with `float`
  and compare with `double` before going to the chip.
- **`sin`, `cos`, `sqrt`**: use the TMU (`--tmu_support`) or C2000Ware's FastRTS; values may differ from the PC in the last bit.
- **PWM**: if your control generates the PWM in code (the carrier compared every Ts), on the DSP use the ePWM: write the duty
  to the comparator (`CMPA`) and leave the carrier to the hardware.
- **Timing**: `maisim_passo` must finish before the next Ts (measure it with a GPIO or the CPU counter).
