# Control Guide — MaiSim / simu

This guide explains how the control code (`controle.py`, the **Control** panel of `/maisim/simu`) talks to the simulation
in GeckoCIRCUITS. It covers where each thing is configured, the timeline of a sample and the delay of an actuation until
it reaches the circuit. It also gives the precautions that prevent wrong results, the two ready-made examples and, at the
end, the walkthrough for those who automate (Claude Code included). The figures quoted were measured in this MaiSim: the
test scripts are in `simu/validacao/` and the reference runs of the examples in `~/.local/share/maisim/rodadas/`. What
has not been tested yet is marked as such.

## 1. What happens in a run

Gecko integrates the circuit with a fixed step Δt. The control is sampled with period Ts = n·Δt (n an integer). At each
sample k, at the instant t_k = k·Ts:

1. the server reads the measurements at the instant t_k (`m`);
2. it calls your code's `passo(t_k, m, p, e)`, in a separate Python process;
3. it writes the returned actuations to the **CONST** blocks marked as actuations;
4. it tells Gecko to advance n steps (Ts).

```
   amostra k (t_k = k·Ts)                           amostra k+1 (t_k + Ts)
   │ m = medidas em t_k                             │ m = medidas em t_k + Ts
   │ a = passo(t_k, m, p, e)                        │
   ├────Δt────┼────Δt────┼──── … ────┼────Δt────────┤
   └─ o circuito sente a em t_k + d·Δt (d do painel: logo = 1, amostra = n, ou latência τ)
```

(In the diagram: *amostra* = sample, *medidas* = measurements; the circuit feels `a` at t_k + d·Δt, with d from the
panel: Right away = 1, At the next sample = n, or a latency τ.)

The actuation holds until it is written again. If `passo()` does not return an actuator at some sample, the CONST keeps
its last value.

## 2. Where each thing is configured

| What | Where | Notes |
|---|---|---|
| Δt (Gecko step) and end time | the **⚙** button (Simulation parameters), next to ▶, which runs with them without asking | When you open a circuit other than the last one, the screen adopts the Δt and end time stored in the `.ipes` (Gecko saves those of the last run). That way a circuit made for Δt = 1 µs does not run with the Δt left over from another one. Reopening the same circuit does not touch what you chose. |
| stored samples | the **⚙** button, next to ▶ | Sample limit in the scope. With the control on, the scope gets one sample every `cada` control periods (the panel shows how many). |
| Ts | Control panel | Becomes n = round(Ts/Δt) steps; the code gets the effective value in `p["Ts"] = n·Δt`. A Ts smaller than Δt becomes Δt. The panel warns when Ts is not a multiple of Δt and shows how many times `passo()` will run. |
| actuation delay | Control panel | **Right away** (t + Δt), **At the next sample** (t + Ts, as in a DSP that updates the PWM at the next sample) or **After a latency** τ (t + round(τ/Δt)·Δt, between Δt and Ts). In `controle.json`, `atraso.modo` is `logo`, `amostra` or `tempo`. |
| actuations | Control panel, **Actuations** list | Each CONST block of the circuit is a possible actuator; its name in the code is the label of its output (or the block's name). Inside a subcircuit, it is prefixed with the subcircuit's name: `Sub_1_x` for Gecko's SUBCIRCUIT.1, or the name you gave the block (renamed `filtro`: `filtro_x`). The panel shows where each one goes (e.g. `CONST.1 → switch S.1`). |
| measurements | automatic | On the main sheet, the outputs of the control blocks and of the meters (name = output label; a block with several outputs, such as abc>>dq, gives one measurement per output: without a label, `<block>_<output>`, e.g. `ABCDQ_1_d`); inside subcircuits, the meters and the tags, prefixed with the subcircuit's name (`Sub_1_vCSm`; renamed `SM1`: `SM1_vCSm`). They are the keys of `m` and the scope columns; in the component's panel, two checkboxes say where each one goes: **→ Scope** (a column recorded in the run) and **→ Control** (a key of `m`). Only in the control, it is not recorded (smaller runs), and the code can still send it to the scope with `scope("x", m["x"])`; only in the scope, reading `m["x"]` is an error. The **tag** (palette, Measure tab) gives any control point the name you want: for example, a voltmeter inside a subcircuit goes out through a Control Terminal and, on Main, the tag gives it its name. |
| parameters | Control panel | `p["nome"]`; gains, references, limits. They can change mid-run through an event. |
| events | Control panel | Changes over time, with or without the control: a CONST (e.g. a load step) or a `p[...]` (e.g. a reference step). |
| code | the panel's editor | Kept in a working copy and, when you save the circuit (floppy disk), in `<circuit>.controle.json` next to the `.ipes`. |

During the run the panel and the editor are locked (the server also refuses changes: HTTP 409). At the end, the CONSTs
written by the run go back to their previous values; if the server goes down mid-run, it restores them on the next start.

## 3. The code: `iniciar` and `passo`

```python
def iniciar(p, e):          # once, before the 1st sample
    e["integral"] = 0.0


def passo(t, m, p, e):      # every Ts
    erro = p["i_ref"] - m["i_L"]
    e["integral"] += erro * p["Ts"]
    u = p["Kp"] * erro + p["Ki"] * e["integral"]
    scope("u", u)           # sends a variable of yours to the scope
    return {"u_ctrl": u}    # actuations: {actuator: value}
```

* `t`: the sample time (s); the first one is t = 0.
* `m`: the measurements at the instant `t`. At t = 0, the circuit's initial state: with its initial conditions (a
  capacitor's uC(0), a Cth's Temp(0), an integrator's y0, the machine's initial speed) and, without them, the starting value
  (an inductor current 0, the machine at rest); the losses (FLOW of a Pv) are 0 — nothing has been dissipated yet.
