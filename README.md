# `eval-tools-for-agents`

A cross-harness monorepo of deterministic evaluation tools, agent-looping skills, and telemetry dashboards for AI coding agents, harnesses (Antigravity Desktop, Antigravity CLI, Cursor), and AI models.

## Tools

- **`tools/pixel-perfect-gate`** *(Milestone 1, Milestone 2, and Milestone 2b green)*: Hybrid Playwright CLI (`playwright` pinned to `1.65.1`) plus a cross-harness `SKILL.md`. Gate 1 (layout/runtime), Gate 2 (`pixelmatch` / wireframe / style parity), Gate 3 (static audit, scenario runner, dual-run parity), spec intake, reference bundles (`html-file`, `url`, `screenshot`, `design-file`), target adapters (`static`, `dev-server`, `wordpress`), audit loop contract, installer, and harness smoke checks are in the M1/M2/M2b green suites.
- **`apps/dashboard`** *(Milestone 3 green)*: Eval Benchmarks & Linear Delivery Board viewer (`apps/dashboard/bin/dashboard.mjs`). M3-AC-01 through M3-AC-04 are green (`tests/acceptance/m3/*.test.mjs`): primary `.visual-eval/telemetry.jsonl` grouped by model, harness, and iteration; secondary server-side Linear stages `Todo`, `In Progress`, `In Review`, `Approved`, `Rework`; `LINEAR_API_KEY` stays off the client bundle.

## Current milestone status

`SPEC.md` is the source of truth. `ENFORCED_MILESTONES` is `M1`, `M2`, `M2b`, and `M3`.

- **M1 green:** M1-AC-01 through M1-AC-15 (engine plus the section 6 report). They live in `tools/pixel-perfect-gate/tests/acceptance/*.test.mjs` with manifest `suite: "pass"`.
- **M1 gaps:** none. The report criteria M1-AC-09 through M1-AC-15 were promoted when PR #16 landed. Do not treat them as pending work.
- **M2 green:** M2-AC-01 through M2-AC-37 (global CLI, per-project config, spec intake, Gate 3 static audit and scenario runner, optional vision pass, `SKILL.md`, installer, and harness smoke checks). They live in `tools/pixel-perfect-gate/tests/acceptance/m2/*.test.mjs` with manifest `suite: "pass"`.
- **M2 gaps:** none. Do not treat them as pending work.
- **M2b green:** M2b-AC-01 through M2b-AC-59 (59 criteria) live in `tools/pixel-perfect-gate/tests/acceptance/m2b/*.test.mjs` with manifest `suite: "pass"`.
- **M2b gaps:** none.
- **M3 green:** M3-AC-01 through M3-AC-04 (`apps/dashboard`) live in `tools/pixel-perfect-gate/tests/acceptance/m3/*.test.mjs` with manifest `suite: "pass"`.
- **M3 gaps:** none.

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
