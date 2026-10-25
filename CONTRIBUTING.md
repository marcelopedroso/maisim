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
5. **Changelog:** every PR adds one line to [`CHANGELOG.md`](CHANGELOG.md) under **Unreleased** (Added, Changed or Fixed,
   with the PR number). The PR that bumps `VERSION` moves those lines under the new version, with the date.

## Before opening a PR: what the tests don't catch

The tests prove the main path works. The Codex findings fall almost always into four kinds that live at the edges, so
review your own diff for them before opening the PR (and ask the reviewing agent to, when there is one):

1. **A list or condition that forgets a case.** Every new set, `if` on a type or domain, or whitelist: does it cover all
   the cases (electric / control / thermal / reluctance domain, every component type, the main sheet *and* inside a
   subcircuit)? Search for the other places that decide the same thing and change them together. *Examples: the thermal
   subcircuit terminal left out of the terminal list (#119); dragging that terminal still treated it as electric (#134).*
2. **State that goes stale after a change.** When something is renamed, re-coupled, moved or undone, does whatever
   depends on it follow? *Examples: the notation preview after renaming a parameter (#129); the machine's load-torque
   label after renaming the signal (#133); a FLOW's automatic name after its Pv heats another part (#134).*
3. **Checked, then acted on, but the world changed in between.** A check before an asynchronous step (a download, a
   run, another request) must be repeated right before the action. *Example: the editor state checked before the
   update download, not before installing it (#126).*
4. **Closing, restarting, upgrading, huge inputs.** What happens if MaiSim is closed or restarted in the middle, if an
   older version left files or settings in the old format, or if the input is at the size limit? *Examples: the
   installer kept running after MaiSim closed (#108); the Windows cache moved without the old one (#100); a baseline
   saved before the solver was part of the signature (#132); a 1 GB export read into memory (#102).*

For each item that applies, write a test that fails without the fix (run it once without the fix to see it fail).

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
- servers: `lingua.tr("motor.not_found", ref=x)` with the entry in `simu/textos.py` / `scope/textos_scope.py` (the module calls
  `lingua.registra(T)` once); background
  threads are started with `lingua.thread(...)` so they keep the user's language.
- values that are protocol (JSON keys, run states, file and folder names, routes, signal names) are never translated.

`simu/validacao/lingua_offline.py` (in every PR) checks that every key has `pt` and `en` with the same `{parameters}`,
that every key used exists, and that there is **no** loose Portuguese string in the pages and servers the guard scans
(`ARQ_JS`, `ARQ_HTML`, `ARQ_PY` in that file: zero in every one of them). A deliberate exception gets `i18n-ok` on its
line. When the page script writes an element's text or an attribute (with `tr()`), the text or attribute the script
writes has no `data-tr*` (a language switch would overwrite the script's state); `data-tr-js` on the element exempts it
from the guard.

The first visit follows the browser language (Portuguese → pt, anything else → en); the PT/EN button on the rail
switches every MaiSim window at once (windows on other ports follow when focused) and is remembered (localStorage and
the `maisim-lingua` cookie, which the servers read; a language that only came from the browser is marked as such, so a
choice remembered on another port wins over it). Screen tests run in Portuguese: run them through
`simu/validacao/ci.sh <test>` (e.g. `ci.sh lingua_tela`), which pins Portuguese (`tela/_lingua.js`) — a bare
`node x_tela.js` follows the machine's language. `lingua_tela`, `lingua_api` and `lingua_ia_api` check English.