* `p`: the panel's parameters, plus `p["Ts"]` (the effective one).
  The scope may record finer than Ts (a smaller requested sample interval): inside Ts, the circuit at every sample, and the
  `scope()` columns with the value of the Ts instant; `m` is still only at the Ts instant.
* `e`: your own dictionary, which persists between samples.
* The return value is a dictionary `{actuator: value}` (or `None`). Each key must be an actuation checked in the panel,
  and each value must convert to a finite `float`; otherwise the run stops with an error.
* `scope("nome", valor)` creates a column in the scope. The columns are fixed at the **first sample**: call `scope()`
  with the same names at every sample (keep the value in `e` and always send it). A name that shows up later does not go
  to the scope, and the run warns about it. The name of a signal the run already records (or `t`) becomes `ctrl_x`
  (`scope("v_o", …)` → `ctrl_v_o`).
* `print()` goes to the control output (below the editor) and to the run's `controle.log`.
* `math` and `scope` come ready to use. You can import whatever is in the system Python (the standard library, and
  numpy 1.21). The process runs with `python3 -I` (isolated: no user site directory and no PYTHONPATH).
* Time limits: `iniciar` (together with loading) has 20 s; each `passo` has 5 s. If it runs over (an infinite loop?), the
  run stops with an error. An error in your code shows the line and a traceback with only the lines of `controle.py`.

### 3.0 Where the panel is

The control panel opens in the simu dock (the `</>` button in the header) or in a **window of its own**, through the `</>`
on the MaiSim rail: to keep the circuit on one monitor and the code on the other. The code window stays tied to the
circuit open in simu; the ▶ stays in the circuit window (it is the one that runs and calls the controllers), and the code
window locks editing during the run. The button at the start of the editor bar collapses the left column (more room for
the code).

### 3.0.1 Modules: read → control → write (the default)

A new circuit comes with three files, along the path of a DSP sample:

```
amostra k:  leitura.py (ADC e sensores)  →  controle.py (o orquestrador e o controle)  →  escrita.py (PWM/DAC)
```

(That is: sample k — `leitura.py`, the ADC and sensors → `controle.py`, the orchestrator and the control →
`escrita.py`, PWM/DAC.)

