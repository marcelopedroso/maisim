# MaiSim script guide

## What it is
A plain Python program. MaiSim runs the script in a separate process, in its own folder, with a time limit (120 s by
default), and shows what it prints and its errors. There is no circuit and no imposed simulation step: the script
chooses the time, the step and the math (a step-by-step loop or vectorised numpy).

## Sending to the Scope
```python
import numpy as np
import maisim

t = np.arange(0, 0.05, 1e-6)                    # time in seconds, increasing
v = 311 * np.sin(2 * np.pi * 60 * t)
i = 10 * np.sin(2 * np.pi * 60 * t - 0.5)
maisim.scope("run_name", t, {"v_out": v, "i_load": i},
             panels=[["v_out"], ["i_load"]])
```
- Each call writes one run in the Scope (the person clicks "View in Scope"). It can be called more than once
  (different cases, to compare).
- `t`: a vector with at least 2 samples, strictly increasing. Each signal: a vector the size of `t`.
- Signal names: letters, digits and `_` (other characters become `_`); `t` and `meta` are reserved.
- `panels` (or `paineis`): the list of panels, each with the signals shown together. It becomes the script's default
  Scope layout.

## Ready for Figures (papers)
MaiSim's Figures module makes the paper figure from the run. For it to come out right without rework:
- Names with the quantity first, which become labels with subscripts: `v_o`, `i_L`, `v_ref`, `P_out`, `theta` (becomes
  θ). Figures suggests the unit from the name: `v…` V, `i…` A, `P…` W, `T…`/`Tj…` °C, `theta` rad.
- One panel per quantity (voltages together, currents together); at most 3 or 4 signals per panel.
- Write only the window that matters (steady state, the transient) and a step that keeps the file small: for a figure,
  a few tens of thousands of points are enough (subsample the result, not the simulation).
- Signals in SI units (Figures picks ms, µs… on the time axis).

## Projects in folders
- The script runs in its folder; the other .py files in the same folder import normally (`from calc import f`).
- A subfolder becomes a package: `from libs import modulation`, `from libs.load import RLLoad`.
- A `libs/` folder at the top of the person's scripts serves every script.

## Good practice
- Parameters at the top, with the unit in a comment.
- Print a short summary at the end (steady-state values, errors, what to check in the Scope).
- No windows: matplotlib runs headless (Agg); to look, use the Scope (or save an image, if the person asks).
- No network, no installing packages, no reading or writing outside the script's folder.
- Libraries: numpy and matplotlib are always there (the installed MaiSim ships both); scipy, sympy and python-control
  are not. A transfer function becomes state equations integrated with numpy (RK4 with a step well below the smallest
  time constant); a discrete controller, its difference equation inside the loop.
