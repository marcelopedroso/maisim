/* pll — MaiSim library: the three-phase PLL in the synchronous reference frame (SRF-PLL), for grid-tied converters.
   Clarke (abc → αβ, amplitude-invariant), Park (αβ → dq) with the sample's angle, and the PI (pi.h) driving vq to zero:
   ω = 2π·f_nominal + PI(vq). With va = Vm·cos(θ), it locks with vd = Vm and vq = 0. The same operations, in the same order, as pll.py.
   The gains are for vq in volts: a starting point is kp = 2·ζ·ωn/Vm and ki = ωn²/Vm (ζ ≈ 0.7, ωn ≈ 2π·20 Hz).
   Use, in controle.c:
     #include "pll.h"
     in the Estado struct: PllEstado pll;
     in maisim_iniciar: pll_iniciar(&e->pll, 60.0, 0.5, 50.0, p[P_Ts], 10.0);
     in maisim_passo:   maisim_real th = pll_passo(&e->pll, m[M_v_a], m[M_v_b], m[M_v_c]);   (also e->pll.vd, .vq, .w) */
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
