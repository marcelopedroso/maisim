/* passa_baixa — biblioteca do MaiSim: o filtro passa-baixa digital de 1ª ordem (Euler para trás), para uma medida ruidosa.
   y += a·(x − y), com a = Ts / (Ts + 1/(2π·fc)). As mesmas contas, na mesma ordem, do passa_baixa.py.
   Uso, no controle.c:
     #include "passa_baixa.h"
     no struct Estado: PassaBaixaEstado filtro_v;
     no maisim_iniciar: passa_baixa_iniciar(&e->filtro_v, 500.0, p[P_Ts], 0.0);
     no maisim_passo:   maisim_real v = passa_baixa_passo(&e->filtro_v, m[M_v_o]); */
#ifndef PASSA_BAIXA_H
#define PASSA_BAIXA_H

#include "maisim_controle.h"

typedef struct {
    maisim_real a, y;
} PassaBaixaEstado;

void passa_baixa_iniciar(PassaBaixaEstado *e, maisim_real fc, maisim_real ts, maisim_real inicial);
maisim_real passa_baixa_passo(PassaBaixaEstado *e, maisim_real x);

#endif
