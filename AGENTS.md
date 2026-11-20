# Universal AI Agent Guardrails (`AGENTS.md`)

Mandatory operating rules for all AI coding assistants (**Antigravity Desktop, Antigravity CLI, Cursor, Claude Code, Codex**) working in `eval-tools-for-agents`. Adapted from `neobenjax/Canadian-Open-Data-Agentic-Platform`.

---

## 1. Branch Protection & Gitflow (NEVER Direct Commit to `main`)
- All feature/fix work MUST be developed on a branch cut from `main`:
  ```powershell
  git checkout main
  git pull origin main
  git checkout -b feat/SIDE-XX-short-description
  ```
- Non-sprint housekeeping/docs PRs use `docs/<topic>` or `chore/<topic>` without fabricating ticket IDs.

## 2. Linear 1:1 Key Parity & Stage Transitions
- **Workspace:** `https://linear.app/benjamin-personal-projs` · **Team:** `Side Projects` (`SIDE`).
- **Single Source of Truth:** Always use the exact native Linear key (`SIDE-XX`) across `SPEC.md`, branch names, commit messages, and PRs.
- **Proposed keys:** `SPEC.md` rows not yet in Linear use `RS-XX` (never `NEW-XX`, never a guessed `SIDE-XX`). When the owner creates the Linear issue, replace `RS-XX` with its `SIDE-XX` everywhere in one commit.
- **Commit Format:** `[SIDE-XX] feat: concise description of change`
- **PR Auto-Closing:** Include `Closes SIDE-XX` in the PR description so Linear auto-closes the exact issue on merge.
- **Stage Discipline:**
  - `In Progress`: Active local development (before PR is opened).
  - `In Review`: Once the PR is opened (never before).
  - `Approved` (or `Done`): Once the PR is accepted/merged (automated by `.github/workflows/linear-sync.yml` when `LINEAR_API_KEY` repo secret is set, or via `node scripts/sync-linear.mjs --move SIDE-XX "Approved"`).
  - `Rework`: If changes are requested during review.

## 3. Mandatory Pre-Flight Verification
Before pushing or opening a PR, run:
```powershell
node scripts/verify.mjs
node scripts/verify-pr-ready.mjs
```

## 4. Headless Git Execution (Windows Non-Interactive)
- Set `$env:GIT_TERMINAL_PROMPT="0"` before git network commands so automated agents never hang on credential prompts.

## 5. Post-Squash Branch Cleanup
- After squash-merging a PR into `main`, verify the commit is on `origin/main` and delete the local & remote feature branch:
  ```powershell
  git checkout main
  git pull origin main
  git branch -D feat/SIDE-XX-short-description
  ```

## 6. Deterministic Eval & Agent Looping Standard
- Every tool in `tools/*` MUST expose a deterministic CLI returning JSON (`passed`, `telemetry`, `artifacts`) and support autonomous **Agent Looping** (max 5 iterations) across harnesses.
- Keep `CONTEXT.md` lean; place tool-specific context inside `tools/<tool>/CONTEXT.md`.

## 7. Strict Self-Review Before Opening a PR (Reviewer-Ready Standard)
PRs are reviewed by a strict gatekeeper (`@benjaminszaiagent`) that approves only when every acceptance criterion has evidence and no real bugs remain. Do this **before** pushing and opening the PR, and fill in every section of `.github/PULL_REQUEST_TEMPLATE.md` with real output:
1. **Evidence per criterion.** Copy each acceptance criterion verbatim from the Linear issue / `SPEC.md` §8 and attach proof: the exact command and its key output, the test that asserts it, or a CI job link. "Should work" is not evidence; a platform named in a criterion (e.g. Windows) needs a run on that platform.
2. **Break it on purpose.** For every new check, gate, or test, write at least one input that must fail and confirm it does. Cover both directions: extras rejected **and** missing/deleted items rejected. Use mutation tests on scratch copies (delete a key, add a bogus one, empty a section, CRLF line endings). A check that cannot fail is a bug.
3. **One fact, every place.** When a status, decision, key, or behavior changes, `git grep` the old wording and update every occurrence in the same commit (`SPEC.md` §1/§4/§8/§9/§10/§11, `README.md`, `CONTEXT.md`, help text).
4. **Look at the artifacts.** Open the PNGs, JSON, and logs the tool produces and confirm they agree with the reported result (e.g. masked regions look the same in every composite panel).
5. **Runs where it matters.** New scripts/checks must run in `.github/workflows/ci.yml`, work on a detached HEAD (`GITHUB_HEAD_REF`), and pass on Windows (primary dev platform) and `ubuntu-latest`.
6. **Final pass as the reviewer.** Prompt yourself: *"Act as a strict reviewer. For each acceptance criterion, show evidence. Then try to break every new check with mutation tests and list anything that still passes when it shouldn't."* Fix everything it finds, then open the PR. Be explicit in the PR body about anything out of scope or left for later.
7. **Acceptance tests.** A milestone is done only when every acceptance test in its suite passes on both `windows-latest` and `ubuntu-latest` (`SPEC.md` section 13). In the PR body, list each acceptance-test id this PR moves from gap to pass, and paste the `node scripts/acceptance-status.mjs` gap summary. Do not weaken, delete, skip, or reclassify an acceptance test to make the suite green. If the PR modifies or deletes an existing file under `tools/pixel-perfect-gate/tests/`, or edits the acceptance gate (`scripts/acceptance-lib.mjs`, `scripts/acceptance-status.mjs`, `scripts/acceptance-status.test.mjs`, `scripts/verify.mjs`, `tools/pixel-perfect-gate/package.json`, `.github/workflows/ci.yml`), the PR body must include `Acceptance-test change rationale:` stating why. The default fix is to change the product so the existing test passes.
