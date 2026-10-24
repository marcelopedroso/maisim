# MaiSim — notes for AI coding agents (same as CLAUDE.md)

- Read `CONTRIBUTING.md` first (tests run only on the test instance, one subject per PR).
- **Every user-visible text is bilingual (pt-BR + English).** Never add a loose string to a page, a server message or an
  AI instruction: add a key to the dictionary with both languages side by side and use `tr("key", {params})` (pages,
  `textos_*.js`, `data-tr*` attributes) or `lingua.tr("key", **params)` (servers, `simu/textos.py`, `scope/textos.py`).
  Protocol values (JSON keys, run states, file/folder names, routes, signal names) are never translated.
- `python3 simu/validacao/lingua_offline.py` must pass; it fails when a new Portuguese string appears outside the
  dictionaries or a key misses a language.
