/* passa_baixa — MaiSim library: the first-order digital low-pass filter (backward Euler), for a noisy measurement.
   y += a·(x − y), with a = Ts / (Ts + 1/(2π·fc)). The same operations, in the same order, as passa_baixa.py.
   Use, in controle.c:
     #include "passa_baixa.h"
     in the Estado struct: PassaBaixaEstado filtro_v;
     in maisim_iniciar: passa_baixa_iniciar(&e->filtro_v, 500.0, p[P_Ts], 0.0);
     in maisim_passo:   maisim_real v = passa_baixa_passo(&e->filtro_v, m[M_v_o]); */
#ifndef PASSA_BAIXA_H
#define PASSA_BAIXA_H

#include "maisim_controle.h"

typedef struct {
    maisim_real a, y;
} PassaBaixaEstado;

void passa_baixa_iniciar(PassaBaixaEstado *e, maisim_real fc, maisim_real ts, maisim_real inicial);
maisim_real passa_baixa_passo(PassaBaixaEstado *e, maisim_real x);

#endif
