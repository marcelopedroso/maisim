# Getting started with MaiSim

MaiSim brings together power electronics circuit schematic capture, simulation, digital control design in Python, and an embedded AI assistant into a single workflow.

## The typical workflow

1. **Choose or build a circuit:** from the home page or via the **Open** button in the [circuit editor](#ajuda:simu), open one of the ready-made examples or start fresh on a blank sheet.
2. **Configure simulation:** adjust the step size $\Delta t$, the end time, and the run name using the settings button (**⚙**).
3. **Simulate and view signals:** click **▶** (or press **Ctrl+Enter**) to run; watch the live waveforms and measure signals in the [Scope](#ajuda:scope).
4. **Write digital control:** open the [Control](#ajuda:codigo) tab to write Python controllers running at rate $T_s$, actuating on circuit blocks.
5. **Ask Claude:** use the embedded [AI](#ajuda:ia) assistant to inspect control code, ask circuit questions, or propose numerical tuning.

## Where files are saved

- **Your circuits:** saved in your user data directory (`~/.local/share/maisim/circuitos/`).
- **Simulation runs:** stored with numerical arrays and logs in `~/.local/share/maisim/rodadas/`.
- **Subcircuit library:** reusable blocks reside in `~/.local/share/maisim/subcircuitos/`.
- **AI account:** Claude credentials stay completely isolated in `~/.claude-maisim/`.

## See also

- [Home page](#ajuda:inicio)
- [Circuit editor](#ajuda:simu)
- [Python control](#ajuda:codigo)
- [Scope and measurements](#ajuda:scope)
- [MaiSim's Claude](#ajuda:ia)
- [Keyboard shortcuts](#ajuda:atalhos)