**Every `.py` that is not a controller is a module**: `controle.py` (or another module) does `import leitura` and calls
it — in the same process and in the **same sample**, with no delay. The order is the order of the calls; calling it 1 or
10 times (one PLL per phase) is just a `for`. The contract of every module:

```python
def iniciar(p):                  # runs once: returns the module's state (a dictionary of yours)
    return {}

def passo(entrada, p, estado):   # on every call: returns the output
    return entrada
```

The template's `controle.py` keeps each module's state in `e` and calls all three:

```python
import leitura
import pll
import escrita

def iniciar(p, e):
    e["leitura"], e["pll"], e["escrita"] = leitura.iniciar(p), pll.iniciar(p), escrita.iniciar(p)

def passo(t, m, p, e):
    x = leitura.passo(m, p, e["leitura"])        # 1. read: processed measurements (gain, offset, ADC quantization…)
    th = pll.passo(x, p, e["pll"])                # 2. control: the modules, in order
    u = {"u_ctrl": ...}
    return escrita.passo(u, p, e["escrita"])     # 3. write: saturation, PWM resolution… → the actuations
```

* **Same sample, proven:** the example's current PI written as modules (`leitura → pi → escrita`) gives the SAME result,
  bit for bit, as the whole PI in `controle.py` (`validacao/modulos_api.py`).
* **Module × controller.** A module organizes the code (no delay). A controller (§3.1) is a separate process, which
  emulates another DSP and talks with ≥ 1 sample of delay: only for truly distributed control — **never** to split a
  loop (the delay would enter the loop). In the tree: "Turn into controller" (the ⤴ button) and "Turn into module".
  "+ File" creates a module.
* **Computation time is zero within the sample.** Reading, computing and writing happen at the same simulated instant,
  however many files there are. The real delay (ADC conversion, computation, PWM update) is the one set in the panel
  (§4): Right away (`logo`), At the next sample (`amostra`: the classic one — compute during the period, update at the
  start of the next) or a latency τ.
* **The risks MaiSim flags:** a Python module name (`json.py`, `math.py`: error, rename it); an `import` of a file that
  does not exist (error); an `import` of a controller (error: the delay would enter the loop); a module nobody imports
  (warning: it does not run); circular imports (warning); a module with `passo(t, m, p, e)` — it looks like a controller
  (warning); the same module in two controllers (warning: each one has its own copy, with no shared memory). An error
  inside a module points to that module's file and line.
* **The order is checked** in each controller's `passo()`: `leitura.passo()` is the 1st module call and `escrita.passo()`
  the last, and the `return` returns what escrita returned (otherwise the actuator limits are left out); every module
  called in `passo()` is initialized in `iniciar()`. A deviation becomes a warning on screen and in the AI's context, so
  the AI fixes it along with the rest.
* **The MaiSim AI** edits `controle.py` and the modules and creates new modules (only `.py` files in its folder),
  following the contract and the order; the proposal shows the diff of each file (one tab per file), applying it brings
  the modules along, and so do "back to before" and "see the change". It does not delete files nor turn a module into a
  controller.
* **Control written before modules** stays as it was (only `controle.py`); in the tree, "Organize as a DSP" creates
  `leitura.py` and `escrita.py` from the templates without touching `controle.py`.

### 3.1 Several controllers (distributed control)

A circuit can have more than one controller: acquisition and control, one per submodule, one per phase, a central one and
several local ones… **Each `.py` file is a controller** (with the same `iniciar`/`passo`), named after the file:
`aquisicao.py` is the controller `aquisicao` (the destination of `envia` and the `p["id"]`). In the panel, the left column
has two tabs: **Variables** (Ts, actuations, measurements, parameters, events) and **Files** (the `.py` files and, under
each one, **reads** — some measurements or **all** —, **writes** and **in subcircuits**; and the network). The `+` next
to the editor tabs (or "+ File") creates a module (§3.0.1); "Turn into controller" (the ⤴ button), in the tree, makes it
run on its own; a double click renames it (the controller follows); the × deletes the file and its controller. Checking an actuation in one controller removes it from the others (a single owner).

