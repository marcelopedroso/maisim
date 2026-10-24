<p align="center"><img src="app/public/marca/maisim-logo.svg" alt="MaiSim" width="360"></p>

# MaiSim

**English** | [Português](README.pt-BR.md)

[![verify](https://github.com/marcelopedroso/maisim/actions/workflows/verify.yml/badge.svg)](https://github.com/marcelopedroso/maisim/actions/workflows/verify.yml) [![full suite](https://github.com/marcelopedroso/maisim/actions/workflows/full-suite.yml/badge.svg?branch=main)](https://github.com/marcelopedroso/maisim/actions/workflows/full-suite.yml)

**Open-source power electronics simulation and control platform, with AI.**

MaiSim runs in your browser, on your own machine, with [GeckoCIRCUITS](https://github.com/geckocircuits/GeckoCIRCUITS)
as its simulation engine. You build the circuit, write the control code in Python, run and measure, and you can ask an
AI assistant (Claude Code or Google Antigravity) that sees the circuit, the control code and the runs.

> The user interface is in English and Brazilian Portuguese: it follows your browser's language the first time, and the
> PT/EN button at the foot of the side menu switches it. The documentation inside the modules (the `LEIA.md` files) is
> in Portuguese.

| Module | What it does | Docs |
|---|---|---|
| **simu** (`/maisim/simu`) | the circuit editor (palette, wires, subcircuits, global variables), Python control sampled every Ts, runs, and the AI chat | [`simu/LEIA.md`](simu/LEIA.md), [`simu/GUIA_CONTROLE.en.md`](simu/GUIA_CONTROLE.en.md) |
| **scope** (`/maisim/scope`) | plots of the runs: live, compare two runs, sections and panels, exportable views | [`scope/LEIA.md`](scope/LEIA.md) |
| **gecko** (`/maisim/gecko`) | the real GeckoCIRCUITS window on a virtual display, opened in the browser (noVNC) | [`gecko/LEIA.md`](gecko/LEIA.md) |
| **app** | the home page and side menu (Vite), which routes to the other modules; installable as an app (PWA) | [`app/public/marca/LEIA.md`](app/public/marca/LEIA.md) |

Ready-made examples live in [`exemplos/`](exemplos/): buck, boost, buck-boost, DC H-bridge, half-bridge, full-bridge
and three-phase inverters, single-phase, three-phase and controlled three-phase rectifiers (open loop, with the meters in
place), and digital control (a current PI; a buck with the PWM and the PI in code).

## Requirements

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
(`claude`) and/or Google Antigravity. You sign in from MaiSim's own screen, and the login is kept in a separate folder
(`~/.claude-maisim`, `~/.agy-maisim`), so your usual login is not touched.

## Install and run

```bash
git clone https://github.com/marcelopedroso/maisim.git && cd maisim
simu/vendor.sh                # the code editor (Monaco) here, so MaiSim works offline
gecko/construir.sh            # upstream GeckoCIRCUITS at a pinned commit + MaiSim's patch → gecko/build/gecko-lote.jar
app/scripts/maisim.sh         # starts everything (or: cd app && npm run maisim); Ctrl+C stops what it started
```

Open **http://localhost:7100**. To use another port, pass it with `-p`: `npm run maisim -- -p 8100` serves the page on
8100 and the other services on the ports right after it (8101–8106). To keep another port for good, put one line in a
`.env` at the root: `MAISIM_PORTA=8100` (handy when 7100 is already taken on your machine). Ports (7100–7106 by default, `localhost` only) and
folders are set in [`config/padrao.env`](config/padrao.env); to change something for good on your machine, create a `.env`
at the repository root with only what changes.

Your data (circuits, subcircuits, runs, AI contexts) lives in `~/.local/share/maisim`; what can be rebuilt (editor
state, conversations, logs, Gecko), in `~/.cache/maisim`.

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
- **[Vite](https://vite.dev)** (MIT): the web page server. **[Playwright](https://playwright.dev)** (Apache 2.0): the UI
  tests.
- **AI:** MaiSim calls the official [Claude Code](https://claude.com/claude-code) (Anthropic) and Google Antigravity
  programs, unmodified; each follows its own terms of use. MaiSim is not affiliated with any of these companies.
- **Logo:** concept and direction by Marcelo Pedroso, drawn with Claude ([`app/public/marca/`](app/public/marca/)).
