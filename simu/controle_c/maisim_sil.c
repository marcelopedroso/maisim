/* O calço do SIL (controle_worker_c.py): guarda o que o controle mandou com maisim_scope() nesta amostra, para o worker
   ler e mandar ao Scope. Compilado junto com o controle.c, só dentro do MaiSim (no alvo, o maisim_scope é do usuário). */
#include <string.h>
#include "maisim_controle.h"

#define MAISIM_SIL_MAX 256
#define MAISIM_SIL_NOME 64
static char sil_nome[MAISIM_SIL_MAX][MAISIM_SIL_NOME];
static double sil_valor[MAISIM_SIL_MAX];
static int sil_n;

void maisim_scope(const char *nome, maisim_real valor) {
    int i;
    if (!nome) return;
    for (i = 0; i < sil_n; i++)
        if (strncmp(sil_nome[i], nome, MAISIM_SIL_NOME - 1) == 0) { sil_valor[i] = (double)valor; return; }
    if (sil_n < MAISIM_SIL_MAX) {
        strncpy(sil_nome[sil_n], nome, MAISIM_SIL_NOME - 1);
        sil_nome[sil_n][MAISIM_SIL_NOME - 1] = 0;
        sil_valor[sil_n++] = (double)valor;
    }
}

int maisim_sil_n(void) { return sil_n; }
const char *maisim_sil_nome(int i) { return sil_nome[i]; }
double maisim_sil_valor(int i) { return sil_valor[i]; }
void maisim_sil_limpa(void) { sil_n = 0; }
