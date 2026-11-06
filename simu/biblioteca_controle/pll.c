/* pll.c — o SRF-PLL (veja o pll.h). */
#include "pll.h"

#define PLL_PI 3.14159265358979323846  /* o math.pi do Python */

void pll_iniciar(PllEstado *e, maisim_real f_nominal, maisim_real kp, maisim_real ki, maisim_real ts, maisim_real desvio_max) {
    maisim_real desvio = 2.0 * PLL_PI * desvio_max;  /* o quanto ω pode sair do nominal, em rad/s */
    e->w0 = 2.0 * PLL_PI * f_nominal;
    e->ts = ts;
    pi_iniciar(&e->pi, kp, ki, ts, -desvio, desvio, 0.0);
    e->theta = 0.0; e->w = e->w0; e->vd = 0.0; e->vq = 0.0;
}

maisim_real pll_passo(PllEstado *e, maisim_real va, maisim_real vb, maisim_real vc) {
    maisim_real alfa = (2.0 / 3.0) * (va - 0.5 * vb - 0.5 * vc);
    maisim_real beta = (vb - vc) / sqrt(3.0);
    maisim_real th = e->theta;
    maisim_real s = sin(th);
    maisim_real c = cos(th);
    maisim_real proximo;
    e->vd = alfa * c + beta * s;
    e->vq = -alfa * s + beta * c;
    e->w = e->w0 + pi_passo(&e->pi, e->vq);
    proximo = th + e->w * e->ts;
    if (proximo >= 2.0 * PLL_PI)
        proximo = proximo - 2.0 * PLL_PI;
    else if (proximo < 0.0)
        proximo = proximo + 2.0 * PLL_PI;
    e->theta = proximo;
    return th;
}
