/* pwm — biblioteca do MaiSim: o PWM digital, a portadora (dente de serra ou triangular, 0 → 1) comparada com o duty.
   As mesmas contas, na mesma ordem, do pwm.py. A chave fica ligada enquanto a portadora está abaixo do duty.
   Uso, no controle.c (com Ts bem menor que 1/fsw: a resolução do PWM é o Ts):
     #include "pwm.h"
     no struct Estado: PwmEstado pwm;
     no maisim_iniciar: pwm_iniciar(&e->pwm, p[P_fsw], PWM_SERRA);   (ou PWM_TRIANGULAR)
     no maisim_passo:   u[U_g] = pwm_passo(&e->pwm, t, d);   (1.0 ou 0.0; e->pwm.portadora vai ao scope) */
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
