---
name: pixel-perfect-gate
description: Deterministic visual, layout, and interaction evaluation gate for web UIs using the global pixel-gate CLI.
---

# Pixel-Perfect Visual Gate (`pixel-gate`)

Use the global `pixel-gate` CLI to evaluate a target web application against deterministic layout, visual, and interaction gates.

## 1. Run `pixel-gate`

Run `pixel-gate` from the target project root (where `pixel-gate.config.json` lives) and pass `--iteration` (`1` through `5`) and `--run-id`:

```bash
pixel-gate reference capture --config pixel-gate.config.json
pixel-gate --config pixel-gate.config.json --run-id home-desktop --iteration 1 --max-iterations 5
```

To re-capture a frozen `url` or `design-file` reference, or to run the Gate 3 static interaction audit or replay a configured user-flow scenario:

```bash
pixel-gate reference capture --config pixel-gate.config.json --refresh
pixel-gate reference capture --config pixel-gate.config.json --acknowledge-copyright
pixel-gate --url http://127.0.0.1:3000 --gate3-static
pixel-gate --config pixel-gate.config.json --scenario <scenario-id> --iteration 1
```

- **Pixel mode (default):** Use pixel mode when a committed PNG reference exists for the route and viewport.
- **Wireframe mode (`--mode wireframe`):** Use wireframe mode when the reference is a structural sketch rather than a final painted design:

```bash
pixel-gate --config pixel-gate.config.json --mode wireframe --iteration 1
```

## 2. Parse the Section 6 JSON Report & Audit Loop Contract

`pixel-gate` prints a single Section 6 JSON object on stdout. Parse `passed`, `findings`, `loop`, and `exitCode` (which matches the process exit code: `0` on pass, `1` on fail).

- Inspect each entry in `findings[]` (`id`, `gate`, `severity`, `selector`, `box`, `text`).
- Obey `loop.continue` and `loop.stopReason` (`passed`, `blocked`, `regression`, `no-progress`, `max-iterations`).
- On `regression`, return to the `loop.best.iteration` state before continuing or stopping.
- Repair the target application's layout, styling, or interaction defects and re-run `pixel-gate` with the next `--iteration` number.

## 3. Hard Iteration Cap & Split Loops

**Stop after 5 iterations even if `passed` is still false.** Never exceed `--iteration 5` or `--max-iterations 5`; if `passed` is still `false` after iteration 5, stop looping and report the remaining `findings` to the user.

- **Split large migrations:** Use separate loops with one `runId` per route or small route group instead of exceeding 5 iterations.
- **Draft scenarios:** `design-file` interactions generate `scenarios.draft.json`. You must never move `scenarios.draft.json` entries into the scenario file yourself—a human must review and promote them.

## 4. Advisory Tiers (tier B & tier C)

`design-file` (`tier B`) and `screenshot` (`tier C`) comparisons are **advisory**: keep looping toward the similarity target (`loop.advisory`), but **never report the route as failed** because of tier B or tier C advisory findings.

## 5. Copyright Disclaimer (`url` References)

Before any `url` capture, show the user the Section 12.8 copyright disclaimer and ask them to confirm. **Never** set `reference.acknowledgeCopyright` or pass `--acknowledge-copyright` on the user's behalf.

## 6. Replay Scenarios with Playwright

After the gates pass (or when exporting regression coverage), write a Playwright `.spec.ts` test file that replays the scenario file (`scenarios.json`) so the user flows remain covered in CI.

## 7. Optional MCP Capability Detection

Check whether **Figma**, **Penpot**, **Sketch**, **WordPress**, **Playwright**, or **Chrome DevTools** MCP servers are enabled in your host harness. Use them strictly for context and inspection—never to change passed, findings, or `exitCode`. Optional `chrome-devtools-mcp` inspection is an aid only and cannot change `passed`, `findings`, or `exitCode`.

## Playbook: html-file to wordpress

- **First command:** `pixel-gate reference capture --config pixel-gate.config.json` then `pixel-gate --config pixel-gate.config.json --run-id <route-id> --iteration 1`
- **Tier:** `tier A` (deterministic pixel + style + dual-run parity)
- **Optional MCP:** WordPress MCP Adapter (`WordPress/mcp-adapter`), Playwright MCP, Chrome DevTools MCP (context only; never to change `passed`).

## Playbook: html-file to pwa

- **First command:** `pixel-gate reference capture --config pixel-gate.config.json` then `pixel-gate --config pixel-gate.config.json --run-id <route-id> --iteration 1`
- **Tier:** `tier A` (with `target.kind: "dev-server"` and `target.pwa: true`)
- **Optional MCP:** Chrome DevTools MCP, Playwright MCP (context only; never to change `passed`).

## Playbook: screenshot

- **First command:** `pixel-gate reference capture --config pixel-gate.config.json` then `pixel-gate --config pixel-gate.config.json --run-id <route-id> --iteration 1`
- **Tier:** `tier C` (advisory similarity target, default 80%)
- **Optional MCP:** Chrome DevTools MCP (context only; never to change `passed`).

## Playbook: url

- **First command:** Show the user the copyright disclaimer first; once the user acknowledges it, run `pixel-gate reference capture --config pixel-gate.config.json --acknowledge-copyright` and then `pixel-gate --config pixel-gate.config.json --run-id <route-id> --iteration 1`
- **Tier:** `tier A` (frozen HAR-backed snapshot)
- **Optional MCP:** Playwright MCP, Chrome DevTools MCP (context only; never to change `passed`).

## Playbook: design-file

- **First command:** `pixel-gate reference capture --config pixel-gate.config.json` then `pixel-gate --config pixel-gate.config.json --run-id <route-id> --iteration 1`
- **Tier:** `tier B` (advisory similarity, layer landmarks, token parity, and `scenarios.draft.json`)
- **Optional MCP:** Figma MCP, Penpot MCP, Sketch MCP, Chrome DevTools MCP (context only; never to change `passed`).
