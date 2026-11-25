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

- **OS:** Windows-first cross-platform (Node.js ESM `.mjs`, `os.homedir()`, directory junctions on Windows, symlinks on Unix). Windows is the primary dev and test platform (`SPEC.md` section 5: install, `--help`, Gate 1, scenario runner, and schema shape on `windows-latest`). Pixel `mismatchPct` blocks only on `ubuntu-latest` with Playwright `1.65.1` Chromium. Windows and macOS report `mismatchPct` without blocking. The M2 intake gap guards that assert with `process.platform !== 'win32'`.
- **Runtime:** Node.js `>=20` (`package.json` `engines`; CI uses Node 22), `"type": "module"`, npm workspaces (`tools/*`, `apps/*`). Playwright is pinned to exact `1.65.1` in `tools/pixel-perfect-gate/package.json`.
- **Git (Non-Interactive):** Always set `$env:GIT_TERMINAL_PROMPT="0"` in automated sessions.

## Hard Boundaries

- **Never commit `.env`** or print `LINEAR_API_KEY` to stdout/logs.
- **Never commit directly to `main`**; use `feat/SIDE-XX-<slug>` branches.
- **1:1 Linear Key Parity:** Use exact Linear native keys (`SIDE-XX`) everywhere (`SPEC.md`, branch names, commits, PR `Closes SIDE-XX`). Any future rows not yet in Linear follow the `RS-XX` rule in `AGENTS.md`.
- **PR Body Key Hygiene:** `.github/workflows/linear-sync.yml` moves **every** `\bSIDE-\d+\b` token in a PR body. Name only the key(s) whose Linear stage should change; refer to other issues by milestone tag (e.g., `M2b.1–M2b.9`) and avoid `P-SIDE-6` in PR descriptions.
- **Report (`SPEC.md` section 6):** One JSON object on stdout except `--help` and `--version`. `schemaVersion` is `1`. `gates` has `gate1`, `gate2`, and `gate3`. `findings[].id` is the stable branch key. `error` is `null` when the run finished and `{ "message" }` when it could not. A skipped gate is `{ "passed": true, "skipped": true, "reason" }`.
- **TDD (`SPEC.md` section 13):** M1-AC-01 through M1-AC-15 and M3-AC-04 are green. M2-AC-01 through M2-AC-37 and M3-AC-01 through M3-AC-03 stay unchecked; their own tests under `tools/pixel-perfect-gate/tests/acceptance/pending/` must fail with `ERR_ASSERTION` only. `ENFORCED_MILESTONES` is `M1`, `M2`, and `M3`. Promote an M2 criterion to `tests/acceptance/m2/*.test.mjs`, or an M3 criterion to `tests/acceptance/m3/*.test.mjs`, when its own test goes green, check the section 8 box, and set manifest `suite` to `"pass"` in the same change. When a gap break-it starts passing before its criterion, move it unchanged to a green `*.test.mjs` and register `{ title, suite: "pass" }`, leaving the section 8 box unchecked. M2-AC-02, M2-AC-04, M2-AC-05, M2-AC-18, and M2-AC-21 are enforced that way in `tests/acceptance/m2/m2-shipped-break-its.test.mjs`. No M3 break-it is registered that way. A PR that edits an existing acceptance test or the acceptance gate needs `Acceptance-test change rationale:` in the body. The blank template line, the template hint, and `n/a` do not count.
- **Deterministic Agent Looping:** Eval tools return that JSON report and enforce a **5-iteration hard cap** on autonomous repair loops.
