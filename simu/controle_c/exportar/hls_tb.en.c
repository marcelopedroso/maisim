/* hls_tb.c — the testbench for Vitis HLS C simulation (and the PC): reads medidas.csv, calls maisim_top on each line and writes
   atuacoes.csv, like teste/replay.c — compare with the MaiSim run before synthesis.
   On the PC: gcc -std=c99 -I. *.c alvos/fpga_hls/hls_top.c alvos/fpga_hls/hls_tb.c -lm -o tb && ./tb teste/medidas.csv teste/atuacoes.csv */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "maisim_controle.h"

void maisim_top(const maisim_real m[MAISIM_N_M], maisim_real u[MAISIM_N_U]);
static const char *nomes_m[] = { {{NOMES_M}} };
static const char *nomes_u[] = { {{NOMES_U}} };
static char linha[1 << 20];

int main(int argc, char **argv) {
    FILE *e = fopen(argc > 1 ? argv[1] : "teste/medidas.csv", "r"), *s = fopen(argc > 2 ? argv[2] : "teste/atuacoes.csv", "w");
    char *c;
    int *col, n_col = 0, k, j, achou[MAISIM_N_M > 0 ? MAISIM_N_M : 1] = {0};
    maisim_real m[MAISIM_N_M], u[MAISIM_N_U];
    double t;
    if (!e || !s) return 1;
    for (k = 0; k < MAISIM_N_M; k++) m[k] = NAN;
    if (!fgets(linha, sizeof linha, e)) return 1;
    for (k = 1, c = linha; *c; c++) k += (*c == ',');
    col = (int *)malloc(sizeof(int) * k);
    for (c = strtok(linha, ",\r\n"); c; c = strtok(NULL, ",\r\n")) {
        col[n_col] = -2;
        if (strcmp(c, "t") == 0) col[n_col] = -1;
        for (k = 0; k < {{N_M_CSV}}; k++) if (strcmp(c, nomes_m[k]) == 0) { col[n_col] = k; achou[k] = 1; }
        n_col++;
    }
    for (k = 0; k < {{N_M_CSV}}; k++)
        if (!achou[k]) { fprintf(stderr, "measurement %s is not in the CSV\n", nomes_m[k]); return 2; }
    fprintf(s, "t");
    for (k = 0; k < (int)(sizeof nomes_u / sizeof *nomes_u) && nomes_u[k]; k++) fprintf(s, ",%s", nomes_u[k]);
    fprintf(s, "\n");
    while (fgets(linha, sizeof linha, e)) {
        t = 0;
        for (j = 0, c = strtok(linha, ",\r\n"); c && j < n_col; c = strtok(NULL, ",\r\n"), j++) {
            if (col[j] == -1) t = strtod(c, NULL);
            else if (col[j] >= 0) m[col[j]] = (maisim_real)strtod(c, NULL);
        }
        for (k = 0; k < MAISIM_N_U; k++) u[k] = NAN;
        maisim_top(m, u);
        fprintf(s, "%.17g", t);
        for (k = 0; k < (int)(sizeof nomes_u / sizeof *nomes_u) && nomes_u[k]; k++)
            if (u[k] == u[k]) fprintf(s, ",%.17g", (double)u[k]); else fprintf(s, ",");
        fprintf(s, "\n");
    }
    fclose(e); fclose(s);
    return 0;
}
