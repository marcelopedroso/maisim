# Changelog

All notable changes to MaiSim are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).
Each pull request adds its line under **Unreleased**; a release moves them under a version number.

## [Unreleased]

### Changed
- Editor palette: items never tested in MaiSim or that make no sense here are no longer offered — Export/Import Data to/from Simulink, Data export to file, Data from File, Java-Function, C/C++ Function, Small signal analysis, Sparse control, PMSM controller and PMSM modulator (`ESCONDIDOS` in `simu/catalogo_gecko.py`, `"oculto"` in `catalogo.json`). A circuit that already has one still opens, draws and runs. Developer setup: `app/scripts/maisim.sh --abrir` (`npm run abrir`) runs the launcher, so closing the window stops MaiSim as in the packages; on WSL the launcher opens Windows' Chrome or Edge, and `MAISIM_NAVEGADOR` may carry options. Without `--abrir`, `npm run maisim` stays up until Ctrl+C as before (#127).

### Added
- Version and automatic updates: a discreet `v0.3.0` under the logo in the side rail (also in the home page's *About and credits*), whose tooltip says how MaiSim is installed (Windows installed, Linux AppImage or source code). The simu checks the GitHub Releases at startup and every 6 h (short timeout; silent when offline) and a dot on the version shows when a newer one exists on your channel (*stable*: releases only; *testing*: with the `-rc` pre-releases; semver order, so 0.3.0-rc13 < 0.3.0 < 0.3.1). Clicking opens a dialog with the release notes, **Update** / **Later** and the channel. **Update** refuses while a run is going or a circuit is unsaved; on Windows it downloads `MaiSim-Setup-<v>.exe`, checks it against its `.sha256` (refuses on mismatch), runs it silently and reopens MaiSim; with the AppImage it downloads the new one, checks the SHA-256, swaps it in place atomically and restarts; in a source checkout it only says `git pull`. Routes are local-only (`X-MaiSim` on the POSTs) (#126).

## [0.3.0] - 2026-10-25

### Added
- Simulation settings (⚙): an **Integration** field picks Gecko's integration method, the `.ipes` `solverType`: backward Euler (0, Gecko's default), trapezoidal (1) or Gear/BDF2 (2). It shows the open file's method and applies when the run starts, like Δt and end time: Gecko only reads `solverType` when it opens a file, so if the run asks for another one the simulator rewrites the line in the run's copy of the circuit and Gecko reopens it; Save then writes it into the circuit. The run's `meta` (`solver`) and `resumo.md` record the method, and the scope's Compare warns when A and B used different ones. `simu/validacao/buck_solvers.py` runs the same buck with all three: each matches its own recurrence to 1.6e-8 A, and after the diode blocks only the trapezoidal method rings (±0.33 V on v_sw, `simu/validacao/dados/solver_buck_trapezio.png`) (#116).
- Closing the MaiSim window stops MaiSim (the window opens on an "Opening MaiSim…" page with the pulsing diode until Gecko and the engine are up — before, the home page asked the engine while it was still starting and kept "no editor engine"; launcher with `--abrir`, the installer and AppImage shortcuts): every page sends a heartbeat to the page server every 15 s (`/maisim/vivo`) and a beacon when it closes; once no page is open (20 s after the last close, 45 s for a page that went silent, longer for a hidden or frozen one), the launcher stops servers, engine and Gecko like `--parar` (Gecko stays if a circuit is unsaved, and the next launcher adopts it). It waits for a run in progress to finish. Clicking the icon while MaiSim is still up just opens the window on it. When closing will stop MaiSim, the simu asks first if there are unsaved changes. `MAISIM_NAVEGADOR` picks the browser (`nenhum`: none) (#104).
- Take a circuit to another MaiSim: **Export** on each row of the home page's Circuits section saves a `.msd` (a zip with a `manifest.json`: format version, every file with its SHA-256) holding the circuit, its control code, appearance and default scope layout, and the runs you tick (none by default, with the estimated size). **Import…** shows a preview (who exported it, when, with which MaiSim; the runs, all ticked; a name conflict offers `<name>_2`, replacing needs a confirmation) and then writes the circuit to your circuits and the runs to the runs folder, rewriting their `meta.modelo` and `resumo.md` so they stay linked to the new circuit. No source-machine path goes into the file; paths with `..`, absolute paths, backslashes, unknown extensions, a SHA mismatch, over 1 GB / 5,000 files or a newer format version are refused before anything is written. Export warns when the circuit points to an external file (#102).
- CI: each new version's Release gets the Linux AppImage and the Windows installer, with their `.sha256` (`packages` workflow, started by the full suite right after it creates the Release; also runnable by hand with a tag). A `-rc` version is published as a pre-release (#99).
- Linux AppImage: `pacote/linux/monta.sh` builds `MaiSim-<version>-x86_64.AppImage` with a portable Python 3.11 + NumPy, a Temurin 11 JRE (both pinned and SHA-256-checked), Gecko with its patches, the compiled editor engine and the local Monaco; it opens through the launcher in the produto profile (data in `~/MaiSim`). Only Xvfb is needed from the system (#97).
- Windows installer: `pacote/windows/monta.sh` builds `MaiSim-Setup-<version>.exe` (Inno Setup in docker) with the embeddable Python 3.11 + NumPy, a Temurin 11 JRE (pinned and SHA-256-checked), Gecko, the compiled engine and the local Monaco. Per-user install with no admin, pt/en wizard with MaiSim's images: where to install, where your circuits are kept (Documents\\MaiSim), the port (checked against what is already listening, e.g. a MaiSim in WSL), shortcuts (open, stop, my circuits folder), credits; uninstalling asks whether to also delete your data (default: no). The launcher finds the bundled Java (#98).
- `app/lancador.py`: one launcher for Linux and Windows (what the packages will run): starts the page, scope, simulator, Gecko (in Xvfb on Linux) and the editor engine, waits until ready, opens the browser as an app (`--abrir`), and on Ctrl+C or `--parar` stops what it started, leaving Gecko up if a circuit is unsaved (or when that cannot be known; `--forcar` stops it). With `--produto` it uses the produto profile. A fresh Gecko starts on a blank sheet when nothing is open (#94).
- Config profile `produto` for the upcoming Windows installer and AppImage (`MAISIM_PERFIL=produto`): data in a visible folder (`Documents\\MaiSim` on Windows, `~/MaiSim` on Linux), cache in the system's place, and a personal config file on top (`%APPDATA%\\MaiSim\\maisim.env` / `~/.config/maisim/maisim.env`) where the installer writes the chosen port and folders. The developer setup is unchanged (#92).
- Home page, Circuits: a delete button on your circuits (not on the one open in the editor). After a confirmation it deletes the circuit for good, with its control code and colours, so nobody has to find the folder (#87).
- Home page: a **Circuits** section. *Recent* lists the circuits opened last (the simu notes every open and save in `recentes.json`), *All circuits* lists yours, the library and the extra folders by group, with search; one click opens a circuit in the simu, and the folder where your circuits are kept is shown (#85).
- CI: when the full suite passes on main, every PR merged since the last green run gets a comment saying so (with the run link), and the READMEs show the verify and full-suite status badges (#84).
- `MAISIM_PORTA=8100` in the `.env` moves all seven ports at once (8100–8106, display :81), like `npm run maisim -- -p 8100` but for good; a port written separately still wins (#86).
- Simu properties panel: Gecko parameters that are a choice show as one. The signal source shape (SIGNAL, FILE, RANDOM) is a list (Sine, Triangle, Rectangle, Random, Import; Gecko stores 402–406), every source type (U, I, MMF, HEAT-SOURCE, DT) too, and Gecko's yes/no parameters (useExternal, display…) are checkboxes. Typing `$` in a parameter that takes a global variable lists the circuit's variables with their values, filtered as you type (↑/↓, Enter or Tab, Esc, click) (#70).
- **Scope: Power in Measure.** A *Power* mode pairs each voltage with its current by name (`v_a` with `i_a`; pick other pairs in the lists), draws p(t) = v(t)·i(t) as a curve with its legend entry, and gives P, V_rms, I_rms, S, λ = P/S and the fundamental P₁ and Q₁ over the Fourier window (#68).
- Simu: put a signal in several scope panels, and delete panels, right from the signal's panel picker (#67).
- Simu tests: `simu/validacao/vistoria_componentes.py`, an on-demand survey of the 121 palette components on the test instance (each one alone on a new sheet: inserted as the palette does, its parameters read, a short run), written to `simu/validacao/tmp_vistoria/` as JSON and a Markdown table (#77).

### Changed
- Tooltips in MaiSim's own style on every page (home, simu, code window, scope, the Gecko page), not the browser's native box: the simu's tooltip script moved to `app/public/maisim-dica.js`, one file served by the home page and by the simu and scope servers and loaded by the nav rail where a page does not ask for it; it also shows on keyboard focus (Tab), keeps the screen reader description (`aria-describedby`) while the `title` is moved aside, follows the MaiSim size (zoom), gets a border in the dark theme and stays off on touch. The same file gives every dropdown (`select`) on those pages the look of the AI chat's selectors: rounded, MaiSim's own arrow, the page's accent on hover and focus; widths stay as they were (#121).
- AI chat with no AI account signed in: a generic message and an "AI accounts" button that opens the accounts window — no message box, send button or model/effort/AI selectors (#105).
- CI spends far fewer Actions minutes: the full suite runs once a day (only if main changed since the last green run), when VERSION changes, or by hand — no longer after every merge; verify skips the tests when a PR only changes text (CHANGELOG, READMEs, LEIA) (#101).
- The AI processes (the CLIs, their sign-in, their stop) go through one module, `simu/processos.py`: a process group via a new session and `killpg` on Linux, `CREATE_NEW_PROCESS_GROUP` and `taskkill /T` on Windows. The terminal-based sign-in (Gemini, Antigravity) no longer imports Linux-only modules on Windows: there the tool opens in its own terminal window and MaiSim follows until the account appears. Linux behaviour is unchanged (#95).
- MaiSim works without internet: the control guide uses a bundled `marked`, and `simu/vendor.sh` puts a pinned, SHA-checked, trimmed Monaco (editor + Python, ~4 MB) in `simu/static/vendor/` (outside git; the packages always include it). Without it, the code editor still falls back to the CDN as before (#91).
- Scope Measure → Power: the p(t) curves have their own axis, on the right, in W (ticks with the prefix, its own automatic scale, in the curve's color when there is one pair), so v and i keep their range on the left axis instead of being squashed by (or clipping) a kW-sized p. Vertical zoom (drag, Ctrl + Shift + wheel) moves both axes and fit resets both; **Fixed Y** also takes the power axis min/max (blank = automatic, kept in the layout); the axis is in the PNG and goes away when every p(t) is hidden in the legend (#83).
- The terminal messages of `npm run maisim`, the background start/stop scripts (`app/scripts/sobe_fundo.sh`, `para_fundo.sh`) and the Gecko scripts (`gecko/sobe.sh`, `para.sh`, `construir.sh`) follow the terminal language (Portuguese when `LC_ALL`/`LC_MESSAGES`/`LANG` is `pt*`, English otherwise), through one shared helper (`config/fala.sh`). The editor engine's own errors (an unknown command, a malformed `SETM`) are in English, like Gecko's and Java's (#78).
- Simu: the signal's panel list shows the panel names in math notation (`i_L` → *i* with L as a subscript), like the drawing and the scope (#74).
- A channel color chosen on the circuit also applies in the scope, which follows it right away (#66).
- Sources follow the generator convention: the current arrow of a voltage source leaves its + terminal, and its measured current (scope, Measure, the control's `m[...]`) is positive when it delivers power. Gecko measures every current from terminal 1 to terminal 2, so MaiSim flips the sign it reads for a voltage source; the Gecko file is unchanged. The current source shows its arrow (terminal 1 → 2) instead of a "+" (#71).

### Removed
- The Google Antigravity and Gemini CLI integrations: signing in with a Google account through a third-party program risks the account being suspended. Claude (Claude Code) is the only AI; other AIs (e.g. a local model) are on the roadmap (#111).

### Fixed
- Thermal network and simple losses from the screen: Rth, Cth, DT, HEAT-SOURCE, Pv and TREF get their terminals where Gecko puts them (thermal wires connect and are checked like the others, drawn in orange); the Pv panel picks the switch or diode it heats (shown as "♨ IGBT.1"), TEMP measures between two thermal labels and FLOW reads a Pv's total, conduction or switching loss (`losscomp`, saved in the file), with automatic names (`Tj_IGBT1`, `Pv_IGBT1`, `Psw_IGBT1`) for the scope and `m[...]`, also inside subcircuits; semiconductors show a **Losses** section (uF, rON, k_on, k_off, uK) and warn when no Pv uses them. New example `exemplo_buck_termico` (buck with IGBT and diode losses heating an Rth–Cth network), checked by hand against Gecko's formulas (`termica_api`, `termica_tela`) (#119).
- Opening MaiSim no longer shows the red "Gecko was restarted" notice: at startup Gecko is always new, so when nothing was unsaved the circuit is reopened quietly (log only); the notice stays when unsaved work was set aside, and when Gecko restarts while MaiSim is running (#123).
- README (en/pt): a Download section in sync with maisim.org — Windows installer and Linux AppImage (latest), earlier versions, requirements, where the data goes; the git clone setup becomes "Run from source" (#122).
- Windows installer build in CI: the Inno Setup container (another user than the runner) could not write the output ("Access denied"); monta.sh opens the folders it uses (#117).
- CI packages workflow: no Maven cache in setup-java (Gecko's pom.xml only exists after gecko/construir.sh, so the step failed at once) (#115).
- The page server (app/pagina.py) tells the browser `Connection: close` on every proxied module response — it closes the connection after each one, and without the header the browser could try to reuse a dead connection; the error-to-AI UI test signs in the fake Claude now that the chat box needs a signed-in AI (#105) (#114).
- Claude Code on Windows: MaiSim looks for `claude.exe` (on the PATH, else `%USERPROFILE%\.local\bin\claude.exe`, which the installer does not put on the PATH of an already-open MaiSim) and never the npm `claude.cmd`; the AI processes get the Windows system variables they need (`SYSTEMROOT`, `USERPROFILE`, `APPDATA`, `TEMP`…) in their whitelisted environment; the Claude sign-in opens the person's own browser there (the Linux URL-catching script is not used); and in the produto profile the MaiSim Claude login lives in `%APPDATA%\MaiSim\claude` instead of a `.claude-maisim` folder in the home directory. Linux is unchanged (#108).
- AI accounts window, Windows: when Claude Code is missing, an **Install Claude Code** button runs Anthropic's official installer (PowerShell `irm https://claude.ai/install.ps1 | iex`, no administrator) in the background, shows its output while it runs and, when it finishes, finds the new `claude.exe` without restarting MaiSim and offers **Sign in**. **Look again** re-checks for a Claude Code installed some other way. On Linux/macOS the window shows the official `curl -fsSL https://claude.ai/install.sh | bash` command instead, and on Windows the Antigravity card shows its PowerShell installer instead of the bash line (#108).
- Windows: the MaiSim window's taskbar icon is sharp — the launcher gives the browser window MaiSim's own app ID and relaunch icon (maisim.ico), and the installer's shortcuts share that ID (#109).
- Windows: reading the editor state no longer fails with "Compressed file ended before the end-of-stream marker" — a .ipes read while Gecko is still writing it is read again after a moment (up to ~3 s) (#107).
- Example and test circuits no longer carry the author's local path in Gecko's internal `path` line (only the file name) (#110).
- The MaiSim window icon is sharp: PNG favicons in 32/48/64/192 px and a multi-size favicon.ico first in the page head, without the SVG favicon and with a new URL so Edge does not reuse the cached one (the browser app window and the Windows taskbar use the favicon; the SVG came out small and blurry) (#106).
- Windows installer: installing over an existing MaiSim is an update — it keeps the install folder, the circuits folder and the port without asking again (the "folder inside the program folder" check only applies to a fresh install), and stops a running MaiSim before replacing files (a running Gecko locked `jre\bin\awt.dll`: "Access denied"); if MaiSim processes are still running from the program folder (found by path, also after an interrupted install), it asks and closes them (#103).
- Windows install (rc1 feedback): ports browsers refuse (6000, 5060, 6665–6669, 10080… — `ERR_UNSAFE_PORT`) are rejected by the installer's port page and by the config, and the launcher shows config errors in a dialog (no terminal with `pythonw`); the cache moves to its own `%LOCALAPPDATA%\MaiSim\Cache` (uninstall deletes only that, never other files in `%LOCALAPPDATA%\MaiSim`); Gecko patch 0004 makes the RMI registry and remote object listen on 127.0.0.1 only, so Windows Firewall no longer asks to allow Java ; on Windows the servers run in UTF-8 mode and Java with `-Dfile.encoding=UTF-8` (a `≈` in the run summary failed to save under cp1252); the installer refuses a data folder inside the program folder (or around it), and uninstall removes only the folders it installed, so circuits kept there survive ; Windows tools' output (`netstat` in Portuguese) is read in the console code page; the servers always send paths with `/` (on Windows the examples showed as `exemplos\exemplo boost`, without title and description) (#100).
- Gecko patch `0003-oculto-e-dialogos`: with `-Dmaisim.oculto=true` Gecko's main window stays hidden (for Windows, where there is no virtual display), and with `-Dmaisim.dialogos=FILE` a watcher inside Gecko catches every modal dialog, from startup on, writes "title TAB text" to FILE and presses its default button, so a request never waits for an OK nobody sees, on Linux and Windows without X11. The simulator reads the file and tells the page (now with the dialog's text); the X11 watcher stays as a fallback on Linux. The Gecko-restart check (#82) gains a Windows version (`netstat` + process start time) (#96).
- A new, untouched circuit no longer reports an unsaved control: the template `leitura.py`/`escrita.py` every new circuit carries counted as "control in use" (#94).
- The page is served by Python (`app/pagina.py`, standard library) instead of Vite: home page, `app/public/` and the `/maisim/simu`, `/maisim/scope` and `/maisim/gecko` (websocket included) routes, each response closing its connection as before. MaiSim no longer needs Node to run (only the screen tests do); `MAISIM_PAGINA=vite` keeps the old Vite page. First step towards the Windows installer and the AppImage (#90).
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
