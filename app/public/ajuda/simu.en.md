# Circuit editor (Simu)

Simu (`/maisim/simu/`) is the graphical environment where you draw electrical schematics, configure meters and signals, set simulation parameters, and run GeckoCIRCUITS in the background.

## Header and top toolbar

- **Open and File:** browse your saved models, open bundled examples, or start from a blank sheet; save with **Ctrl+S** (the orange dot highlights unsaved edits).
- **Simulation (▶ and ⚙):** launch calculations with the play button or press **Ctrl+Enter**; pause and resume using **Space**; the gear icon tunes time step $\Delta t$ and total duration.
- **Scope and Control dock:** toggle the embedded [Scope](#ajuda:scope) or [Control](#ajuda:codigo) panel directly inside the window (docked beside or below).
- **Global variables ($):** manage global constants and parameters; enter `$name` inside any component field to bind it.

## Schematic drafting

- **Placing components:** pick elements from the side palette (Sources, Semiconductors, Passives, Meters) or type in the search box, then click on the canvas.
- **Basic manipulation:** select parts with the mouse, rotate with **R**, remove with **Delete** or **Backspace**, and copy/paste using **Ctrl+C** and **Ctrl+V**.
- **Wiring:** press **W** to activate wire drawing mode; click between terminals; press **Backspace** to undo the last segment corner and **Esc** to exit.
- **Node labels:** assign labels to wires and nodes to interconnect distant circuit paths without cluttered lines.

## Properties and signal routing

- **Component parameters:** selecting an element opens its side properties form (resistance, inductance, frequencies, gains).
- **Signal destinations:** check `→ Scope` to plot waveforms in the scope, or `→ Control` to read the sensor measurement directly in Python code.
- **Disable component:** toggle the checkbox to deactivate a part in the circuit without deleting it from the schematic.
- **Subcircuits and library:** double-click a subcircuit to dive into its internal sheet; press **Esc** to return; save reusable topologies into your library.
