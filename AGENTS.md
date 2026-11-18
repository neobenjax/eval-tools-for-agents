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
