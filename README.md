# `eval-tools-for-agents`

A cross-harness monorepo of deterministic evaluation tools, agent-looping skills, and telemetry dashboards for AI coding agents, harnesses (Antigravity Desktop, Antigravity CLI, Cursor), and AI models.

## Tools

- **`tools/pixel-perfect-gate`** *(Milestone 1 green, Milestone 2 gap suite)*: Hybrid Playwright CLI (`playwright` pinned to `1.65.1`) plus a cross-harness `SKILL.md`. Gate 1 (layout/runtime) and Gate 2 (`pixelmatch` / wireframe) are in the M1 green suite. Gate 3 (static audit and scenario runner) is specified and covered by the M2 gap suite; it is not implemented yet.
- **`apps/dashboard`** *(Milestone 3)*: Eval Benchmarks & Linear Delivery Board viewer. Not built yet. The gap suite is M3-AC-01 through M3-AC-03 (primary: `.visual-eval/telemetry.jsonl` grouped by model, harness, and iteration; secondary: server-side Linear stages `Todo`, `In Progress`, `In Review`, `Approved`, `Rework`). `LINEAR_API_KEY` stays off the client bundle. M3-AC-04 is green: the section 4 `Depends on:` list for the viewer row.

## Current milestone status

`SPEC.md` is the source of truth. `ENFORCED_MILESTONES` is `M1`, `M2`, and `M3`.

- **M1 green:** M1-AC-01 through M1-AC-15 (engine plus the section 6 report). They live in `tools/pixel-perfect-gate/tests/acceptance/*.test.mjs` with manifest `suite: "pass"`.
- **M1 gaps:** none. The report criteria M1-AC-09 through M1-AC-15 were promoted when PR #16 landed. Do not treat them as pending work.
- **M2 gap suite:** M2-AC-01 through M2-AC-37 stay unchecked. Their own tests are `*.pending.mjs` under `tools/pixel-perfect-gate/tests/acceptance/pending/` and fail with `ERR_ASSERTION` until the criterion is met. Promote a criterion into `tests/acceptance/m2/*.test.mjs` only when its own test goes green, and check the section 8 box plus the manifest `suite` in that same change. When a gap break-it starts passing before its criterion, move it unchanged to a green `*.test.mjs` and register `{ title, suite: "pass" }`, leaving the section 8 box unchecked. M2-AC-02, M2-AC-04, M2-AC-05, M2-AC-18, and M2-AC-21 are enforced that way in `tests/acceptance/m2/m2-shipped-break-its.test.mjs`.
- **M2b** is specified in `SPEC.md` section 12 and is not in `ENFORCED_MILESTONES`.
- **M3 gap suite:** M3-AC-01 through M3-AC-03 stay unchecked. Their tests are `tools/pixel-perfect-gate/tests/acceptance/pending/m3-*.pending.mjs` and fail with `ERR_ASSERTION` until the viewer meets them. Promote a criterion into `tests/acceptance/m3/*.test.mjs` only when its own test goes green, and check the section 8 box plus the manifest `suite` in that same change. M3-AC-04 is green in `tests/acceptance/m3/m3-depends.test.mjs`. No M3 break-it is registered `{ title, suite: "pass" }` under an unchecked criterion.

## Contract the next change must keep

- **Report (`SPEC.md` section 6).** Every exit prints one JSON object: `schemaVersion` `1`, `gates.gate1` / `gates.gate2` / `gates.gate3`, `findings[].id` as the stable branch key, `error` `null` when the run finished and `{ "message" }` when it could not, and a skipped gate `{ "passed": true, "skipped": true, "reason" }`. `--help` and `--version` are the only non-JSON exits.
- **TDD (`SPEC.md` section 13).** `node scripts/acceptance-status.mjs` is the manifest check. Gap failures must be `ERR_ASSERTION` only. `npm test` does not invoke a pending file directly. A PR that edits an existing file under `tools/pixel-perfect-gate/tests/`, or the acceptance gate, needs a body line `Acceptance-test change rationale:` followed by why. A blank template line, the template hint, and `n/a` do not count.
- **Pixels (`SPEC.md` section 5).** `ubuntu-latest` with Chromium from Playwright `1.65.1` is the blocking pixel bar. Windows and macOS report `mismatchPct` without blocking. The M2 intake gap (M2-AC-09) guards the blocking assert with `process.platform !== 'win32'`. The green M1 suite still runs on `windows-latest`.
- A milestone is done only when every acceptance test in its suite passes on both `windows-latest` and `ubuntu-latest`.

## Development

Tests are written from `SPEC.md` section 8 before the product change. `node scripts/acceptance-status.mjs` lists criteria that are still gaps.

## Quick Links

- [Agent Operational Memory (`CONTEXT.md`)](./CONTEXT.md)
- [Governance & Gitflow (`AGENTS.md`)](./AGENTS.md)
- [Project Scope & Linear-Synced Spec (`SPEC.md`)](./SPEC.md)