* **Isolated and in parallel.** Each controller runs in its own Python process: no shared memory (what one keeps in a
  module, the other does not see). At each sample, MaiSim hands the measurements to all of them at the same time, they
  compute together and MaiSim collects the actuations.
* **Local view, enforced.** `m` only has the controller's own measurements; reading another one is an error (`KeyError`,
  with the file and the line). Returning an actuation that is not its own is also an error. Each actuation has **a single
  owner**.
* **One code, several instances.** A controller can apply **in subcircuits**: one instance per subcircuit
  (`sm_Sub_1`, `sm_Sub_2`, …), each one reading the measurements and writing the actuations inside its own subcircuit
  **without the prefix** (`m["vCSm"]`, not `m["Sub_3_vCSm"]`). The same code serves all of them; `p["id"]` is the
  instance's name and `p["subcircuito"]`, its subcircuit.
* **Messages.** `envia("controle", {"i": x})` sends (to a controller or to a list); `recebe()` returns what has arrived:
  `[{"de": name, "t": send time, "dados": {...}}]`. Since all of them compute together, **a message never arrives in the
  same sample**: it arrives at the 1st sample after the send with t ≥ t_send + network latency (latency 0: at the next
  sample, as between two DSPs). Latency τ: a delay of max(1, ⌈τ/Ts⌉) samples.
  Each value in a message is a number, `None` (no value yet) or a short list of numbers (up to 64): a phasor goes
  as `(re, im)` and arrives as `[re, im]` (`re, im = msg["dados"]["vf1"]`). No text and no dictionaries inside.
* **Scope and print.** The `scope()` variables of the other controllers are prefixed with the instance's name
  (`aquisicao_x`); those of `controle.py` keep the usual names (the run columns do not change just because another
  controller exists). `print()` goes to the log prefixed with `[instance]`.
* **With no controller on the list**, the usual applies: `controle.py` reads all the measurements and writes the checked
  actuations. The first "Turn into controller" puts that one on the list (with the same view) and adds the new one.

Example (acquisition + control, with the PI from `exemplo_controle_pi`):

```python
# aquisicao.py — reads i_L
def passo(t, m, p, e):
    envia("controle", {"i": m["i_L"]})

# controle.py — writes u_ctrl; does not read i_L: receives it over the network
def iniciar(p, e):
    e["integral"] = 0.0
    e["i"] = 0.0

def passo(t, m, p, e):
    for msg in recebe():
        e["i"] = msg["dados"]["i"]
    erro = p["i_ref"] - e["i"]
    ...
```

Checked on the test instance (`validacao/controladores_api.py`): this pair gives **exactly** the same current as a single
controller that uses the measurement from 1 sample earlier (latency 0) or from 3 samples earlier (latency 2.5·Ts) —
a difference of 0.0 over the 301 samples.

## 4. Timing and delay: what the circuit feels, and when

### 4.1 Gecko's own delay and the compensation

Within one step, Gecko does, in this order (`SimulationsKern.simulateOneTimeStep`):

1. the switch reads the GATE input;
2. the circuit is solved;
3. the signal-controlled sources read the signal (it applies at the next step);
4. the control blocks compute, all in one pass.

Writing a CONST changes its output right away. So a write made before step s reaches the circuit at different moments
depending on the path from the CONST to its destination. Measured with Δt = 1 µs:

| Path | The circuit feels it at step |
|---|---|
| CONST → GATE → switch | s |
| CONST → block(s) → GATE → switch | s + 1 |
| CONST → signal-controlled source | s + 1 |
| CONST → block(s) → source | s + 2 |
| CONST_S1 → SM (terminal → AND, or NOT → AND → GATE) → IGBT, circuit 03 | s + 1 |

The subcircuit terminal adds no step, because Gecko joins the outside label to the inside one as a single net. The extra
step in the SM of circuit 03 comes from the AND (the dead-time logic).

