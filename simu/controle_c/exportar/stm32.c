/* stm32.c — o esqueleto do controle num STM32 (HAL do STM32Cube), gerado pelo MaiSim.
   Um timer dispara o ADC a cada Ts (= {{TS}} s), o DMA enche adc_bruto[] e, no fim da conversão, o callback lê as medidas
   em m[], chama o maisim_passo (o mesmo controle do SIL) e escreve as atuações u[] (o comparador de um timer, um DAC…).
   Complete os TODO com os seus canais (escala e offset do sensor) e os seus timers. Num Cortex-M4F/M33, use float (a FPU simples). */
#include "main.h"                   /* o do seu projeto do STM32CubeIDE (o HAL e os handles: hadc1, htim1…) */
#include "maisim_controle.h"
#include "maisim_parametros.h"

#define MAISIM_ESTADO_MAX 4096

extern ADC_HandleTypeDef hadc1;     /* TODO: o seu ADC */
extern TIM_HandleTypeDef htim1;     /* TODO: o seu timer de PWM */
volatile uint16_t adc_bruto[16];    /* o buffer do DMA do ADC (um por canal) */

static maisim_real m[MAISIM_N_M], p[MAISIM_N_P], u[MAISIM_N_U];
static long long estado[MAISIM_ESTADO_MAX / sizeof(long long)];
static unsigned long n_amostra;   /* t = n·Ts (somar Ts a cada amostra acumula erro de arredondamento) */

/* chame uma vez, depois do MX_..._Init() e antes de ligar o timer de amostragem */
int maisim_alvo_iniciar(void) {
    int k;
    if (maisim_tamanho_estado() > sizeof(estado)) return -1;
    for (k = 0; k < MAISIM_N_P; k++) p[k] = maisim_p_iniciais[k];
    n_amostra = 0;
    maisim_iniciar(p, estado);
    return HAL_ADC_Start_DMA(&hadc1, (uint32_t *)adc_bruto, sizeof adc_bruto / sizeof *adc_bruto) == HAL_OK ? 0 : -2;
}

void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc) {
    int k;
    if (hadc != &hadc1) return;
    /* 1. ler: as medidas */
{{LEITURAS}}
    /* 2. controlar */
    for (k = 0; k < MAISIM_N_U; k++) u[k] = NAN;
    maisim_passo((maisim_real)((double)n_amostra * MAISIM_TS), m, p, estado, u);
    /* 3. escrever: as atuações (a que ficou NAN não muda) */
{{ESCRITAS}}
    n_amostra++;
}
