/* O controle em C do circuito (o mesmo contrato num DSP: veja o maisim_controle.h).
   O maisim_sinais.h, gerado pelo MaiSim a partir do painel, dá os índices:
     m[M_<medida>]     as medidas marcadas "→ Controle"
     p[P_<parâmetro>]  os parâmetros do painel (p[P_Ts] é o Ts efetivo)
     u[U_<atuação>]    as atuações marcadas (a que não escrever fica como estava)
   O estado vive no struct Estado (sem malloc). maisim_scope("nome", valor) manda uma variável ao Scope. */
#include "maisim_controle.h"

typedef struct {
    maisim_real integral;
} Estado;

size_t maisim_tamanho_estado(void) { return sizeof(Estado); }

void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *estado) {
    Estado *e = (Estado *)estado;
    e->integral = 0.0;
}

void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado,
                  maisim_real u[MAISIM_N_U]) {
    Estado *e = (Estado *)estado;
    (void)t; (void)m; (void)p; (void)e; (void)u;
    /* exemplo: u[U_minha_atuacao] = p[P_Kp] * (p[P_ref] - m[M_minha_medida]); */
}