The server follows the control connections of each actuation up to the switch or the source and **writes as early as
needed**. That way the circuit feels the actuation at t + d·Δt **at any destination**. The same compensation applies
to CONST events. The tracing follows what Gecko does:

* it uses labels (including the one inside the subcircuit terminal), wires and the connection rule (there is a connection
  where an end lands on another wire; a crossing without an end does not connect);
* it goes through blocks, subcircuits and global control terminals (those with the same name are the same net, on any
  sheet);
* it ignores disabled elements and GATEs without a switch, which Gecko also ignores;
* it only counts a signal-controlled source when a block on the same sheet as the source feeds the label, because Gecko
  looks for the signal only among the block outputs of that sheet.

What cannot be compensated is flagged in the panel and in the run, CONST events included:

* **Gecko's minimum is larger than requested**: for example, a "Right away" delay (1 Δt) with a block before a source,
  which needs 2 Δt;
* **the same CONST reaches destinations with different delays**: the one that feels it first is exact and the others
  feel it later;
* **the actuation reaches no switch or source** according to the tracing: the delay is treated as that of a source, with
  no guarantee.

The column of the CONST itself in the scope shows the instant of the write, which can come up to 2 steps before the
circuit feels it. The blocks of your circuit still act on top of that (for example, the dead time of the DELAYs inside
the SM).

### 4.2 Events

* A **CONST** event at t applies in the circuit from step j = round(t/Δt) on, compensated as above.
* A **`p[...]`** event applies at the first sample with t_k ≥ t (the code sees it at that sample).
* The marks in the scope sit at these effective instants. If two events fall at the same instant, the last one wins (with
  a warning). An event after the end does not happen (with a warning).

### 4.3 Measurements

The measurements in `m` are those at the instant t_k, already including the effect of what was applied up to t_k. Watch
out for switched quantities: sampling the inductor current always at the start of the switching period catches the
valley of the ripple, not the average. The buck example takes the period average in the code itself. Another option is
to sample in the middle of the on-time.

**Losses** (the FLOW meters of a Pv: `Pv_…`, `Pcond_…`, `Psw_…`) are the exception: `m` gets the **average over the last
Ts**, not the instant value. Gecko's switching loss is E/Δt on a single step (the commutation one), so the instant value
would be zero almost always and a spike now and then. Temperature (`Tj_…`) comes at the instant, like the rest.

## 5. How not to go wrong (checklist)

1. **Δt resolves the circuit**: much smaller than the time constants and than the switching period. Gecko uses implicit
   Euler by default (`solverType 0`). The independent references only match to machine precision with implicit Euler;
   with the exact exponential a small error remains (1e-4 A on 5 A in the PI example).
2. **Ts a multiple of Δt**: the panel warns; the code gets the effective Ts in `p["Ts"]`.
3. **PWM done in the code**: the edges fall on the Ts grid, and the duty-cycle resolution is Ts·fsw (Ts = 2 µs at
   5 kHz gives 1 %). The PI then alternates d between two neighboring steps to get the average right. In the example
   buck, on the 10 A plateau, the on-time alternates between 40 and 42 µs.
4. **Cost**: `passo()` runs tfim/Ts times, and each call costs 1 to 3 ms in the example buck (measured, Gecko included,
   which is fast for a small circuit; in a large MMC Gecko weighs more). The panel does the math. The example buck
   (5,000 calls) took 5 to 13 s, and once 19 s with the machine busy. In one measurement, the "At the next sample" delay
   took 5 s against 10 s for "Right away": the write falls at the start of the stretch and Gecko advances the whole
   period at once.
5. **Cheaper alternative for PWM** (no ready-made example in this MaiSim yet): carrier and comparator in Gecko blocks,
   with the code writing only the duty cycle, once per period (Ts = 1/fsw). The block in between enters the
   compensation (+1 step).
6. **Component parameters (R, L, …) do not change mid-run** in Gecko: the change has no effect. For a load step, use a
   switch driven by a CONST (like `CONST_CARGA` in circuit 03) or a controlled source.
