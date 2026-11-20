# `eval-tools-for-agents`

A cross-harness monorepo of deterministic evaluation tools, agent-looping skills, and telemetry dashboards for AI coding agents, harnesses (Antigravity Desktop, Antigravity CLI, Cursor), and AI models.

## Tools

- **`tools/pixel-perfect-gate`** *(Milestone 1–2)*: Hybrid Playwright CLI + cross-harness `SKILL.md` for deterministic layout/runtime auditing (Gate 1), `pixelmatch` / wireframe visual diffing (Gate 2), and interactive user-flow verification (Gate 3).
- **`apps/dashboard`** *(Milestone 3)*: Eval Benchmarks & Progression Dashboard—tracking model/harness benchmark runs (primary: pass rates, iterations, `mismatchPct`, composite diffs) with the server-side Linear Delivery Board (`Todo`, `In Progress`, `In Review`, `Approved`, `Rework`) as secondary.

## Development

A milestone is done only when every acceptance test in its suite passes on both `windows-latest` and `ubuntu-latest`. Tests are written from `SPEC.md` section 8 before the product change. `node scripts/acceptance-status.mjs` lists criteria that are still gaps. Milestone 2 tests will live in `tools/pixel-perfect-gate/tests/acceptance/m2/` and are not written yet.

## Quick Links

- [Agent Operational Memory (`CONTEXT.md`)](./CONTEXT.md)
- [Governance & Gitflow (`AGENTS.md`)](./AGENTS.md)
- [Project Scope & Linear-Synced Spec (`SPEC.md`)](./SPEC.md)
