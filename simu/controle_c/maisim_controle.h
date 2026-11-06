/* O contrato do controle em C do MaiSim (o mesmo no SIL, dentro da simulação, e no alvo: DSP, microcontrolador, HIL).
   O controle.c implementa as quatro funções abaixo; o maisim_sinais.h, gerado pelo MaiSim a partir do painel de Controle,
   dá os índices das medidas (M_<nome>), dos parâmetros (P_<nome>, com P_Ts) e das atuações (U_<nome>).

   Regras (para o mesmo código servir no C2000 e, depois, no HLS de FPGA): o estado num struct (sem malloc), sem recursão,
   laços com limite fixo, só <math.h>. Uma atuação que o passo não escreve fica com NAN (não muda no circuito nesta amostra).

   maisim_real é double por padrão; -DMAISIM_REAL=float compila em precisão simples (o double do C28x tem 32 bits). */
#ifndef MAISIM_CONTROLE_H
#define MAISIM_CONTROLE_H

#include <stddef.h>
#include <math.h>

#ifndef MAISIM_REAL
#define MAISIM_REAL double
#endif
typedef MAISIM_REAL maisim_real;

#include "maisim_sinais.h"

/* quantos bytes de estado o controle precisa (sizeof do struct dele); quem chama dá a memória, zerada */
size_t maisim_tamanho_estado(void);
/* no começo da rodada, com os parâmetros do painel (p[P_Ts] é o Ts efetivo) */
void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *estado);
/* a cada Ts: lê as medidas m[], escreve as atuações u[] (as que não escrever ficam NAN) */
void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado,
                  maisim_real u[MAISIM_N_U]);
/* manda uma variável ao Scope (no SIL); no alvo, defina como vazia */
void maisim_scope(const char *nome, maisim_real valor);

#endif
