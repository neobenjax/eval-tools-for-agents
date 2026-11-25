# `eval-tools-for-agents`

A cross-harness monorepo of deterministic evaluation tools, agent-looping skills, and telemetry dashboards for AI coding agents, harnesses (Antigravity Desktop, Antigravity CLI, Cursor), and AI models.

## Tools

- **`tools/pixel-perfect-gate`** *(Milestone 1 and Milestone 2 green; Milestone 2b gap suite)*: Hybrid Playwright CLI (`playwright` pinned to `1.65.1`) plus a cross-harness `SKILL.md`. Gate 1 (layout/runtime), Gate 2 (`pixelmatch` / wireframe), Gate 3 (static audit and scenario runner), spec intake, installer, and harness smoke checks are in the M1/M2 green suites.
- **`apps/dashboard`** *(Milestone 3)*: Eval Benchmarks & Linear Delivery Board viewer. Not built yet. The gap suite is M3-AC-01 through M3-AC-03 (primary: `.visual-eval/telemetry.jsonl` grouped by model, harness, and iteration; secondary: server-side Linear stages `Todo`, `In Progress`, `In Review`, `Approved`, `Rework`). `LINEAR_API_KEY` stays off the client bundle. M3-AC-04 is green: the section 4 `Depends on:` list for the viewer row.

## Current milestone status

`SPEC.md` is the source of truth. `ENFORCED_MILESTONES` is `M1`, `M2`, `M2b`, and `M3`.

- **M1 green:** M1-AC-01 through M1-AC-15 (engine plus the section 6 report). They live in `tools/pixel-perfect-gate/tests/acceptance/*.test.mjs` with manifest `suite: "pass"`.
- **M1 gaps:** none. The report criteria M1-AC-09 through M1-AC-15 were promoted when PR #16 landed. Do not treat them as pending work.
- **M2 green:** M2-AC-01 through M2-AC-37 (global CLI, per-project config, spec intake, Gate 3 static audit and scenario runner, optional vision pass, `SKILL.md`, installer, and harness smoke checks). They live in `tools/pixel-perfect-gate/tests/acceptance/m2/*.test.mjs` with manifest `suite: "pass"`.
- **M2 gaps:** none. Do not treat them as pending work.
- **M2b gap suite:** M2b-AC-01 through M2b-AC-59 (59 criteria) stay unchecked. Their own tests are `pending/m2b-*.pending.mjs` and fail with `ERR_ASSERTION` until the criterion is met. Promote a criterion into `tests/acceptance/m2b/*.test.mjs` only when its own test goes green. Five break-its already pass under still-unchecked criteria and live in `tests/acceptance/m2b/m2b-shipped-break-its.test.mjs` (M2b-AC-19, M2b-AC-23, and three M2b-AC-59 checker directions).
- **M3 gap suite:** M3-AC-01 through M3-AC-03 stay unchecked. Their tests are `tools/pixel-perfect-gate/tests/acceptance/pending/m3-*.pending.mjs` and fail with `ERR_ASSERTION` until the viewer meets them. Promote a criterion into `tests/acceptance/m3/*.test.mjs` only when its own test goes green, and check the section 8 box plus the manifest `suite` in that same change. M3-AC-04 is green in `tests/acceptance/m3/m3-depends.test.mjs`. No M3 break-it is registered `{ title, suite: "pass" }` under an unchecked criterion.

## Contract the next change must keep

- **Report (`SPEC.md` section 6).** Every exit prints one JSON object: `schemaVersion` `1`, `gates.gate1` / `gates.gate2` / `gates.gate3`, `findings[].id` as the stable branch key, `error` `null` when the run finished and `{ "message" }` when it could not, and a skipped gate `{ "passed": true, "skipped": true, "reason" }`. `--help` and `--version` are the only non-JSON exits.
- **TDD (`SPEC.md` section 13).** `node scripts/acceptance-status.mjs` is the manifest check. Gap failures must be `ERR_ASSERTION` only. `npm test` does not invoke a pending file directly. A PR that edits an existing file under `tools/pixel-perfect-gate/tests/`, or the acceptance gate, needs a body line `Acceptance-test change rationale:` followed by why. A blank template line, the template hint, and `n/a` do not count.
- **Pixels (`SPEC.md` section 5).** `ubuntu-latest` with Chromium from Playwright `1.65.1` is the blocking pixel bar. Windows and macOS report `mismatchPct` without blocking. `M2-AC-09` guards the blocking assert with `process.platform !== 'win32'`. The green M1 and M2 suites still run on `windows-latest`.
- A milestone is done only when every acceptance test in its suite passes on both `windows-latest` and `ubuntu-latest`.

## Development

Tests are written from `SPEC.md` section 8 before the product change. `node scripts/acceptance-status.mjs` lists criteria that are still gaps.

## Quick Links

- [Agent Operational Memory (`CONTEXT.md`)](./CONTEXT.md)
- [Governance & Gitflow (`AGENTS.md`)](./AGENTS.md)
- [Project Scope & Linear-Synced Spec (`SPEC.md`)](./SPEC.md)
