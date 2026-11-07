## No Simulink, no RT-LAB (OPAL-RT) ou no Simulink Real-Time (`alvos/simulink/simulink_sfun.c`)

1. No MATLAB, na pasta do controlador: `mex -I. alvos/simulink/simulink_sfun.c *.c` (precisa de um compilador C no MATLAB:
   `mex -setup`).
2. No modelo: um bloco **S-Function** com o nome `simulink_sfun`; na entrada, um **Mux** das medidas na ordem do comentário
   do arquivo; na saída, um **Demux** das atuações. O bloco roda a cada Ts.
3. No RT-LAB (OPAL-RT), o mesmo bloco entra no subsistema de controle (SC/SM) e compila junto com o modelo.

## Cuidados

- Uma atuação que o `maisim_passo` não escreve numa amostra mantém o valor de antes (como no MaiSim).
- O tempo `t` é o da simulação (`ssGetT`); no tempo real, é o do modelo.
