/* pll — biblioteca do MaiSim: o PLL trifásico no referencial síncrono (SRF-PLL), para conversores ligados à rede.
   Clarke (abc → αβ, invariante em amplitude), Park (αβ → dq) com o ângulo da amostra e o PI (pi.h) zerando vq:
   ω = 2π·f_nominal + PI(vq). Com va = Vm·cos(θ), trava com vd = Vm e vq = 0. As mesmas contas, na mesma ordem, do pll.py.
   Os ganhos valem para vq em volts: um ponto de partida é kp = 2·ζ·ωn/Vm e ki = ωn²/Vm (ζ ≈ 0,7, ωn ≈ 2π·20 Hz).
   Uso, no controle.c:
     #include "pll.h"
     no struct Estado: PllEstado pll;
     no maisim_iniciar: pll_iniciar(&e->pll, 60.0, 0.5, 50.0, p[P_Ts], 10.0);
     no maisim_passo:   maisim_real th = pll_passo(&e->pll, m[M_v_a], m[M_v_b], m[M_v_c]);   (e e->pll.vd, .vq, .w) */
#ifndef PLL_H
#define PLL_H

#include "maisim_controle.h"
#include "pi.h"

typedef struct {
    maisim_real w0, ts, theta, w, vd, vq;
    PiEstado pi;
} PllEstado;

void pll_iniciar(PllEstado *e, maisim_real f_nominal, maisim_real kp, maisim_real ki, maisim_real ts, maisim_real desvio_max);
maisim_real pll_passo(PllEstado *e, maisim_real va, maisim_real vb, maisim_real vc);

#endif
