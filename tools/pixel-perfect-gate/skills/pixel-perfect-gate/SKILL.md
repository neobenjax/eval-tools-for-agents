---
name: pixel-perfect-gate
description: Deterministic visual, layout, and interaction evaluation gate for web UIs using the global pixel-gate CLI.
---

# Pixel-Perfect Visual Gate (`pixel-gate`)

Use the global `pixel-gate` CLI to evaluate a target web application against deterministic layout, visual, and interaction gates.

## 1. Run `pixel-gate`

Run `pixel-gate` from the target project root (where `pixel-gate.config.json` lives) and pass `--iteration` (`1` through `5`):

```bash
pixel-gate --config pixel-gate.config.json --iteration 1
```

To run the Gate 3 static interaction audit or replay a configured user-flow scenario:

```bash
pixel-gate --url http://127.0.0.1:3000 --gate3-static
pixel-gate --config pixel-gate.config.json --scenario <scenario-id> --iteration 1
```

- **Pixel mode (default):** Use pixel mode when a committed PNG reference exists for the route and viewport.
- **Wireframe mode (`--mode wireframe`):** Use wireframe mode when the reference is a structural sketch rather than a final painted design:

```bash
pixel-gate --config pixel-gate.config.json --mode wireframe --iteration 1
```

## 2. Parse the Section 6 JSON Report

`pixel-gate` prints a single Section 6 JSON object on stdout. Parse `passed`, `findings`, and `exitCode` (which matches the process exit code: `0` on pass, `1` on fail).

- Inspect each entry in `findings[]` (`id`, `gate`, `severity`, `selector`, `box`, `text`).
- Repair the target application's layout, styling, or interaction defects and re-run `pixel-gate` with the next `--iteration` number.

## 3. Hard Iteration Cap

**Stop after 5 iterations even if `passed` is still false.** Never exceed `--iteration 5`; if `passed` is still `false` after iteration 5, stop looping and report the remaining `findings` to the user.

## 4. Replay Scenarios with Playwright

After the gates pass (or when exporting regression coverage), write a Playwright `.spec.ts` test file that replays the scenario file (`scenarios.json`) so the user flows remain covered in CI.

## 5. Optional `chrome-devtools-mcp` Inspection

If `chrome-devtools-mcp` is available in your host harness, you may use it as an optional live DOM/CSS inspection aid. However, `chrome-devtools-mcp` is strictly an inspection aid and cannot change `passed`, `findings`, or `exitCode`.
