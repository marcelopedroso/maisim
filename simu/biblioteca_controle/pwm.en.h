/* pwm — MaiSim library: digital PWM, the carrier (sawtooth or triangular, 0 → 1) compared with the duty cycle.
   The same operations, in the same order, as pwm.py. The switch is on while the carrier is below the duty cycle.
   Use, in controle.c (with Ts much smaller than 1/fsw: the PWM resolution is Ts):
     #include "pwm.h"
     in the Estado struct: PwmEstado pwm;
     in maisim_iniciar: pwm_iniciar(&e->pwm, p[P_fsw], PWM_SERRA);   (or PWM_TRIANGULAR)
     in maisim_passo:   u[U_g] = pwm_passo(&e->pwm, t, d);   (1.0 or 0.0; e->pwm.portadora can go to the scope) */
#ifndef PWM_H
#define PWM_H

#include "maisim_controle.h"

#define PWM_SERRA 0
#define PWM_TRIANGULAR 1

typedef struct {
    maisim_real fsw;
    int tipo;
    maisim_real portadora;
} PwmEstado;

void pwm_iniciar(PwmEstado *e, maisim_real fsw, int portadora);
maisim_real pwm_passo(PwmEstado *e, maisim_real t, maisim_real d);

#endif
