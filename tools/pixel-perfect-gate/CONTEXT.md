# `tools/pixel-perfect-gate` — Operational Context

> Tool-specific context for `pixel-perfect-gate` (progressive disclosure).

## CLI Usage

```powershell
# High-fi pixelmatch mode (default)
node tools/pixel-perfect-gate/bin/pixel-gate.mjs --url http://localhost:3000 --ref ./ref.png --dpr 1 --max-diff 0.5

# Wireframe / structural mode (compares landmark boxes <= 4px tolerance + captures composite)
node tools/pixel-perfect-gate/bin/pixel-gate.mjs --url http://localhost:3000 --ref ./wireframe.png --ref-landmarks ./wireframe.landmarks.json --mode wireframe
```

## Milestone acceptance

Green tests: `tests/acceptance/*.test.mjs`. Gap tests (expected to fail until the criterion is met): `tests/acceptance/pending/*.pending.mjs`. The map is `tests/acceptance/manifest.mjs`. A milestone is done only when every acceptance test in its suite passes on both `windows-latest` and `ubuntu-latest`. See repo `SPEC.md` section 13. Milestone 2 tests will live in `tests/acceptance/m2/` and are not written yet.

## Architecture

- **Single-Browser Pass:** `bin/pixel-gate.mjs` launches Chromium once, runs Gate 1 (`src/layout-audit.mjs`), captures screenshots, and runs Gate 2 (`src/visual-diff.mjs`).
- **Artifacts:** Writes `actual.png`, `composite-diff.png` (3-panel `Reference | Actual | Diff` in pixel mode, or 2-panel `Reference | Actual` in wireframe mode), `diff.png` (pixel mode only), and `telemetry.jsonl` under `--out` (default `.visual-eval/`).
- **Agent Looping:** Designed for autonomous 5-iteration repair loops until `"passed": true`.