7. **GATE**: an input > 0.5 turns the switch on and ≤ 0.5 turns it off (S, MOSFET, IGBT;
   `SimulationsKern.checkForSwitchAction`). The thyristor is different: > 0.5 fires it, and it only blocks when the
   current reaches zero.
8. **scope()**: the same names from the first sample on.
9. **One run at a time** on MaiSim's Gecko (there is only one).
10. **Check against a reference**: a small model solved separately (as in the tests below). With the delay swapped, the
    difference must show up; otherwise, the test is not measuring anything.

## 6. Ready-made examples (Open… → `exemplo…`)

### 6.1 `exemplo_controle_pi`: current PI on an RL load

* **Circuit**: source controlled by the signal `u_ctrl` → R = 1 Ω → L = 10 mH → disturbance source `v_dist` → back.
* **Control**: Ts = 100 µs, "At the next sample" delay, PI with anti-windup (Kp = L·ωc, Ki = R·ωc, fc = 200 Hz).
* **Events**: i_ref 5 → 8 A at 12 ms; v_dist = 20 V at 22 ms.
* **Validation**:
  * against the RL solved separately by implicit Euler (Gecko's rule), with the same PI and the same delay, the error is
    **1.4e-13 A**, machine precision, in the "Right away" and "At the next sample" modes (1.6e-13 A with a 30 µs latency);
  * with the exact exponential instead of Euler, it was 9.4e-5 A (Right away), 1.1e-4 A (At the next sample) and 9.8e-5 A
    (30 µs latency);
  * with the delay swapped in the reference, the difference becomes 0.63 A or 0.18 A, that is, the test tells the modes
    apart.

### 6.2 `exemplo_controle_pwm`: buck with the PWM done in `controle.py`

* **Circuit**: Vdc = 100 V → ideal switch S.1 → L = 1 mH → R = 2 Ω, with freewheeling diode D.1. CONST.1 (actuation
  `g`) feeds GATE.1, which drives S.1. Meters: `v_sw` (switched voltage), `v_o` and `i_L`.
* **Δt** = 1 µs, **Ts** = 2 µs, **end time** = 10 ms (stored in the file).
* **Control**:
  * at each Ts, a sawtooth carrier at fsw = 5 kHz is compared with the duty cycle d, which gives `g` = 1 or 0;
  * at the start of each period, a PI runs on the average of i_L over the previous period, with
    Kp = 1.885 V/A, Ki = 3770 V/(A·s) and d limited to [0, 0.95].
* **Event**: i_ref 10 → 15 A at 5 ms.
* **Result**:
  * `v_sw` only takes 0 V or 100 V (about −0.7 V while freewheeling: 0.6 V from the diode plus rON·i); period of
    200.0 µs;
  * ⟨i_L⟩ = 10.008 A and 15.026 A, with d = 0.200 and 0.300;
  * on the 10 A plateau (d ≈ 0.2), the on-time alternates between 40 and 42 µs (the 1 % resolution), and the
    period-by-period ripple (3.24 to 3.31 A) matches (Vdc − v_o)·t_on/L (3.20 to 3.36 A).
* **Validation**:
  * against the independent reference (the same code and the buck solved by implicit Euler), the error is **1.0e-5 A**
    over 5,000 samples, which is the leakage through the open switch (100 V / rOFF of 10 MΩ = 1e-5 A, which the
    reference does not model), and the 5,000 switching decisions are identical;
  * in the "Right away" and "At the next sample" modes, the right mode gives 1.0e-5 A and the wrong ones give 0.26 A.

## 7. Files

| File | What it is |
|---|---|
| `<circuits folder>/<circuit>.ipes` | the circuit (Gecko opens it) |
| `<circuits folder>/<circuit>.controle.json` | the circuit's control: `ativo`, `Ts`, `atuacoes`, `parametros`, `atraso`, `acionamentos`, `codigo` (controle.py), `arquivos` (the other .py files: modules, and the controllers on the list), `controladores` and `rede` |
| `~/.local/share/maisim/rodadas/<date>_<name>/` | a run: `<name>.ipes` (the exact circuit), `controle.py` (and the other .py files), `controle.json`, `controle.log`, `scope_<name>.npz` |
| `scope_<name>.npz` | the columns `t`, the measurements, the `scope()` variables and `meta` (JSON). In `meta`: `dt_gecko` is Δt; `dt` and `Ts` are the interval between scope samples; `controle.Ts` is the control's; and there are `controle.atraso_passos`, `controle.escrita_passos`, `controle.destinos` and the effective `acionamentos`. |
| `simu/controle_worker.py` | the process that runs a controller's code (one per controller; a line-based JSON protocol); it imports the modules from memory |
| `simu/{controle,leitura,escrita,modulo}_modelo.py` | the templates: the new circuit's controle.py, leitura.py, escrita.py and the one for a new module |
| `simu/servidor.py` | the run loop (`_rodar`), the tracing (`destinos_controle`), the configuration (`confere_controle`) |

## 8. For automation (and for Claude Code)

The simu server listens at `http://localhost:7101/maisim/simu/` (MAISIM_PORTA_SIMU; `npm run maisim` starts it). Everything the panel does goes
through these routes (JSON):

| Route | What for |
|---|---|
| `POST editor/abrir {"arq": "exemplos/exemplo_controle_pwm.ipes"}` | opens a circuit in MaiSim's Gecko (its control comes along). The server only refuses (and asks for `"descartar": true`) when the circuit changed outside the editor, through the Gecko window. A change made through the editor and not saved is lost without warning: check `GET editor/pendente` first (`{"pendente": true}` = there is something to save). |
| `GET editor/controle` | the configuration (`controle`), the code's errors and warnings, `entradas` (the measurements), `atuadores` (with `destinos` and `atraso_gecko`) |
| `POST editor/controle {"controle": {...}}` | saves the configuration (refused during the run) |
| `POST editor/destino {"uid": "…", "scope": true, "controle": false}` | where a component's signal goes (the → Scope and → Control checkboxes; refused during the run); `GET editor/estado` has `fora_scope` and `fora_controle` |
| `POST editor/rodar {"dt": "1e-6", "tfim": "0.01", "nome": "teste", "amostras": "100000"}` | starts the run (the control goes along if `ativo`) |
| `GET editor/rodada` | `estado` (preparando, rodando, pausada, fim, erro or parada: preparing, running, paused, done, error or stopped), `t`, `avisos`, `erro`, `erro_controle` (`linha`, `rastro`), `saida_controle`, `arquivo` (the `.npz`), `segundos` |
| `POST editor/pausar`, `editor/continuar`, `editor/parar` | during the run |

Walkthrough of a change to the control, without the screen:

```python
import json, time, urllib.request
import numpy as np
B = "http://localhost:7101/maisim/simu/"
def api(rota, corpo=None):
    # the maisim-lingua cookie: the server answers in English (errors, warnings); without it, in Portuguese
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "Cookie": "maisim-lingua=en"})
    return json.loads(urllib.request.urlopen(req, timeout=600).read())

c = api("editor/controle")["controle"]            # the current configuration of the open model
c["codigo"] = open("controle.py").read()           # the new code
api("editor/controle", {"controle": c})
j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.01", "nome": "teste", "amostras": "100000"})
while j["estado"] in ("preparando", "rodando", "pausada"):
    time.sleep(0.5); j = api("editor/rodada")
print(j["estado"], j.get("erro"), j.get("avisos"))
d = np.load(j["arquivo"])                          # path relative to the project root (or absolute)
```

Rules for whoever touches the control, person or agent:

* Only write actuations checked in the panel. Do not change component parameters mid-run (section 5, item 6).
* Keep the `scope()` names from the first sample on.
* MaiSim's Gecko runs one run at a time. Before running, check that `editor/rodada` is not `rodando`.
* Check the result with numbers (averages, ripple, frequency) and, when possible, against an independent reference.
  Record failures and warnings as they came; do not hide them or round them to fit.
* Text for the user is in English (the language of MaiSim's interface).
