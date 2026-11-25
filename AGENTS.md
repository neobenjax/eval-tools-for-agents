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
- **PR Auto-Closing & Body Key Hygiene:** Include `Closes SIDE-XX` in the PR description so Linear auto-closes the exact issue on merge. **Important:** `.github/workflows/linear-sync.yml` scans the entire PR body for **every** `\bSIDE-\d+\b` token and moves all matched keys (`In Review` on open, `Approved` on merge); en-dash ranges (e.g. `SIDE-28`–`SIDE-36`) only hit the two endpoints, and `P-SIDE-6` matches `SIDE-6`. Name **only** the `SIDE-XX` key(s) whose Linear stage should change in the PR body, and refer to other issues by milestone tag (e.g. `M2b.1 through M2b.9`) and `eval-tools-for-agents`.
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
- Every tool in `tools/*` MUST expose a deterministic CLI and support autonomous **Agent Looping** (max 5 iterations) across harnesses.
- `pixel-gate` stdout is the `SPEC.md` section 6 object on every exit except `--help` and `--version`: `schemaVersion` `1`, `gates.gate1` / `gates.gate2` / `gates.gate3`, `findings[].id` as the stable branch key, `error` `null` or `{ "message" }`, and a skipped gate `{ "passed": true, "skipped": true, "reason" }`. Agents branch on `passed`, `findings[].id`, and `error`.
- Playwright is pinned to exact `1.65.1`. A pixel `mismatchPct` blocks on `ubuntu-latest`. Windows and macOS report it without blocking (`SPEC.md` section 5). The M2 intake gap guards that assert with `process.platform !== 'win32'`. Do not skip the green M1 suite on Windows.
- Milestone status: M1-AC-01 through M1-AC-15 are green. There is no open M1 gap suite. M2-AC-01 through M2-AC-37 stay unchecked gap criteria (`ERR_ASSERTION` until the criterion's own test passes). `ENFORCED_MILESTONES` is `M1` and `M2`. Promoting a criterion means moving its tests to `tests/acceptance/m2/*.test.mjs`, checking the section 8 box, and setting manifest `suite` to `"pass"` in the same change (`SPEC.md` section 13). When a gap break-it starts passing before its criterion, move it unchanged to a green `*.test.mjs` and register `{ title, suite: "pass" }`, leaving the section 8 box unchecked. M2-AC-02, M2-AC-04, M2-AC-05, M2-AC-18, and M2-AC-21 are that case, in `tests/acceptance/m2/m2-shipped-break-its.test.mjs`.
- Keep `CONTEXT.md` lean; place tool-specific context inside `tools/<tool>/CONTEXT.md`.

## 7. Strict Self-Review Before Opening a PR (Reviewer-Ready Standard)
PRs are reviewed by a strict gatekeeper (`@benjaminszaiagent`) that approves only when every acceptance criterion has evidence and no real bugs remain. Do this **before** pushing and opening the PR, and fill in every section of `.github/PULL_REQUEST_TEMPLATE.md` with real output.

### Before you open a PR
1. After each fix, `git grep` the whole repo for every other statement of that rule (`SPEC.md`, `README.md`, `CONTEXT.md`, `tools/*/CONTEXT.md`, `AGENTS.md`, test file headers, and the PR body) and update them in the same commit.
2. Undo each fix once on a scratch copy and confirm a test fails. If none does, add or strengthen the assert so it checks finding ids and required keys, not only a message string or a numeric value.
3. Put a platform guard on every assert that encodes an OS-specific rule, including break-its. Pixel `mismatchPct` blocks on `ubuntu-latest` only. Windows and macOS report it. Match the existing guard `process.platform !== 'win32'` unless `SPEC.md` section 5 is changed in the same commit.
4. Fill **Break-It Checks** and **Consistency Sweep** with the command and the output. An empty box is not evidence.
5. Run `node scripts/verify.mjs`. Keep CI green on `windows-latest` and `ubuntu-latest`.
6. Rebase on (or merge) the latest `main` and re-run `node scripts/verify.mjs` before requesting review. PR CI checks the merge commit only as of when it ran.

7. **Evidence per criterion.** Copy each acceptance criterion verbatim from the Linear issue / `SPEC.md` §8 and attach proof: the exact command and its key output, the test that asserts it, or a CI job link. "Should work" is not evidence; a platform named in a criterion (e.g. Windows) needs a run on that platform.
8. **Break it on purpose.** For every new check, gate, or test, write at least one input that must fail and confirm it does. Cover both directions: extras rejected **and** missing/deleted items rejected. Use mutation tests on scratch copies (delete a key, add a bogus one, empty a section, CRLF line endings, duplicate keys, capital `[X]`). A check that cannot fail is a bug. When a parity check special-cases an enforced milestone (`ENFORCED_MILESTONES`), require every §8 checkbox under a closed `[x]` heading to be `- [x]` rather than exempting the whole family, and print exact counts in success logs (never a simplified `headings = open` claim).
9. **One fact, every place.** When a status, decision, key, or behavior changes, `git grep` the old wording and update every occurrence in the same commit (`SPEC.md` §1/§4/§8/§9/§10/§11, `README.md`, `CONTEXT.md`, `tools/*/CONTEXT.md`, test headers, help text, and the PR body).
10. **Look at the artifacts.** Open the PNGs, JSON, and logs the tool produces and confirm they agree with the reported result (e.g. masked regions look the same in every composite panel).
11. **Runs where it matters.** New scripts/checks must run in `.github/workflows/ci.yml`, work on a detached HEAD (`GITHUB_HEAD_REF`), and pass on Windows (primary dev platform) and `ubuntu-latest`.
12. **Final pass as the reviewer.** Prompt yourself: *"Act as a strict reviewer. For each acceptance criterion, show evidence. Then try to break every new check with mutation tests and list anything that still passes when it shouldn't."* Fix everything it finds, then open the PR. Be explicit in the PR body about anything out of scope or left for later.
13. **Acceptance tests.** A milestone is done only when every acceptance test in its suite passes on both `windows-latest` and `ubuntu-latest` (`SPEC.md` section 13). In the PR body, list each acceptance-test id this PR moves from gap to pass, and paste the `node scripts/acceptance-status.mjs` gap summary. Do not weaken, delete, skip, or reclassify an acceptance test to make the suite green. If the PR modifies or deletes an existing file under `tools/pixel-perfect-gate/tests/`, or edits the acceptance gate (`scripts/acceptance-lib.mjs`, `scripts/acceptance-status.mjs`, `scripts/acceptance-status.test.mjs`, `scripts/verify.mjs`, `tools/pixel-perfect-gate/package.json`, `.github/workflows/ci.yml`), the PR body must include `Acceptance-test change rationale:` followed by why. A blank template line, the template hint, and `n/a` do not count. The default fix is to change the product so the existing test passes.
