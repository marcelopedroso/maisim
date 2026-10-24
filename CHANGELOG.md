# Changelog

All notable changes to MaiSim are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).
Each pull request adds its line under **Unreleased**; a release moves them under a version number.

## [Unreleased]

### Added
- Home page, Circuits: a delete button on your circuits (not on the one open in the editor). After a confirmation it deletes the circuit for good, with its control code and colours, so nobody has to find the folder (#87).
- Home page: a **Circuits** section. *Recent* lists the circuits opened last (the simu notes every open and save in `recentes.json`), *All circuits* lists yours, the library and the extra folders by group, with search; one click opens a circuit in the simu, and the folder where your circuits are kept is shown (#85).
- CI: when the full suite passes on main, every PR merged since the last green run gets a comment saying so (with the run link), and the READMEs show the verify and full-suite status badges (#84).
- `MAISIM_PORTA=8100` in the `.env` moves all seven ports at once (8100–8106, display :81), like `npm run maisim -- -p 8100` but for good; a port written separately still wins (#86).
- Simu properties panel: Gecko parameters that are a choice show as one. The signal source shape (SIGNAL, FILE, RANDOM) is a list (Sine, Triangle, Rectangle, Random, Import; Gecko stores 402–406), every source type (U, I, MMF, HEAT-SOURCE, DT) too, and Gecko's yes/no parameters (useExternal, display…) are checkboxes. Typing `$` in a parameter that takes a global variable lists the circuit's variables with their values, filtered as you type (↑/↓, Enter or Tab, Esc, click) (#70).
- **Scope: Power in Measure.** A *Power* mode pairs each voltage with its current by name (`v_a` with `i_a`; pick other pairs in the lists), draws p(t) = v(t)·i(t) as a curve with its legend entry, and gives P, V_rms, I_rms, S, λ = P/S and the fundamental P₁ and Q₁ over the Fourier window (#68).
- Simu: put a signal in several scope panels, and delete panels, right from the signal's panel picker (#67).
- Simu tests: `simu/validacao/vistoria_componentes.py`, an on-demand survey of the 121 palette components on the test instance (each one alone on a new sheet: inserted as the palette does, its parameters read, a short run), written to `simu/validacao/tmp_vistoria/` as JSON and a Markdown table (#77).

### Changed
- Scope Measure → Power: the p(t) curves have their own axis, on the right, in W (ticks with the prefix, its own automatic scale, in the curve's color when there is one pair), so v and i keep their range on the left axis instead of being squashed by (or clipping) a kW-sized p. Vertical zoom (drag, Ctrl + Shift + wheel) moves both axes and fit resets both; **Fixed Y** also takes the power axis min/max (blank = automatic, kept in the layout); the axis is in the PNG and goes away when every p(t) is hidden in the legend (#83).
- The terminal messages of `npm run maisim`, the background start/stop scripts (`app/scripts/sobe_fundo.sh`, `para_fundo.sh`) and the Gecko scripts (`gecko/sobe.sh`, `para.sh`, `construir.sh`) follow the terminal language (Portuguese when `LC_ALL`/`LC_MESSAGES`/`LANG` is `pt*`, English otherwise), through one shared helper (`config/fala.sh`). The editor engine's own errors (an unknown command, a malformed `SETM`) are in English, like Gecko's and Java's (#78).
- Simu: the signal's panel list shows the panel names in math notation (`i_L` → *i* with L as a subscript), like the drawing and the scope (#74).
- A channel color chosen on the circuit also applies in the scope, which follows it right away (#66).
- Sources follow the generator convention: the current arrow of a voltage source leaves its + terminal, and its measured current (scope, Measure, the control's `m[...]`) is positive when it delivers power. Gecko measures every current from terminal 1 to terminal 2, so MaiSim flips the sign it reads for a voltage source; the Gecko file is unchanged. The current source shows its arrow (terminal 1 → 2) instead of a "+" (#71).

### Fixed
- Home page: the Circuits list no longer throws when the page changed while the list was loading (seen in the full suite's `scope_recolher_tela`) (#89).
- Simu: after Gecko restarts (a crash, `para.sh`, a reboot, an update), the editor no longer shows the startup model under the open file's name as "unsaved" (a Save would have written it over the file). The simulator recognizes a new Gecko (the process on its port) when the motor answers — also when the simulator starts before Gecko — and reopens the open file from disk, or leaves the sheet empty for a new circuit or a closed editor; what was not saved goes to a copy (`gecko_reiniciado/` in the simulator cache) and the editor says so (#82).
- Simu: a block with several outputs gets a choice of output at the top of its scope box in the properties panel (by channel name, in math notation, with each channel's color). The channel color and the scope section/panels apply to the chosen output; before, they only covered the first one. A block that is out of both the scope and the control keeps its per-output channel names (`ABCDQ_1_d`, not `ABCDQ_1`), so a color chosen there is stored under the right name. Sliding DFT with several frequencies now gives its first output as a signal, read by the only name Gecko gives it (`DFT`), and leaves out the others, which Gecko cannot read. Before, every run left the outputs out with a warning. The 4th output of From EXTERNAL is read as `etc.` (#81).
- Simu: LIMIT and HYS with **useExternal** work like the signal source. LIMIT takes min and max from inputs 2 and 3 (input 1 is the signal), HYS takes h from input 2 (its checkbox is `external`), as in Gecko: those fields are greyed out with the input that feeds each one, the terminal labels name them (input 2 · minimum…) and the block shows Gecko's short labels (min, max, h) next to the pins. The SIGNAL-only code is now a small table (#80).
- Run summary (`resumo.md`, the AI's `ULTIMA_RODADA.md`): the table header names the frequency the phasors are actually computed at (the control parameter `f_nom`, 50 Hz without it) instead of always saying 50 Hz, and the AI rules say so too. The control guide (pt) names the real buttons: "Virar controlador" (⤴), "Virar módulo", "+ Arquivo", "Organizar como um DSP" (it still spoke of a "+ controlador" that no longer exists) (#79).
- The editor engine (`simu/motor`) is compiled as UTF-8 (`javac -encoding UTF-8`): with a locale Java did not know (e.g. `LANG=en_US.UTF-8` without that locale installed), its accented comments failed the build and the editor engine did not start (#78).
- Simu: a control block with several outputs on the main sheet (abc>>dq, dq>>abc, DEMUX, Thyristor Control, Sparse control, PMSM controller and modulator, Java and C/C++ functions) no longer makes every run fail before it starts ("has more than one output"). Each output is its own signal (scope column and `m[...]`), named by its label or `<block>_<output>` (`ABCDQ_1_d`), with its own tag on the drawing; → Scope / → Control apply to the whole block. DEMUX outputs past the 4th have no name in Gecko and are not signals; a signal Gecko still cannot read (e.g. Data from File without data) is left out of the run with a warning instead of stopping it. The palette catalog gives Data from File and Random Walk the code Gecko writes in the file (4, a signal source) (#76).
- Simu: voltage probe marks no longer cover each other (e.g. the − below one resistor and the + above the next, on the same node): a mark that would land on another one moves down until it is clear (#75).
- Gecko patch `0002-nomes-ocultos`: after a nonlinear reluctance (NLRel) had been placed, the names U.1 and U.2 stayed "in use" forever (even after deleting it or starting a new circuit), so creating a voltage source U.1 failed. Gecko registered NLRel's two hidden sources under those names and then renamed them past its name registry; hidden parts are no longer registered, and a cleared sheet releases every name (#73).
- Simu: the signal source with **useExternal** (SIGNAL). Amplitude, f, offset, phase and d come from its five inputs (in that order, as in Gecko), so their fields are greyed out with the input that feeds each one, and the terminal labels name them (input 1 · amplitude…). The block draws the inputs where Gecko puts them, with short labels (Â, f, off, φ, d), keeps the ∿ in view and the output label outside the box. The external inputs of LIMIT (min, max) and HYS (h) are also placed where Gecko puts them, and a control box now spans its pins (the Java and C/C++ function boxes sat one row off) (#72).
- Scope: the "Per row" button is translated even when there is no run yet (#69).

## [0.2.0] - 2026-10-24

### Added
- `npm run maisim -- -p PORT` serves MaiSim on another port: the page on PORT, the other services right after it (#63).
- **MaiSim in Portuguese and English** (#42–#56). The first visit follows the browser language, and the PT/EN button on the rail switches every window at once. Pages, server messages, the AI (rules, prompts, the files it reads), the control guide, code templates and examples come in both languages. A strict guard in every PR keeps any new text bilingual.
- **Signal destinations** (#61). Each signal has two checkboxes: **→ Scope** (recorded in the run) and **→ Control** (`m["…"]` in the code). Signals that only feed the control are no longer recorded, so runs are lighter. Every recorded signal, blocks and sources included, gets its pill on the drawing, with its color and its scope section and panel.
- **Math notation** for signal names: `v_o` is shown as *v* with a subscript *o*. In the scope (#38) and on the circuit drawing (#59).
- **Scope**
  - Measure modes: Fourier, cursors in t and in y, with Δt, 1/Δt and Δy readings (#40).
  - Line style per signal; the Signals menu under its button; a confirmation before deleting (#39).
  - A default layout per circuit, saved next to the circuit (#27, #29, #32).
  - Thicker or thinner lines per signal; resize a panel by its corner (#17).
- **Simu**
  - Choose a meter's scope section and panel right in the simu (#28).
  - Close the circuit (#19, #30).
  - A read-only circuit while simulating, clickable meter marks, a descriptive history (#14).
  - A control architecture diagram (#13).
- **Runs**
  - Replace the previous run or keep a run; delete whole run folders with a filter (#16).
  - On the home page: new circuit, examples and all runs (#20, #31).
- **Examples:** 10 ready-made circuits (#18) and a buck with a load step (#37).
- **AI**
  - The AI notices and the accounts window, reachable from any page (#24).
  - What went into each message, and accepting a proposal file by file (#15).
  - Merge and export conversation contexts (#12).
- **Windows:** separate code and scope windows, shown as a narrow strip in the simu (#25, #26, #33).

### Changed
- Scope Measure: **Combine** (Σ and x̄ across the panel's signals) is disabled when the panel has fewer than 2 signals, with a tooltip saying why (#64).
- The window title bar and the rail follow the theme (light or dark); the title is just "MaiSim" (#58, #60).
- The scope panel toolbar reads Signals · Y fixed · Zoom (Area | X | Y) · fit · link · Measure (#57).
- Buttons, labels and options start with a capital letter (#41).
- The rail checks the AI only in the main window (#34).

## [0.1.1] - 2026-10-21

### Added
- Simu usage guide, development history (`simu/HISTORICO.md`), English CONTRIBUTING and README (#8, #10).

### Changed
- CI:
  - every change goes through a pull request;
  - merging waits for the Codex review and refuses open conversations;
  - the merge is pinned to the tested commit (#2, #3, #9).

### Fixed
- Atomic `meta.json` writes (#10).
- Flaky screen tests: `passo2_tela` and `variaveis_tela` (#5, #7).

## [0.1.0] - 2026-10-21

### Added
- First public structure of MaiSim:
  - the home page with the latest simulations;
  - the simu (circuit editor running on GeckoCIRCUITS, with digital control in Python);
  - the scope;
  - ports and folders in one configuration file;
  - CI on GitHub Actions (#1).

[Unreleased]: https://github.com/marcelopedroso/maisim/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/marcelopedroso/maisim/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/marcelopedroso/maisim/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/marcelopedroso/maisim/releases/tag/v0.1.0
