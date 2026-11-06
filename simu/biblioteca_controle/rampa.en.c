/* rampa.c — the rate limiter (see rampa.h). */
#include "rampa.h"

void rampa_iniciar(RampaEstado *e, maisim_real taxa, maisim_real ts, maisim_real inicial) {
    e->passo_max = taxa * ts;
    e->y = inicial;
}

maisim_real rampa_passo(RampaEstado *e, maisim_real ref) {
    maisim_real dif = ref - e->y;
    if (dif > e->passo_max)
        e->y = e->y + e->passo_max;
    else if (dif < -e->passo_max)
        e->y = e->y - e->passo_max;
    else
        e->y = ref;
    return e->y;
}
