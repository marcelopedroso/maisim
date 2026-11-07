## In Simulink, RT-LAB (OPAL-RT) or Simulink Real-Time (`alvos/simulink/simulink_sfun.c`)

1. In MATLAB, in the controller's folder: `mex -I. alvos/simulink/simulink_sfun.c *.c` (needs a C compiler in MATLAB:
   `mex -setup`).
2. In the model: an **S-Function** block named `simulink_sfun`; at the input, a **Mux** of the measurements in the order
   given in the file's comment; at the output, a **Demux** of the actuations. The block runs every Ts.
3. In RT-LAB (OPAL-RT), the same block goes into the control subsystem (SC/SM) and is built with the model.

## Caveats

- An actuation that `maisim_passo` does not write in a sample keeps its previous value (as in MaiSim).
- The time `t` is the simulation time (`ssGetT`); in real time, it is the model's.
