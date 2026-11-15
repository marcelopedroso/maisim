<!-- What this PR does and why, in a few lines. One subject per PR. -->

## Checklist

From [CONTRIBUTING.md](https://github.com/marcelopedroso/maisim/blob/main/CONTRIBUTING.md):

- [ ] One subject, and one line in `CHANGELOG.md` under **Unreleased** with this PR's number
- [ ] A test that fails without the change, added to the lists in `simu/validacao/ci.sh`
- [ ] Every user-visible text in both languages (`python3 simu/validacao/lingua_offline.py` passes)
- [ ] Read my own diff for what the tests don't catch: a list or condition that forgets a case, state that goes stale,
      check-then-act, and closing / restarting / upgrading / huge inputs

## New feature, or a change in the run loop

Delete this section otherwise. "Not tested" is an accepted answer; a blank is not (CONTRIBUTING.md, "A new feature answers
five questions").

- **Parameters:** <!-- what depends on the installation, and where it is configured -->
- **Cost when off:** <!-- what changes in the usual path, and how you checked -->
- **Cost when on:** <!-- numbers before and after; the command, the machine, the sample size -->
- **Where it runs:** Windows: … · Linux: … · Android: … · phone-sized page: … <!-- tested (how) or not tested -->
- **Default path:** <!-- which test exercises it with the feature off -->
