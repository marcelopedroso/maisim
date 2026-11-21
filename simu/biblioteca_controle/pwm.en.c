/* pwm.c — digital PWM (see pwm.h). */
#include "pwm.h"

void pwm_iniciar(PwmEstado *e, maisim_real fsw, int portadora) {
    e->fsw = fsw; e->tipo = portadora; e->portadora = 0.0;
}

maisim_real pwm_passo(PwmEstado *e, maisim_real t, maisim_real d) {
    maisim_real x = t * e->fsw;
    maisim_real c = x - floor(x + 1e-9);  /* the fraction of the period (1e-9 holds t·fsw that lands exactly on an integer) */
    if (e->tipo == PWM_TRIANGULAR)
        c = 1.0 - fabs(2.0 * c - 1.0);
    e->portadora = c;
    return c < d ? 1.0 : 0.0;
}

/* a register from the panel, or the default value (the panel without it) */
#ifdef P_TBPRD
#define PWM_TBPRD p[P_TBPRD]
#else
#define PWM_TBPRD 0.0
#endif
#ifdef P_f_clk
#define PWM_FCLK p[P_f_clk]
#else
#define PWM_FCLK 0.0
#endif
#ifdef P_CTRMODE
#define PWM_CTRMODE p[P_CTRMODE]
#else
#define PWM_CTRMODE 2.0
#endif
#ifdef P_SHDWAMODE
#define PWM_SHDWAMODE p[P_SHDWAMODE]
#else
#define PWM_SHDWAMODE 0.0
#endif
#ifdef P_INTSEL
#define PWM_INTSEL p[P_INTSEL]
#else
#define PWM_INTSEL 1.0
#endif
#ifdef P_DB
#define PWM_DB p[P_DB]
#else
#define PWM_DB 0.0
#endif
#ifdef P_TBPHS
#define PWM_TBPHS p[P_TBPHS]
#else
#define PWM_TBPHS 0.0
#endif
#ifdef P_dt
#define PWM_DT p[P_dt]
#else
#define PWM_DT 0.0
#endif

void pwm_iniciar_registradores(PwmRegistradores *e, const maisim_real p[MAISIM_N_P]) {
    int intsel = (int)PWM_INTSEL;
    (void)p;
    e->tbprd = PWM_TBPRD;
    e->modo = (int)PWM_CTRMODE;
    e->shdw = (int)PWM_SHDWAMODE;
    e->db = PWM_DB;
    e->periodo = e->modo == 2 ? 2.0 * e->tbprd : e->tbprd + 1.0;
    e->cps = PWM_DT * PWM_FCLK;                    /* counts per simulation step */
    e->dt = PWM_DT;
    e->n = e->dt > 0.0 ? (int)floor(p[P_Ts] / e->dt + 0.5) : 0;
    if (e->n < 1 || e->tbprd < 1.0 || !(e->cps > 0.0)) e->n = 0;    /* without the registers: pwm_pulsos does nothing */
    e->cmpa = 0.0; e->n_sombra = 0; e->bruto = 0; e->borda = -1e300; e->contador = 0.0;
    /* the counter starts so that the interrupt event falls at t = k·Ts (at PRD, the counter advanced by TBPRD) */
    e->fase = PWM_TBPHS + (intsel == 2 ? e->tbprd : 0.0);
}

static maisim_real pwm_contagem(const PwmRegistradores *e, long j) { return (maisim_real)j * e->cps + e->fase; }

static maisim_real pwm_valor(const PwmRegistradores *e, maisim_real N) {
    maisim_real x = N - e->periodo * floor(N / e->periodo + 1e-12);   /* the position in the period, from 0 to the period */
    if (e->modo == 2) return x <= e->tbprd ? x : e->periodo - x;
    if (e->modo == 1) return e->tbprd - x;
    return x;
}

static maisim_real pwm_eventos(const PwmRegistradores *e, maisim_real N) {
    /* how many load events have passed up to count N (zero and/or PRD, per SHDWAMODE) */
    maisim_real z = floor(N / e->periodo + 1e-12);
    maisim_real pr = floor((N - e->tbprd) / e->periodo + 1e-12);
    if (e->shdw == 0) return z;
    if (e->shdw == 1) return pr;
    return z + pr;
}

void pwm_pulsos(PwmRegistradores *e, maisim_real t, maisim_real CMPA, int u_a, int u_b) {
    long k;
    int o, i;
    if (e->n < 1) return;
    k = (long)floor(t / e->dt + 0.5);
    if (e->n_sombra == PWM_SOMBRA) {                 /* full (does not happen with one write per sample): the oldest goes */
        for (i = 1; i < PWM_SOMBRA; i++) { e->sombra_ev[i - 1] = e->sombra_ev[i]; e->sombra_cmpa[i - 1] = e->sombra_cmpa[i]; }
        e->n_sombra--;
    }
    e->sombra_ev[e->n_sombra] = pwm_eventos(e, pwm_contagem(e, k));   /* the written CMPA goes to the shadow register */
    e->sombra_cmpa[e->n_sombra++] = CMPA;
    for (o = 0; o < e->n; o++) {
        maisim_real N = pwm_contagem(e, k + 1 + o);  /* step k + 1 + o (the first one after the write) */
        maisim_real ev = pwm_eventos(e, N), c, x;
        int desce, bruto, pronto;
        while (e->n_sombra > 0 && e->sombra_ev[0] < ev) {   /* a load event after the write: the CMPA takes effect */
            if (e->n_sombra == 1 || e->sombra_ev[1] >= ev) e->cmpa = e->sombra_cmpa[0];
            for (i = 1; i < e->n_sombra; i++) { e->sombra_ev[i - 1] = e->sombra_ev[i]; e->sombra_cmpa[i - 1] = e->sombra_cmpa[i]; }
            e->n_sombra--;
        }
        c = pwm_valor(e, N);
        /* the comparator: sets when the down-counting counter reaches CMPA (c ≤ CMPA) and clears when the up-counting counter
           reaches it (c < CMPA): the pulse has 2·CMPA counts in up-down and CMPA in up count */
        x = N - e->periodo * floor(N / e->periodo + 1e-12);
        desce = e->modo == 1 || (e->modo == 2 && x >= e->tbprd);
        bruto = ((desce ? c <= e->cmpa : c < e->cmpa) && e->cmpa > 0) ? 1 : 0;
        if (bruto != e->bruto) { e->bruto = bruto; e->borda = N; }
        pronto = N - e->borda >= e->db;             /* the dead time: the rising edge of each output waits DB counts */
        if (u_a >= 0) maisim_padrao(u_a, o, (bruto && pronto) ? 1.0 : 0.0);
        if (u_b >= 0) maisim_padrao(u_b, o, (!bruto && pronto) ? 1.0 : 0.0);
        e->contador = c;
    }
}
