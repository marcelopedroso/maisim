## Na FPGA, pelo Vitis HLS da AMD/Xilinx (`alvos/fpga_hls/`)

O HLS lê **C** (o mesmo do SIL) e gera o VHDL/Verilog do IP: você não escreve HDL.

1. No Vitis HLS (ou no Vitis Unified): um componente HLS com os `.c` da pasta e o `alvos/fpga_hls/hls_top.c`; a função
   de topo é `maisim_top`. O testbench é o `alvos/fpga_hls/hls_tb.c` (o `teste/medidas.csv` de entrada).
2. **C simulation** primeiro (o testbench compara com a rodada do MaiSim), depois **C synthesis** e **Export RTL** (um IP
   para o Vivado, com a interface AXI-Lite: chame a cada Ts).
3. No PC, o mesmo testbench: `gcc -std=c99 -I. *.c alvos/fpga_hls/hls_top.c alvos/fpga_hls/hls_tb.c -lm -o tb`.

## Ponto fixo

Em `float` o HLS sintetiza direto (gasta DSPs e lógica). Para **ponto fixo** (o comum em FPGA), compile como C++ com
`typedef ap_fixed<32,16> maisim_real;` (o `MAISIM_REAL` do `maisim_controle.h`) e as funções do `hls_math.h`, e confira de
novo na C simulation: a quantização muda o resultado, e o tamanho (W, I) se escolhe olhando o erro.

## Cuidados

- As regras do contrato (estado num struct, sem malloc, sem recursão, laços com limite fixo) já são as do HLS.
- O `maisim_scope` e as mensagens não viram hardware: no `maisim_alvo.c`, deixe vazios ou ligue a portas do IP.
