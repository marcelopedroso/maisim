/* c2000_isr.c — o esqueleto do controle no TI C2000 (F2837x, F28004x, F28P65x…), gerado pelo MaiSim.
   A cada Ts, o ePWM de amostragem dispara o ADC; no fim da conversão, esta interrupção lê as medidas em m[], chama o
   maisim_passo (o mesmo controle do SIL) e escreve as atuações u[] (no comparador do ePWM, num DAC, num GPIO…).
   Complete os TODO com os seus canais: o ADC de cada medida (escala e offset do sensor) e o destino de cada atuação.
   Configure o ePWM/ADC/PIE como no exemplo adc_soc_epwm do C2000Ware (o período do ePWM de amostragem = Ts = {{TS}} s). */
#include "F28x_Project.h"           /* ou o driverlib.h do C2000Ware */
#include "maisim_controle.h"
#include "maisim_parametros.h"

#define MAISIM_ESTADO_MAX 4096      /* bytes para o estado do controle (maisim_tamanho_estado() tem de caber) */

static maisim_real m[MAISIM_N_M], p[MAISIM_N_P], u[MAISIM_N_U];
static long long estado[MAISIM_ESTADO_MAX / sizeof(long long)];   /* zerado e alinhado */
static maisim_real t_amostra;

/* chame uma vez, depois de configurar o ADC e o ePWM e antes de ligar a interrupção */
int maisim_alvo_iniciar(void) {
    int k;
    if (maisim_tamanho_estado() > sizeof(estado)) return -1;   /* aumente MAISIM_ESTADO_MAX */
    for (k = 0; k < MAISIM_N_P; k++) p[k] = maisim_p_iniciais[k];
    t_amostra = 0;
    maisim_iniciar(p, estado);
    return 0;
}

__interrupt void maisim_adc_isr(void) {
    int k;
    /* 1. ler: as medidas */
{{LEITURAS}}
    /* 2. controlar: o mesmo maisim_passo do SIL (a atuação que ele não escrever fica NAN: não muda) */
    for (k = 0; k < MAISIM_N_U; k++) u[k] = NAN;
    maisim_passo(t_amostra, m, p, estado, u);
    /* 3. escrever: as atuações */
{{ESCRITAS}}
    t_amostra += MAISIM_TS;
    AdcaRegs.ADCINTFLGCLR.bit.ADCINT1 = 1;      /* o ADC e o PIE desta interrupção: troque pelos seus */
    PieCtrlRegs.PIEACK.all = PIEACK_GROUP1;
}
