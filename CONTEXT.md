# `CONTEXT.md` — Operational Memory (`eval-tools-for-agents`)

> Lean, command-first operational memory for AI coding agents (Antigravity, Cursor, Claude Code, CLI harnesses). Keep domain-specific details in sub-package `CONTEXT.md` files (`tools/*/CONTEXT.md`, `apps/*/CONTEXT.md`).

## Commands

```powershell
# Install all workspace dependencies
npm install

# Run pre-flight verification (lint, structure, tests)
node scripts/verify.mjs

# Verify PR readiness & SPEC.md <-> Linear key parity
node scripts/verify-pr-ready.mjs

# Milestone acceptance: green suite runs inside npm test; this command reports remaining gap criteria
node scripts/acceptance-status.mjs

# Check live Linear stage progression (Todo | In Progress | In Review | Approved | Rework)
node scripts/sync-linear.mjs --status

# Move a Linear issue stage
node scripts/sync-linear.mjs --move SIDE-XX "In Progress"
```

## Toolchain & Runtime

- **OS:** Windows-first cross-platform (Node.js ESM `.mjs`, `os.homedir()`, directory junctions on Windows, symlinks on Unix). Windows is the primary dev and test platform (`SPEC.md` Section 5: install, `--help`, Gate 1, scenario runner, and schema shape on `windows-latest`); `ubuntu-latest` with pinned Chromium is the strict merge bar for pixel diffs.
- **Runtime:** Node.js 22+ (`"type": "module"`), npm workspaces (`tools/*`, `apps/*`).
- **Git (Non-Interactive):** Always set `$env:GIT_TERMINAL_PROMPT="0"` in automated sessions.

## Hard Boundaries

- **Never commit `.env`** or print `LINEAR_API_KEY` to stdout/logs.
- **Never commit directly to `main`**; use `feat/SIDE-XX-<slug>` branches.
- **1:1 Linear Key Parity:** Use exact Linear native keys (`SIDE-XX`) everywhere (`SPEC.md`, branch names, commits, PR `Closes SIDE-XX`). Any future rows not yet in Linear follow the `RS-XX` rule in `AGENTS.md`.
- **PR Body Key Hygiene:** `.github/workflows/linear-sync.yml` moves **every** `\bSIDE-\d+\b` token in a PR body. Name only the key(s) whose Linear stage should change; refer to other issues by milestone tag (e.g., `M2b.1–M2b.9`) and avoid `P-SIDE-6` in PR descriptions.
- **Deterministic Agent Looping:** Eval tools return structured JSON (`passed`, `artifacts`, `telemetry`) and enforce a **5-iteration hard cap** on autonomous repair loops.
