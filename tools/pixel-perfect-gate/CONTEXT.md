# `tools/pixel-perfect-gate` — Operational Context

> Tool-specific context for `pixel-perfect-gate` (progressive disclosure).

## CLI Usage

```powershell
# High-fi pixelmatch mode (default)
node tools/pixel-perfect-gate/bin/pixel-gate.mjs --url http://localhost:3000 --ref ./ref.png --dpr 1 --max-diff 0.5

# Wireframe / structural mode (skips pixelmatch, runs Gate 1 + captures composite)
node tools/pixel-perfect-gate/bin/pixel-gate.mjs --url http://localhost:3000 --ref ./wireframe.png --mode wireframe
```

## Architecture

- **Single-Browser Pass:** `bin/pixel-gate.mjs` launches Chromium once, runs Gate 1 (`src/layout-audit.mjs`), captures screenshots, and runs Gate 2 (`src/visual-diff.mjs`).
- **Artifacts:** Writes `actual.png`, `diff.png`, `composite-diff.png` (`Reference | Actual | Diff`), and `telemetry.jsonl` under `--out` (default `.visual-eval/`).
- **Agent Looping:** Designed for autonomous 5-iteration repair loops until `"passed": true`.
