/* pwm.c — o PWM digital (veja o pwm.h). */
#include "pwm.h"

void pwm_iniciar(PwmEstado *e, maisim_real fsw, int portadora) {
    e->fsw = fsw; e->tipo = portadora; e->portadora = 0.0;
}

maisim_real pwm_passo(PwmEstado *e, maisim_real t, maisim_real d) {
    maisim_real x = t * e->fsw;
    maisim_real c = x - floor(x + 1e-9);  /* a fração do período (o 1e-9 segura t·fsw que cai exato num inteiro) */
    if (e->tipo == PWM_TRIANGULAR)
        c = 1.0 - fabs(2.0 * c - 1.0);
    e->portadora = c;
    return c < d ? 1.0 : 0.0;
}
