<p align="center"><img src="app/public/marca/maisim-logo.svg" alt="MaiSim" width="360"></p>

# MaiSim

**English** | [Português](README.pt-BR.md)

[![verify](https://github.com/marcelopedroso/maisim/actions/workflows/verify.yml/badge.svg)](https://github.com/marcelopedroso/maisim/actions/workflows/verify.yml) [![full suite](https://github.com/marcelopedroso/maisim/actions/workflows/full-suite.yml/badge.svg?branch=main)](https://github.com/marcelopedroso/maisim/actions/workflows/full-suite.yml)

**Open-source power electronics simulation and control platform, with AI.**

MaiSim runs in your browser, on your own machine, with [GeckoCIRCUITS](https://github.com/geckocircuits/GeckoCIRCUITS)
as its simulation engine. You build the circuit, write the control code in Python, run and measure, and you can ask an
AI assistant (Claude Code) that sees the circuit, the control code and the runs.

> The user interface is in English and Brazilian Portuguese: it follows your browser's language the first time, and the
> PT/EN button at the foot of the side menu switches it. The documentation inside the modules (the `LEIA.md` files) is
> in Portuguese.

| Module | What it does | Docs |
|---|---|---|
| **simu** (`/maisim/simu`) | the circuit editor (palette, wires, subcircuits, global variables), Python control sampled every Ts, runs, and the AI chat | [`simu/LEIA.md`](simu/LEIA.md), [`simu/GUIA_CONTROLE.en.md`](simu/GUIA_CONTROLE.en.md) |
| **scope** (`/maisim/scope`) | plots of the runs: live, compare two runs, sections and panels, exportable views | [`scope/LEIA.md`](scope/LEIA.md) |
| **gecko** (`/maisim/gecko`) | the real GeckoCIRCUITS window on a virtual display, opened in the browser (noVNC) | [`gecko/LEIA.md`](gecko/LEIA.md) |
| **app** | the home page and side menu (served by Python, `app/pagina.py`), which routes to the other modules; installable as an app (PWA) | [`app/public/marca/LEIA.md`](app/public/marca/LEIA.md) |

Ready-made examples live in [`exemplos/`](exemplos/): buck, boost, buck-boost, DC H-bridge, half-bridge, full-bridge
and three-phase inverters, single-phase, three-phase and controlled three-phase rectifiers (open loop, with the meters in
place), and digital control (a current PI; a buck with the PWM and the PI in code).

## Download

| | |
|---|---|
| **Windows** (installer) | [**MaiSim-Setup.exe**](https://github.com/marcelopedroso/maisim/releases/latest/download/MaiSim-Setup.exe) |
| **Linux** (AppImage, no install) | [**MaiSim-x86_64.AppImage**](https://github.com/marcelopedroso/maisim/releases/latest/download/MaiSim-x86_64.AppImage) |
| Earlier versions and test builds (`-rc`) | [Releases](https://github.com/marcelopedroso/maisim/releases) |

Each file comes with a `.sha256` next to it on the Releases page. Everything is inside (Python, Java, GeckoCIRCUITS): no
internet needed after downloading, nothing else to install.

- **Windows 10 (1809+) or 11, 64-bit**, about 250 MB, Edge or Chrome; installs for your user only, **no administrator**.
  Installing a newer version over the old one updates it and keeps your circuits and settings. The installer is not
  code-signed yet: if SmartScreen warns, choose **More info → Run anyway**.
- **Linux x86_64** (glibc 2.17+) with Xvfb (`sudo apt install xvfb`): `chmod +x MaiSim-x86_64.AppImage` and run it.
- **AI (optional):** a Claude account. On Windows, MaiSim installs Claude Code for you from its AI accounts window.

Your circuits and runs go to a visible folder: `Documents\MaiSim` on Windows (you can choose another when
installing), `~/MaiSim` on Linux.

To change the code, run it from source (below).

## Run from source (developers)

### Requirements

Linux (tested on Ubuntu 22.04 and WSL2):

- **Python 3** with **numpy**;
- **Java 11 (JDK)**, **Maven** and **git**, to build GeckoCIRCUITS;
- **Node.js 22** only to run the screen tests (the page itself is served by Python, `app/pagina.py`);
- the virtual display and noVNC: `xvfb x11vnc novnc websockify x11-utils libxtst6` (plus `openbox`, optional, so the
  Gecko windows get borders and open maximized).

```bash
sudo apt install -y python3 python3-numpy openjdk-11-jdk maven git xvfb x11vnc novnc websockify x11-utils libxtst6 openbox
```

MaiSim works with the AI installed on your computer (optional): [Claude Code](https://claude.com/claude-code)
(`claude`). You sign in from MaiSim's own screen, and the login is kept in a separate folder (`~/.claude-maisim`), so
your usual login is not touched. Other AIs (e.g. a local model) may come later.

### Install and run

```bash
git clone https://github.com/marcelopedroso/maisim.git && cd maisim
simu/vendor.sh                # the code editor (Monaco) here, so MaiSim works offline
gecko/construir.sh            # upstream GeckoCIRCUITS at a pinned commit + MaiSim's patch → gecko/build/gecko-lote.jar
app/scripts/maisim.sh --abrir # starts everything and opens the MaiSim window (or: cd app && npm run abrir)
```

With `--abrir` it runs the same launcher as the Windows installer and the AppImage (`app/lancador.py`): closing the last
MaiSim window stops MaiSim about 20 s later (never during a run; Gecko stays up if a circuit is unsaved), and running it
again while MaiSim is up only reopens the window. On WSL the window opens in Windows' Chrome or Edge (`MAISIM_NAVEGADOR`
picks another browser, options allowed). Without `--abrir` (`npm run maisim`, or `app/scripts/sobe_fundo.sh` in the
background) MaiSim stays up until Ctrl+C (or `app/scripts/para_fundo.sh`), whether the window is open or not;
`MAISIM_PAGINA=vite` serves the page with Vite in that mode.

**On Windows with WSL, a desktop shortcut:** `app/scripts/atalho_windows.sh` (run once in WSL) creates **MaiSim (dev)**
on the Windows desktop. A double click starts MaiSim in WSL with `--abrir` and opens the window, with no console
window. For the window with the large taskbar icon, install MaiSim as an app in Chrome or Edge once (⋮ → Cast, save, and
share → Install page as app), then put the app's id (shown in `chrome://web-app-internals`) in `.env` as
`MAISIM_APP_ID=…`: the launcher then opens the installed app instead of a plain `--app` window. `--remover` deletes the
shortcut.

Open **http://localhost:7100**. To use another port, pass it with `-p`: `npm run maisim -- -p 8100` serves the page on
8100 and the other services on the ports right after it (8101–8106). To keep another port for good, put one line in a
`.env` at the root: `MAISIM_PORTA=8100` (handy when 7100 is already taken on your machine). Ports (7100–7106 by default, `localhost` only) and
folders are set in [`config/padrao.env`](config/padrao.env); to change something for good on your machine, create a `.env`
at the repository root with only what changes.

Your data (circuits, subcircuits, runs, AI contexts) lives in `~/.local/share/maisim`; what can be rebuilt (editor
state, conversations, logs, Gecko), in `~/.cache/maisim`.

## Taking a circuit to another machine

On the home page, **Export** on a circuit's row saves a `<name>.msd` file: the circuit (with its subcircuits), its control
code, appearance and default scope layout, plus the runs you tick (none by default; the estimated size is shown).
**Import…** in the Circuits header reads a `.msd` on any MaiSim (Windows, WSL or Linux), shows what comes in and, if the
name is taken, offers `<name>_2` (replacing needs a confirmation). The runs come linked to the imported circuit. A `.msd`
is a zip with a `manifest.json` that lists every file with its SHA-256; nothing is written unless every file checks out.

## Tests and contributing

Everything goes in through pull requests, with the tests running on GitHub Actions (API tests in Python and UI tests
with Playwright, on an isolated test instance). The workflow, versioning and how to run the tests locally are described
in [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`simu/validacao/LEIA.md`](simu/validacao/LEIA.md).

## License

[GNU GPL v3](LICENSE). Author: Marcelo Pedroso.

## Credits

- **[GeckoCIRCUITS](https://github.com/geckocircuits/GeckoCIRCUITS)** (GPLv3): the circuit simulator behind MaiSim.
  `gecko/construir.sh` downloads upstream at a pinned commit and applies the patch in [`gecko/patches/`](gecko/patches/)
  (batch read and write through the remote interface); its source code is not part of this repository.
- **[KaTeX](https://katex.org)** (MIT): equations in the AI answers, shipped in [`simu/static/katex/`](simu/static/katex/)
  with its license.
- **[noVNC](https://novnc.com)** (MPL 2.0) and **websockify** (LGPLv3), from the system: the Gecko display in the browser.
- **[Vite](https://vite.dev)** (MIT): the page server in the developer setup (`npm run maisim`). **[Playwright](https://playwright.dev)** (Apache 2.0): the UI
  tests.
- **AI:** MaiSim calls the official [Claude Code](https://claude.com/claude-code) (Anthropic) program,
  unmodified; it follows its own terms of use. MaiSim is not affiliated with Anthropic.
- **Logo:** concept and direction by Marcelo Pedroso, drawn with Claude ([`app/public/marca/`](app/public/marca/)).
