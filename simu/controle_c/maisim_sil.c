/* O calço do SIL (controle_worker_c.py): guarda o que o controle mandou com maisim_scope() nesta amostra, para o worker
   ler e mandar ao Scope, e as mensagens (as que chegaram nesta amostra, para o maisim_recebeu, e as que o controle mandou
   com o maisim_envia, para o worker levar à rede). Compilado junto com o controle.c, só dentro do MaiSim (no alvo, o
   maisim_scope e as mensagens são do usuário). */
#include <string.h>
#include "maisim_controle.h"

#define MAISIM_SIL_MAX 256
#define MAISIM_SIL_NOME 64
static char sil_nome[MAISIM_SIL_MAX][MAISIM_SIL_NOME];
static double sil_valor[MAISIM_SIL_MAX];
static int sil_n;
static int nome_longo;                             /* um nome que não cabe (cortado viraria outro): o worker acusa */

void maisim_scope(const char *nome, maisim_real valor) {
    int i;
    if (!nome) return;
    if (strlen(nome) >= MAISIM_SIL_NOME) { nome_longo = 1; return; }
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

/* as mensagens: (o outro controlador, a chave, o valor) */
static char env_para[MAISIM_SIL_MAX][MAISIM_SIL_NOME], env_chave[MAISIM_SIL_MAX][MAISIM_SIL_NOME];
static double env_valor[MAISIM_SIL_MAX];
static int env_n, env_estouro;
static char rec_de[MAISIM_SIL_MAX][MAISIM_SIL_NOME], rec_chave[MAISIM_SIL_MAX][MAISIM_SIL_NOME];
static double rec_valor[MAISIM_SIL_MAX];
static int rec_n;

static void copia(char *dst, const char *src) { strncpy(dst, src, MAISIM_SIL_NOME - 1); dst[MAISIM_SIL_NOME - 1] = 0; }

void maisim_envia(const char *para, const char *chave, maisim_real valor) {
    int i;
    if (!para || !chave) return;
    if (strlen(para) >= MAISIM_SIL_NOME || strlen(chave) >= MAISIM_SIL_NOME) { nome_longo = 1; return; }
    for (i = 0; i < env_n; i++)                    /* a mesma chave ao mesmo controlador nesta amostra: vale a última */
        if (strncmp(env_para[i], para, MAISIM_SIL_NOME - 1) == 0 && strncmp(env_chave[i], chave, MAISIM_SIL_NOME - 1) == 0) {
            env_valor[i] = (double)valor; return;
        }
    if (env_n >= MAISIM_SIL_MAX) { env_estouro = 1; return; }
    copia(env_para[env_n], para); copia(env_chave[env_n], chave); env_valor[env_n++] = (double)valor;
}

int maisim_recebeu(const char *de, const char *chave, maisim_real *valor) {
    int i;
    if (!de || !chave) return 0;
    for (i = rec_n - 1; i >= 0; i--)               /* a mais recente */
        if (strncmp(rec_de[i], de, MAISIM_SIL_NOME - 1) == 0 && strncmp(rec_chave[i], chave, MAISIM_SIL_NOME - 1) == 0) {
            if (valor) *valor = (maisim_real)rec_valor[i];
            return 1;
        }
    return 0;
}

int maisim_sil_env_n(void) { return env_n; }
int maisim_sil_env_estouro(void) { return env_estouro; }
int maisim_sil_nome_longo(void) { return nome_longo; }
const char *maisim_sil_env_para(int i) { return env_para[i]; }
const char *maisim_sil_env_chave(int i) { return env_chave[i]; }
double maisim_sil_env_valor(int i) { return env_valor[i]; }
void maisim_sil_recebida(const char *de, const char *chave, double valor) {
    if (rec_n >= MAISIM_SIL_MAX) return;
    copia(rec_de[rec_n], de); copia(rec_chave[rec_n], chave); rec_valor[rec_n++] = valor;
}
void maisim_sil_limpa(void) { sil_n = 0; env_n = 0; env_estouro = 0; rec_n = 0; nome_longo = 0; }
