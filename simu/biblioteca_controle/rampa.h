/* rampa — biblioteca do MaiSim: o limitador de taxa (rampa) da referência, para uma partida suave.
   A saída anda no máximo taxa·Ts por amostra até a referência. As mesmas contas, na mesma ordem, do rampa.py.
   Uso, no controle.c (taxa em unidades por segundo, por exemplo A/s):
     #include "rampa.h"
     no struct Estado: RampaEstado rampa;
     no maisim_iniciar: rampa_iniciar(&e->rampa, 1000.0, p[P_Ts], 0.0);
     no maisim_passo:   maisim_real ref = rampa_passo(&e->rampa, p[P_i_ref]); */
#ifndef RAMPA_H
#define RAMPA_H

#include "maisim_controle.h"

typedef struct {
    maisim_real passo_max, y;
} RampaEstado;

void rampa_iniciar(RampaEstado *e, maisim_real taxa, maisim_real ts, maisim_real inicial);
maisim_real rampa_passo(RampaEstado *e, maisim_real ref);

#endif
