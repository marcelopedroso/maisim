## On an FPGA, with AMD/Xilinx Vitis HLS (`alvos/fpga_hls/`)

HLS reads **C** (the same as in the SIL) and generates the IP's VHDL/Verilog: you do not write HDL.

1. In Vitis HLS (or Vitis Unified): an HLS component with the folder's `.c` files and `alvos/fpga_hls/hls_top.c`; the top
   function is `maisim_top`. The testbench is `alvos/fpga_hls/hls_tb.c` (with `teste/medidas.csv` as input).
2. **C simulation** first (the testbench compares with the MaiSim run), then **C synthesis** and **Export RTL** (an IP for
   Vivado, with an AXI-Lite interface: call it every Ts).
3. On the PC, the same testbench: `gcc -std=c99 -I. *.c alvos/fpga_hls/hls_top.c alvos/fpga_hls/hls_tb.c -lm -o tb`.

## Fixed point

In `float`, HLS synthesizes directly (it uses DSPs and logic). For **fixed point** (common on FPGAs), build as C++ with
`typedef ap_fixed<32,16> maisim_real;` (the `MAISIM_REAL` of `maisim_controle.h`) and the `hls_math.h` functions, and check
again in C simulation: quantization changes the result, and the size (W, I) is chosen by looking at the error.

## Caveats

- The contract rules (state in a struct, no malloc, no recursion, fixed-bound loops) are already HLS's rules.
- `maisim_scope` and the messages do not become hardware: in `maisim_alvo.c`, leave them empty or wire them to IP ports.
