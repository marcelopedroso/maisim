/* pi.c — the discrete PI (see pi.h). */
#include "pi.h"

void pi_iniciar(PiEstado *e, maisim_real kp, maisim_real ki, maisim_real ts, maisim_real minimo, maisim_real maximo,
                maisim_real inicial) {
    e->kp = kp; e->ki = ki; e->ts = ts; e->minimo = minimo; e->maximo = maximo; e->integral = inicial;
}

maisim_real pi_passo(PiEstado *e, maisim_real erro) {
    maisim_real integral = e->integral + e->ki * e->ts * erro;
    maisim_real u = e->kp * erro + integral;
    if (u > e->maximo) {
        u = e->maximo;
        if (erro > 0.0) integral = e->integral;  /* saturated high: the integral stops growing (anti-windup) */
    } else if (u < e->minimo) {
        u = e->minimo;
        if (erro < 0.0) integral = e->integral;  /* saturated low: the integral stops falling */
    }
    e->integral = integral;
    return u;
}
