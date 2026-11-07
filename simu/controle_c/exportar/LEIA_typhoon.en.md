## In Typhoon HIL (`alvos/typhoon/typhoon.txt`)

1. In the Schematic Editor, place a **C function** block (Signal processing → Extra) on the control side.
2. Set up the inputs and outputs (real, with the names in the file) and Execution rate = Ts.
3. Copy each section of `typhoon.txt` (Global variables, Init function, Output function) into the tab of the same name.

## Caveats

- The whole code goes into the Global variables tab (the control and the modules together, with no local `#include`s):
  change it in MaiSim and export again, rather than editing it there.
- The port names are MaiSim's signal names (as C identifiers).
