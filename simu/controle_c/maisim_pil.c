/* O cronômetro do PIL (só na placa do HIL: o controle_worker_c.py com MAISIM_PIL=1, compilado com o gcc do sistema): chama
   o maisim_passo entre duas leituras do CLOCK_MONOTONIC e devolve quanto ele levou, em ns — o tempo do controle no próprio
   processador, sem a rede nem o ctypes. Não entra no SIL do PC nem no código exportado. */
#define _POSIX_C_SOURCE 199309L
#include <time.h>
#include "maisim_controle.h"

double maisim_pil_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado,
                        maisim_real u[MAISIM_N_U]) {
    struct timespec a, b;
    clock_gettime(CLOCK_MONOTONIC, &a);
    maisim_passo(t, m, p, estado, u);
    clock_gettime(CLOCK_MONOTONIC, &b);
    return (double)(b.tv_sec - a.tv_sec) * 1e9 + (double)(b.tv_nsec - a.tv_nsec);
}
