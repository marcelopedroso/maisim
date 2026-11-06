/* pi — MaiSim library: the discrete PI controller, with saturation and anti-windup (conditional integration).
   The same operations, in the same order, as pi.py: Compare Python × C gives bit-identical results.
   Use, in controle.c:
     #include "pi.h"
     in the Estado struct: PiEstado pi;
     in maisim_iniciar: pi_iniciar(&e->pi, p[P_Kp], p[P_Ki], p[P_Ts], 0.0, 1.0, 0.0);
     in maisim_passo:   maisim_real d = pi_passo(&e->pi, p[P_i_ref] - m[M_i_L]); */
#ifndef PI_H
#define PI_H

#include "maisim_controle.h"

typedef struct {
    maisim_real kp, ki, ts, minimo, maximo, integral;
} PiEstado;

void pi_iniciar(PiEstado *e, maisim_real kp, maisim_real ki, maisim_real ts, maisim_real minimo, maisim_real maximo,
                maisim_real inicial);
maisim_real pi_passo(PiEstado *e, maisim_real erro);

#endif
