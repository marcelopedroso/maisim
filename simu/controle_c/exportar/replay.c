/* replay.c — o mesmo controle no PC, a partir de um CSV de medidas (um PIL no PC, gerado pelo MaiSim).
   Lê o medidas.csv (a 1ª linha: t e os nomes das medidas; depois, uma amostra por linha), chama maisim_passo e grava as
   atuações no atuacoes.csv (t e uma coluna por atuação; vazio = não escrita naquela amostra). Compare com a rodada do MaiSim.
   Compilar: gcc -std=c99 -ffp-contract=off -I. *.c teste/replay.c -lm -o replay   (na pasta do controlador)
   Rodar: ./replay teste/medidas.csv teste/atuacoes.csv */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "maisim_controle.h"
#include "maisim_parametros.h"

static const char *nomes_m[] = { {{NOMES_M}} };
static const char *nomes_u[] = { {{NOMES_U}} };
static long long estado[1 << 16];

int main(int argc, char **argv) {
    FILE *e = fopen(argc > 1 ? argv[1] : "teste/medidas.csv", "r"), *s = fopen(argc > 2 ? argv[2] : "teste/atuacoes.csv", "w");
    char linha[65536], *c;
    int col[256], n_col = 0, k, j;
    maisim_real m[MAISIM_N_M], p[MAISIM_N_P], u[MAISIM_N_U], t;
    if (!e || !s) { fprintf(stderr, "não abriu o CSV\n"); return 1; }
    if (maisim_tamanho_estado() > sizeof(estado)) { fprintf(stderr, "estado grande demais\n"); return 1; }
    for (k = 0; k < MAISIM_N_P; k++) p[k] = maisim_p_iniciais[k];
    for (k = 0; k < MAISIM_N_M; k++) m[k] = NAN;
    maisim_iniciar(p, estado);
    if (!fgets(linha, sizeof linha, e)) return 1;
    for (c = strtok(linha, ",\r\n"); c && n_col < 256; c = strtok(NULL, ",\r\n")) {   /* a coluna de cada medida (pelo nome) */
        col[n_col] = -2;
        if (strcmp(c, "t") == 0) col[n_col] = -1;
        for (k = 0; k < {{N_M_CSV}}; k++) if (strcmp(c, nomes_m[k]) == 0) col[n_col] = k;
        n_col++;
    }
    fprintf(s, "t");
    for (k = 0; k < (int)(sizeof nomes_u / sizeof *nomes_u) && nomes_u[k]; k++) fprintf(s, ",%s", nomes_u[k]);
    fprintf(s, "\n");
    while (fgets(linha, sizeof linha, e)) {
        t = 0;
        for (j = 0, c = strtok(linha, ",\r\n"); c && j < n_col; c = strtok(NULL, ",\r\n"), j++) {
            if (col[j] == -1) t = (maisim_real)strtod(c, NULL);
            else if (col[j] >= 0) m[col[j]] = (maisim_real)strtod(c, NULL);
        }
        for (k = 0; k < MAISIM_N_U; k++) u[k] = NAN;
        maisim_passo(t, m, p, estado, u);
        fprintf(s, "%.17g", (double)t);
        for (k = 0; k < (int)(sizeof nomes_u / sizeof *nomes_u) && nomes_u[k]; k++)
            if (u[k] == u[k]) fprintf(s, ",%.17g", (double)u[k]); else fprintf(s, ",");
        fprintf(s, "\n");
    }
    fclose(e); fclose(s);
    return 0;
}
