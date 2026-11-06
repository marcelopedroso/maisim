/* rampa — MaiSim library: the rate limiter (ramp) for the reference, for a soft start.
   The output moves at most rate·Ts per sample towards the reference. The same operations, in the same order, as rampa.py.
   Use, in controle.c (rate in units per second, e.g. A/s):
     #include "rampa.h"
     in the Estado struct: RampaEstado rampa;
     in maisim_iniciar: rampa_iniciar(&e->rampa, 1000.0, p[P_Ts], 0.0);
     in maisim_passo:   maisim_real ref = rampa_passo(&e->rampa, p[P_i_ref]); */
#ifndef RAMPA_H
#define RAMPA_H

#include "maisim_controle.h"

typedef struct {
    maisim_real passo_max, y;
} RampaEstado;

void rampa_iniciar(RampaEstado *e, maisim_real taxa, maisim_real ts, maisim_real inicial);
maisim_real rampa_passo(RampaEstado *e, maisim_real ref);

#endif
