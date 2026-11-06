/* passa_baixa.c — o filtro passa-baixa de 1ª ordem (veja o passa_baixa.h). */
#include "passa_baixa.h"

#define PASSA_BAIXA_PI 3.14159265358979323846  /* o math.pi do Python */

void passa_baixa_iniciar(PassaBaixaEstado *e, maisim_real fc, maisim_real ts, maisim_real inicial) {
    e->a = ts / (ts + 1.0 / (2.0 * PASSA_BAIXA_PI * fc));
    e->y = inicial;
}

maisim_real passa_baixa_passo(PassaBaixaEstado *e, maisim_real x) {
    e->y = e->y + e->a * (x - e->y);
    return e->y;
}
