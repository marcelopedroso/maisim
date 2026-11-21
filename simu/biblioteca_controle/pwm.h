/* pwm — biblioteca do MaiSim: o PWM digital. As mesmas contas, na mesma ordem, do pwm.py. Dois jeitos:

   1. O ePWM de um DSP: o contador a f_clk, com os registradores nos parâmetros do painel (nomes do C2000: f_clk, TBPRD,
      CTRMODE, SHDWAMODE, INTSEL, DB, TBPHS; veja o pwm.py). Com f_clk e TBPRD no painel, o MaiSim tira o Ts deles.
      Uso, no controle.c:
        #include "pwm.h"
        no struct Estado: PwmRegistradores pwm;
        no maisim_iniciar: pwm_iniciar_registradores(&e->pwm, p);
        no maisim_passo:   pwm_pulsos(&e->pwm, t, CMPA, U_g, -1);   (CMPA em contagens; o 2º índice: a complementar com o
                           tempo morto, ou -1) — o pulso do intervalo inteiro vai às atuações pelo maisim_padrao.
      O CMPA escrito agora só vale no evento de carga seguinte (o registrador sombra). Use a Atuação "Logo".
      No alvo, quem gera o pulso é o ePWM: troque o pwm_pulsos pela escrita do CMPA no registrador.

   2. O PWM comparado a cada Ts (o de antes; a resolução do PWM é o Ts):
        no struct Estado: PwmEstado pwm;
        no maisim_iniciar: pwm_iniciar(&e->pwm, p[P_fsw], PWM_SERRA);   (ou PWM_TRIANGULAR)
        no maisim_passo:   u[U_g] = pwm_passo(&e->pwm, t, d);   (1.0 ou 0.0; e->pwm.portadora vai ao scope) */
#ifndef PWM_H
#define PWM_H

#include "maisim_controle.h"

#define PWM_SERRA 0
#define PWM_TRIANGULAR 1
#define PWM_SOMBRA 8

typedef struct {
    maisim_real fsw;
    int tipo;
    maisim_real portadora;
} PwmEstado;

typedef struct {
    maisim_real tbprd, periodo, cps, dt, fase, db, cmpa, borda, contador;
    int modo, shdw, n, bruto, n_sombra;
    maisim_real sombra_ev[PWM_SOMBRA], sombra_cmpa[PWM_SOMBRA];
} PwmRegistradores;

void pwm_iniciar(PwmEstado *e, maisim_real fsw, int portadora);
maisim_real pwm_passo(PwmEstado *e, maisim_real t, maisim_real d);

void pwm_iniciar_registradores(PwmRegistradores *e, const maisim_real p[MAISIM_N_P]);
void pwm_pulsos(PwmRegistradores *e, maisim_real t, maisim_real CMPA, int u_a, int u_b);

#endif
