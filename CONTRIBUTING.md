# How code gets into MaiSim

1. **Always through a PR.** All work goes on a branch (`git switch -c <topic>`), pushed with `git push -u origin <topic>`
   and opened as a PR against `main` (`gh pr create --fill`). Never push straight to `main`: the branch protection on
   GitHub blocks it (PR required, the required check, applies to administrators too, linear history, no force-push),
   and the `.githooks/pre-push` hook warns you before that, on your machine (enable it once per clone:
   `git config core.hooksPath .githooks`).
2. **Every PR is verified** (workflow `verify`, `.github/workflows/verify.yml`; the required check is the job
   `tests (quick)`): GitHub Actions starts the test instance (GeckoCIRCUITS on a virtual display, the simulator, the
   scope, the web page) and runs the quick test set (`simu/validacao/ci.sh rapido`: the offline tests plus the essential
   API and UI tests, with Playwright). Passed → Actions itself merges the PR into `main` (squash: one commit per PR) and
   deletes the branch. It does not merge on its own: draft PRs, PRs with the `do-not-merge` label, and PRs from anyone
   other than the repository owner (those wait for review). The merge only applies to the commit that was tested. A
   draft that is marked ready runs the verification again (and is merged if it passes).
   **Codex reviews every PR** (the ChatGPT app on GitHub): its comments are answered on the PR itself, either fixed on
   the branch or explained why not, and the conversation is resolved. Before merging, Actions waits for the Codex
   review to finish (up to 10 min; after that it goes on without it) and does not merge while a conversation is open
   (`.github/scripts/wait_for_codex.py`; the `main` protection also requires conversations to be resolved). If the
   `merge into main` job fails for that reason: resolve the conversations and re-run the job (or push the fix to the
   branch, which runs the whole verification again).
3. **After the merge, the full suite** (workflow `full suite`, `.github/workflows/full-suite.yml`,
   `simu/validacao/ci.sh completo`: UI, API, offline and the live scope). If it fails, it opens an issue with a link to
   the logs and screenshots.
4. **Version:** the `VERSION` file ([SemVer](https://semver.org)). A PR that changes `VERSION` becomes, after the merge
   and a green full suite, the tag `vX.Y.Z` and a GitHub Release with notes generated from the PRs.

## Running the tests on your machine

```bash
simu/validacao/sobe_teste.sh          # start the test instance (ports 7200–7206, profile config/teste.env)
simu/validacao/ci.sh rapido           # what a PR's verification runs (~10 min)
simu/validacao/ci.sh completo         # the full suite (~70 min)
simu/validacao/ci.sh inicio_tela      # only the given tests
simu/validacao/desce_teste.sh         # stop the test instance
```

The tests only run on the test instance, never on the MaiSim you use (7100): the AIs are fake ones
(`simu/validacao/*_falso.py`) and the folders are disposable (`~/.cache/maisim_teste`). `claude_tela` (the real Claude
login link) only runs on your machine, not on Actions.

The documentation of the modules (the `LEIA.md` files) is in Portuguese. The user interface is being made bilingual
(Brazilian Portuguese and English).

## Text in two languages

Every user-visible text (pages, server messages) goes through the dictionaries, never as a loose string, with both
languages side by side; long texts (the AI's instructions, the control guide, the code templates) are paired files
(`x.pt.md` / `x.en.md`, `GUIA_CONTROLE.en.md`, `*_modelo.en.py`) that the guard compares:

- pages: `tr("simu.saved_to", { arq })`, with the entry in the page's `textos_*.js`
  (`"simu.saved_to": { pt: "salvo em {arq}", en: "saved to {arq}" }`); static HTML uses `data-tr="key"` (also
  `data-tr-html`, `data-tr-title`, `data-tr-ph`, `data-tr-aria`, `data-tr-msg`). The runtime is `app/public/maisim-i18n.js`.
- servers: `lingua.tr("motor.not_found", ref=x)` with the entry in `simu/textos.py` / `scope/textos.py` (the module calls
  `lingua.registra(T)` once); background
  threads are started with `lingua.thread(...)` so they keep the user's language.
- values that are protocol (JSON keys, run states, file and folder names, routes, signal names) are never translated.

`simu/validacao/lingua_offline.py` (in every PR) checks that every key has `pt` and `en` with the same `{parameters}`,
that every key used exists, and counts loose Portuguese strings: the count may only go down (after translating, update
the baseline with `python3 simu/validacao/lingua_offline.py --atualiza`). A deliberate exception gets `i18n-ok` on its line.
