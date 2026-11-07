/* hls_top.c — o controle como a função de topo de um IP de FPGA (Vitis HLS da AMD/Xilinx), gerado pelo MaiSim.
   O HLS lê este C (o mesmo do SIL) e gera o VHDL/Verilog: a cada chamada (a cada Ts), as medidas entram por m e as
   atuações saem por u; o estado fica em registradores (static). Em ponto flutuante (float) é direto; para ponto fixo,
   compile como C++ com typedef ap_fixed<W,I> maisim_real e as funções do hls_math (veja o LEIA.md).
   Ordem das medidas: {{ORDEM_M}}; das atuações: {{ORDEM_U}}. */
#include "maisim_controle.h"
#include "maisim_parametros.h"

#ifndef MAISIM_ESTADO_MAX
#define MAISIM_ESTADO_MAX 8192      /* bytes para o estado do controle (maisim_tamanho_estado() tem de caber) */
#endif

void maisim_top(const maisim_real m[MAISIM_N_M], maisim_real u[MAISIM_N_U]) {
#pragma HLS INTERFACE s_axilite port=return
#pragma HLS INTERFACE s_axilite port=m
#pragma HLS INTERFACE s_axilite port=u
    static long long estado[MAISIM_ESTADO_MAX / sizeof(long long)];
    static maisim_real p[MAISIM_N_P], ultima[MAISIM_N_U];   /* a última de cada atuação: a que o passo não escrever fica como estava */
    static unsigned long long n;           /* t = n·Ts */
    static int iniciado = 0;
    maisim_real nova[MAISIM_N_U];
    int k;
    if (maisim_tamanho_estado() > sizeof(estado)) {   /* o estado não cabe: aumente MAISIM_ESTADO_MAX */
        for (k = 0; k < MAISIM_N_U; k++) u[k] = 0;
        return;
    }
    if (!iniciado) {
        for (k = 0; k < MAISIM_N_P; k++) p[k] = maisim_p_iniciais[k];
        for (k = 0; k < MAISIM_N_U; k++) ultima[k] = 0;
        maisim_iniciar(p, estado);
        n = 0;
        iniciado = 1;
    }
    for (k = 0; k < MAISIM_N_U; k++) nova[k] = NAN;
    maisim_passo((maisim_real)((double)n * MAISIM_TS), m, p, estado, nova);
    for (k = 0; k < MAISIM_N_U; k++) {
        if (nova[k] == nova[k]) ultima[k] = nova[k];
        u[k] = ultima[k];
    }
    n++;
}
