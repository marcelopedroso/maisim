/* simulink_sfun.c — o controle como uma S-function em C (nível 2) para o Simulink, o RT-LAB da OPAL-RT e o Simulink Real-Time,
   gerada pelo MaiSim: a mesma chamada do SIL (maisim_iniciar no começo, maisim_passo a cada Ts).
   Uma entrada (o vetor das medidas, nesta ordem: {{ORDEM_M}}) e uma saída (o vetor das atuações: {{ORDEM_U}}).
   Compilar no MATLAB, na pasta do controlador: mex -I. alvos/simulink/simulink_sfun.c *.c
   No modelo: um bloco S-Function com o nome simulink_sfun; um Mux das medidas na entrada; um Demux das atuações na saída. */
#define S_FUNCTION_NAME simulink_sfun
#define S_FUNCTION_LEVEL 2
#include "simstruc.h"
#include <stdlib.h>
#include "maisim_controle.h"
#include "maisim_parametros.h"

static void mdlInitializeSizes(SimStruct *S) {
    ssSetNumSFcnParams(S, 0);
    if (!ssSetNumInputPorts(S, 1) || !ssSetNumOutputPorts(S, 1)) return;
    ssSetInputPortWidth(S, 0, MAISIM_N_M);
    ssSetInputPortDirectFeedThrough(S, 0, 1);
    ssSetOutputPortWidth(S, 0, MAISIM_N_U);
    ssSetNumSampleTimes(S, 1);
    ssSetNumPWork(S, 2);            /* o estado do controle e a última atuação */
    ssSetOptions(S, SS_OPTION_EXCEPTION_FREE_CODE);
}

static void mdlInitializeSampleTimes(SimStruct *S) {
    ssSetSampleTime(S, 0, MAISIM_TS);
    ssSetOffsetTime(S, 0, 0.0);
}

#define MDL_START
static void mdlStart(SimStruct *S) {
    maisim_real p[MAISIM_N_P];
    int k;
    void *estado = calloc(1, maisim_tamanho_estado() + 8);
    maisim_real *ultima = (maisim_real *)calloc(MAISIM_N_U, sizeof(maisim_real));
    for (k = 0; k < MAISIM_N_P; k++) p[k] = maisim_p_iniciais[k];
    ssGetPWork(S)[0] = estado;
    ssGetPWork(S)[1] = ultima;
    maisim_iniciar(p, estado);
}

static void mdlOutputs(SimStruct *S, int_T tid) {
    InputRealPtrsType ent = ssGetInputPortRealSignalPtrs(S, 0);
    real_T *sai = ssGetOutputPortRealSignal(S, 0);
    maisim_real m[MAISIM_N_M], p[MAISIM_N_P], u[MAISIM_N_U], *ultima = (maisim_real *)ssGetPWork(S)[1];
    int k;
    (void)tid;
    for (k = 0; k < MAISIM_N_P; k++) p[k] = maisim_p_iniciais[k];
    for (k = 0; k < MAISIM_N_M; k++) m[k] = (maisim_real)*ent[k];
    for (k = 0; k < MAISIM_N_U; k++) u[k] = NAN;
    maisim_passo((maisim_real)ssGetT(S), m, p, ssGetPWork(S)[0], u);
    for (k = 0; k < MAISIM_N_U; k++) {
        if (u[k] == u[k]) ultima[k] = u[k];   /* a que ficou NAN mantém o valor de antes */
        sai[k] = (real_T)ultima[k];
    }
}

static void mdlTerminate(SimStruct *S) {
    free(ssGetPWork(S)[0]);
    free(ssGetPWork(S)[1]);
}

#ifdef MATLAB_MEX_FILE
#include "simulink.c"
#else
#include "cg_sfun.h"
#endif
