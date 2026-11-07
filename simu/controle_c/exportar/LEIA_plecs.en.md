## In PLECS (`alvos/plecs/plecs.txt`)

1. Place a **C-Script** block (Control → Functions & Tables).
2. In Setup: the number of inputs and outputs from the file, Sample time = Ts and Direct feedthrough on.
3. In Code: copy each section of `plecs.txt` (Code declarations, Start function code, Output function code).
4. At the input, a **Mux** of the measurements in the file's order; at the output, a **Demux** of the actuations.

## Caveats

- The whole code goes into Code declarations (the control and the modules together): change it in MaiSim and export again.
- The time is PLECS's `CurrentTime`.
