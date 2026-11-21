/* pwm — MaiSim library: the digital PWM. The same operations, in the same order, as pwm.py. Two ways:

   1. The ePWM of a DSP: the counter at f_clk, with the registers in the panel parameters (C2000 names: f_clk, TBPRD,
      CTRMODE, SHDWAMODE, INTSEL, DB, TBPHS; see pwm.py). With f_clk and TBPRD in the panel, MaiSim takes Ts from them.
      Use, in controle.c:
        #include "pwm.h"
        in the Estado struct: PwmRegistradores pwm;
        in maisim_iniciar: pwm_iniciar_registradores(&e->pwm, p);
        in maisim_passo:   pwm_pulsos(&e->pwm, t, CMPA, U_g, -1);   (CMPA in counts; the 2nd index: the complementary with
                           the dead time, or -1) — the pulse of the whole interval goes to the actuations through maisim_padrao.
      The CMPA written now only takes effect at the next load event (the shadow register). Use the "Right away" actuation.
      On the target, the ePWM generates the pulse: replace pwm_pulsos with writing CMPA to the register.

   2. The PWM compared every Ts (the earlier one; the PWM resolution is Ts):
        in the Estado struct: PwmEstado pwm;
        in maisim_iniciar: pwm_iniciar(&e->pwm, p[P_fsw], PWM_SERRA);   (or PWM_TRIANGULAR)
        in maisim_passo:   u[U_g] = pwm_passo(&e->pwm, t, d);   (1.0 or 0.0; e->pwm.portadora can go to the scope) */
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
