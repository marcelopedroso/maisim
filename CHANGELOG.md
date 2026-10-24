# Changelog

All notable changes to MaiSim are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).
Each pull request adds its line under **Unreleased**; a release moves them under a version number.

## [Unreleased]

### Added
- Simu properties panel: Gecko parameters that are a choice show as one. The signal source shape (SIGNAL, FILE, RANDOM) is a list (Sine, Triangle, Rectangle, Random, Import; Gecko stores 402–406), every source type (U, I, MMF, HEAT-SOURCE, DT) too, and Gecko's yes/no parameters (useExternal, display…) are checkboxes. Typing `$` in a parameter that takes a global variable lists the circuit's variables with their values, filtered as you type (↑/↓, Enter or Tab, Esc, click) (#70).


- **Scope: Power in Measure.** A *Power* mode pairs each voltage with its current by name (`v_a` with `i_a`; pick other pairs in the lists), draws p(t) = v(t)·i(t) as a curve with its legend entry, and gives P, V_rms, I_rms, S, λ = P/S and the fundamental P₁ and Q₁ over the Fourier window (#68).
- Simu: put a signal in several scope panels, and delete panels, right from the signal's panel picker (#67).

### Changed
- A channel color chosen on the circuit also applies in the scope, which follows it right away (#66).

### Fixed
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
