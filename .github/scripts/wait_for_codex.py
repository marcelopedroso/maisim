#!/usr/bin/env python3
"""Before Actions merges a PR ("merge into main" job in verify.yml): wait for the Codex review to finish and refuse the
merge while the PR has open conversations.

- Codex keeps a summary comment on the PR with the review state (<!-- codex-review-state:v1 {...} -->). While it says
  "running", wait. Finished → go on.
- No Codex summary NO_CODEX seconds after the PR was opened → go on (Codex is not reviewing this PR).
- Still "running" after LIMIT seconds → go on without it, with a warning (Codex sometimes gets stuck on "running"; the
  tests are the real gate, and whatever it comments later becomes a follow-up PR).
- Finally, count the open conversations (unresolved review threads). Any → fail with the list: fix or answer and
  resolve each one, then re-run the "merge into main" job. The main branch protection ("conversation resolution")
  would block the merge anyway; this makes the message clear.

Uses gh (GH_TOKEN) and the PR and GITHUB_REPOSITORY variables.
"""
import html
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

CODEX = "chatgpt-codex-connector[bot]"
STATE = re.compile(r"<!-- codex-review-state:v1 (\{.*?\}) -->", re.S)
INTERVAL = 20
NO_CODEX = 5 * 60
LIMIT = 10 * 60

REPO = os.environ["GITHUB_REPOSITORY"]
PR = os.environ["PR"]


def gh(*args):
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def codex_state():
    """The review state from the Codex summary comment, or None if Codex has not commented yet."""
    comments = json.loads(gh("api", "--paginate", "--slurp", f"repos/{REPO}/issues/{PR}/comments"))
    for c in reversed([c for page in comments for c in page]):
        if c["user"]["login"] != CODEX:
            continue
        m = STATE.search(html.unescape(c["body"] or ""))
        if m:
            return json.loads(m.group(1))
    return None


def running(state):
    return any((state.get(k) or {}).get("status") == "running" for k in ("code_review", "security_review"))


def open_conversations():
    owner, name = REPO.split("/")
    query = """query($owner: String!, $name: String!, $pr: Int!) {
      repository(owner: $owner, name: $name) { pullRequest(number: $pr) {
        reviewThreads(first: 100) { nodes { isResolved path line comments(first: 1) { nodes { author { login } body } } } }
      } } }"""
    r = json.loads(gh("api", "graphql", "-f", f"query={query}", "-F", f"owner={owner}", "-F", f"name={name}",
                      "-F", f"pr={PR}"))
    threads = r["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]
    return [t for t in threads if not t["isResolved"]]


def main():
    opened = json.loads(gh("api", f"repos/{REPO}/pulls/{PR}"))["created_at"]
    opened = datetime.fromisoformat(opened.replace("Z", "+00:00"))
    start = time.monotonic()
    while True:
        state = codex_state()
        since_opened = (datetime.now(timezone.utc) - opened).total_seconds()
        if state is None and since_opened > NO_CODEX:
            print(f"codex: no Codex review on this PR after {NO_CODEX // 60} min — going on without it")
            break
        if state is not None and not running(state):
            cr = state.get("code_review") or {}
            print(f"codex: review finished ({cr.get('status')}, commit {str(cr.get('commit_sha'))[:7]})")
            break
        if time.monotonic() - start > LIMIT:
            print(f"::warning::Codex is still reviewing after {LIMIT // 60} min — going on without waiting for it")
            break
        print("codex: reviewing…" if state else "codex: waiting for the review summary…", flush=True)
        time.sleep(INTERVAL)

    unresolved = open_conversations()
    if unresolved:
        print(f"::error::{len(unresolved)} open conversation(s) on the PR — fix or answer and resolve each one, then "
              "re-run the \"merge into main\" job:")
        for t in unresolved:
            c = (t["comments"]["nodes"] or [{}])[0]
            author = (c.get("author") or {}).get("login", "?")
            first = next((l for l in (c.get("body") or "").splitlines() if l.strip()), "")[:160]
            print(f"  - {t['path']}:{t['line']} ({author}) {first}")
        return 1
    print("conversations: none open — ok to merge")
    return 0


if __name__ == "__main__":
    sys.exit(main())
