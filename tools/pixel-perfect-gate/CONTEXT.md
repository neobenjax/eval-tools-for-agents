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

`ENFORCED_MILESTONES` is `M1`, `M2`, `M2b`, and `M3` (`tests/acceptance/manifest.mjs`). A milestone is done only when every acceptance test in its suite passes on both `windows-latest` and `ubuntu-latest` (`SPEC.md` section 13).

- **M1 green:** M1-AC-01 through M1-AC-15 in `tests/acceptance/*.test.mjs` (`suite: "pass"`). No M1 criteria remain in `pending/`.
- **M2 green:** M2-AC-01 through M2-AC-37 in `tests/acceptance/m2/*.test.mjs` (`suite: "pass"`). No M2 criteria remain in `pending/`. The five early break-its in `tests/acceptance/m2/m2-shipped-break-its.test.mjs` continue to run alongside them.
- **M2b gap suite:** M2b-AC-01 through M2b-AC-59 (59 criteria) stay unchecked in `tests/acceptance/pending/m2b-*.pending.mjs` (helpers in `m2b-helpers.mjs`, skill checks in `m2b-skill-checks.mjs`). M2b-AC-19, M2b-AC-23, and three M2b-AC-59 checker directions already pass in `tests/acceptance/m2b/m2b-shipped-break-its.test.mjs`.
- **M3 gap suite:** M3-AC-01 through M3-AC-03 stay unchecked (`tests/acceptance/pending/m3-*.pending.mjs`, helpers in `tests/acceptance/m3-helpers.mjs`). They fail with `ERR_ASSERTION` until `apps/dashboard` matches the section 7 M3 interface list. Promote a passing criterion into `tests/acceptance/m3/*.test.mjs` and check its section 8 box in the same change. M3-AC-04 is green in `tests/acceptance/m3/m3-depends.test.mjs` (section 4 `Depends on:` list). No M3 break-it is registered `{ title, suite: "pass" }` under an unchecked criterion.
- **Promote** a pending file when its assertions pass: move it to `tests/acceptance/m2/*.test.mjs`, check the matching `SPEC.md` section 8 boxes, set manifest `suite` to `"pass"`, and list the file in `package.json` `scripts.test`, in the same change. Do not edit the assertions to go green.
- A PR that edits an existing file under `tests/`, or the acceptance gate, needs a body line `Acceptance-test change rationale:` followed by why. A blank template line, the template hint, and `n/a` do not count.

## Report, pixels, and the Playwright pin

- **Section 6.** Every exit except `--help` and `--version` prints one JSON object: `schemaVersion` `1`, `gates.gate1` / `gates.gate2` / `gates.gate3`, `findings[].id` as the stable branch key, `error` `null` on a finished run and `{ "message" }` when the run cannot finish, and a skipped gate `{ "passed": true, "skipped": true, "reason" }`.
- **Playwright** is pinned to exact `1.65.1` (no caret) in this package. CI and the installer install Chromium for that version.
- **Pixels (`SPEC.md` section 5).** `mismatchPct` blocks on `ubuntu-latest`. Windows and macOS report it without blocking. M2-AC-09 guards the blocking assert with `process.platform !== 'win32'`. Gate 1, exit codes, and the section 6 shape still have to pass on Windows.

## Architecture

- **Single-Browser Pass:** `bin/pixel-gate.mjs` launches Chromium once, runs Gate 1 (`src/layout-audit.mjs`), captures screenshots, and runs Gate 2 (`src/visual-diff.mjs`).
- **Artifacts:** Writes `actual.png`, `composite-diff.png` (3-panel `Reference | Actual | Diff` in pixel mode, or 2-panel `Reference | Actual` in wireframe mode), `diff.png` (pixel mode only), and `telemetry.jsonl` under `--out` (default `.visual-eval/`).
- **Agent Looping:** Designed for autonomous 5-iteration repair loops until `"passed": true`.
