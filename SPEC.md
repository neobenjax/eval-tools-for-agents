# `SPEC.md` — Project Scope & Linear-Synced Task Matrix

**Project:** `eval-tools-for-agents` (`P-SIDE-6`)  
**Repository:** `git@github.com:neobenjax/eval-tools-for-agents.git`  
**Linear Team:** `Side Projects` (`SIDE`)  
**Leader & Assignee:** Benjamin Sanchez (`neobenjax`)  
**Spec revision:** Owner decisions resolved + Linear keys `SIDE-24`–`SIDE-36` assigned (`SIDE-16` `Approved`; Milestone 2b keys `SIDE-28`–`SIDE-36` synced to Linear). Test-driven milestone acceptance (section 13).

`scripts/sync-linear.mjs --sync-spec` rewrites the `[ ]` / `[x]` on lines matching `^- \[ \] \*\*SIDE-<n>\*\*`. A key is `[x]` only when its Linear stage is `Approved`. All issues in Section 4 carry their native `SIDE-<n>` Linear key. `RS-<n>` in `AGENTS.md` / `CONTEXT.md` remains documented as the convention for any future proposed rows not yet in Linear.

---

## 1. Objective & Grounding Premise

Build a reusable, cross-harness monorepo of deterministic evaluation tools for AI agents and harnesses, starting with **Pixel-Perfect Visual Gate** (`tools/pixel-perfect-gate`).

**Product goal.** A person installs the tool once on a machine. After that, the same `pixel-gate` command runs against any web project. The project supplies reference PNGs and a short acceptance list. The tool runs deterministic gates and prints one versioned JSON report. An agent may repair and re-run, with a hard cap of 5 iterations.

**What PR #2 built (merged to `main`).** PR #2 (`feat/SIDE-14-m1-pixel-gate-engine`, merged) delivered the M1 engine described by SIDE-14 through SIDE-18:

- npm workspace `tools/pixel-perfect-gate` with `playwright`, `pixelmatch`, `pngjs`, and `commander`. Package bin name is `pixel-gate`. Docs still invoke `node tools/pixel-perfect-gate/bin/pixel-gate.mjs` from this repo.
- One Chromium launch per run (`bin/pixel-gate.mjs`).
- Gate 1 (`src/layout-audit.mjs`): horizontal overflow, clipped text, sibling overlap (`data-allow-overlap` and negative-margin opt-out), broken images, `console.error` / `pageerror`, HTTP status `>= 400`, and failed requests.
- Gate 2 (`src/visual-diff.mjs`): `pixelmatch`, `--dpr`, `--mask`, `--full-page`, `--selector`, 3-panel `Reference | Actual | Diff` composite. `--mode wireframe` writes a 2-panel composite, skips `pixelmatch`, and evaluates landmark bounding boxes (`header,nav,main,footer` or custom `--landmarks`) against an expected sidecar or `--ref-landmarks` with `<= 4` CSS px tolerance, failing on shifts > 4px or missing landmarks.
- Telemetry (`src/telemetry.mjs`): append-only `.visual-eval/telemetry.jsonl` with `iteration`, `mismatchPct`, `durationMs`, `gate1Passed`, `gate2Passed`, `model`, and `harness`.
- Stdout today is one JSON object: `passed`, `iteration`, `durationMs`, `gate1`, `gate2`, `telemetry`. Exit `0` when both gates pass, exit `1` when they do not. All runtime and engine failures in `bin/pixel-gate.mjs` are caught and print `{ passed: false, error, ... }` with telemetry; Commander option-parsing failures before the `try` block exit via Commander without JSON.
- Animations, transitions, and the caret are forced to zero duration before capture. The run waits on `document.fonts.ready`.
- Tests (15/15 passing in `tests/pixel-gate.test.mjs`) cover 1x match, broken-layout (overflow, 404, broken image, overlap opt-out), `@2x` match, odd-size `@2x` self-crop, `--selector` full-frame & element-sized cropping, `--mask`, clipped text, `console.error`, wireframe landmark tolerance and sidecar discovery, committed reference PNGs (`committed-card-1x.png`, `committed-fullpage-1x.png`, `wireframe-base-1x.png`), `--full-page` height mismatch hard failure, DPR divisibility validation, `--iteration` bounds, and fatal exit telemetry. CI runs on both `ubuntu-latest` and `windows-latest`.

That engine is the core. It is not yet the product above. Nothing in PR #2 ingests a project's routes or acceptance list, runs a user flow, installs a global CLI for an arbitrary repo, or defines the Section 6 report an agent must read.

Milestone acceptance is section 13. A milestone is done only when every acceptance test in its suite passes on both `windows-latest` and `ubuntu-latest`. Criteria the product does not meet yet stay in the gap suite. `node scripts/acceptance-status.mjs` reports them, CI stays green, and a gap test cannot be skipped.

**Hybrid shape for v1.** Playwright is the deterministic browser core (`pixel-gate` CLI + scenario runner). The cross-harness `SKILL.md` tells the agent to run the global CLI, read the JSON report, stop at 5 iterations, and export a Playwright `.spec.ts` that replays the scenarios. Agents running in harnesses with `chrome-devtools-mcp` enabled (not limited to Antigravity) may detect its availability and use it opportunistically as a live DOM/CSS inspection aid; host `chrome-devtools-mcp` inspection cannot change `passed`, `findings`, or `exitCode`. An MCP wrapper around `pixel-gate` itself is later work, after the Section 6 CLI contract is stable.

**Windows-first** means the installer, path layout, `--help`, Gate 1, scenario runner, and schema shape work on Windows (directory junctions) and on Unix (symlinks), per the Section 5 OS policy. Pinned Chromium on `ubuntu-latest` CI is the strict pixel source of truth.

**Reference-source scope (M2b, section 12).** The same loop must work when the reference is a single-file HTML prototype, a live URL, a screenshot, or a design file (Figma, Penpot, Sketch, XD export), and when the result is static HTML, a PWA on a dev server, or a WordPress page (Gutenberg or any other theme/build type). Section 12 freezes every reference kind into the PNG + sidecar bundle Gate 2 already reads, adds target adapters, functional parity, an audit loop contract, and per-kind pixel tiers. It does not change v1 below (owner decision 7: Milestone 2b ships after `SIDE-22`, except the loop contract right after `SIDE-20`).

## 2. v1 Scope

v1 is the first usable release: install once locally, point the CLI at a web project, get deterministic gate results, and let an agent loop on the report.

### In scope

- One install that puts `pixel-gate` on `PATH` and installs the Playwright Chromium build pinned by this package.
- Use on a repo that is not this monorepo. The target repo gains a config file, reference PNGs, and an acceptance list. It does not gain this package as a dependency.
- Gate 1 layout and runtime checks (already in PR #2).
- Gate 2 pixel comparison plus a wireframe mode that fails when landmark boxes move (SIDE-16 re-scope).
- Gate 3 as two parts: a static control audit and a scenario runner (SIDE-19 re-scope).
- Spec intake: one reference PNG per configured route and viewport, and a markdown acceptance list mapped to scenarios (SIDE-26).
- The agent report contract in section 6, on every exit.
- Agent looping with a hard cap of 5 iterations, instructed by the skill and visible in the report's `iteration` field.
- Artifacts written only under `.visual-eval/` in the target repo.
- An optional vision pass that is off unless the project config turns it on, and advisory (`blocking: false`) unless the project config says otherwise (SIDE-27).
- Optional capability-detected use of `chrome-devtools-mcp` by agents in v1 when enabled in the host harness (Playwright remains the deterministic core).

### Out of scope

- Cloud SaaS visual hosting (Percy, Chromatic, S3 sync).
- Claude Code-specific installation testing (not installed on the target workstation). Skill text may stay compatible with Claude Code's skill layout.
- Multi-reviewer GitHub PR triage bots or minimum-approval branch blockers.
- A live Figma connection, plugin, or API in v1. v1 references are exported PNG files. `SIDE-34` (section 12) adds an optional design-file adapter after v1; the deterministic gate still reads a frozen PNG bundle.
- An MCP server in front of the `pixel-gate` CLI. Add one only after section 6 is implemented and covered by a fixture.
- A vision-model HTTP call inside the CLI. The caller may attach a verdict JSON. The CLI does not fetch one.
- A CI job whose pass/fail depends on a model looping until `passed: true`.
- The progression dashboard (SIDE-23) as a gate for this release. M3 follows one real project loop that used the report schema.
- `LINEAR_API_KEY` in any browser bundle or client-side dashboard code.

## 3. Standard DoR & DoD (All Issues)

- **DoR:** Upstream `SIDE-XX` dependencies in `blockedBy` are `Approved`. Scope for the issue is the matching acceptance list in section 8. Feature branch cut from `main`.
- **DoD:** `node scripts/verify.mjs` passes, PR (`Closes SIDE-XX`) squash-merged to `main`, feature branch purged, `SPEC.md` checkbox and Linear stage set to `Approved`.
- **Milestone done:** every acceptance test in that milestone's suite passes on both `windows-latest` and `ubuntu-latest`. Gap tests do not count (section 13). Pixel `mismatchPct` stays under the section 5 rule: `ubuntu-latest` with pinned Chromium is the source of truth.

### Definition of Done for v1

v1 is done when all of the following are true on a clean machine. Each line is measurable.

1. After the documented install, `pixel-gate --help` exits `0` on `ubuntu-latest` and `windows-latest`, and Windows satisfies the Section 5 OS policy (`npm install`, `--help`, Gate 1, scenario runner, and schema shape) without the caller passing a path into this repo.
2. A sample web project that is not this monorepo runs `pixel-gate` using only its config, reference PNGs, and acceptance list. The tool does not add a dependency to that project's manifest. The only files it writes there are under `.visual-eval/`.
3. A configured route with no reference PNG exits `1`. Stdout is the section 6 object and includes a finding whose `id` is stable across two runs.
4. The committed-PNG fixture (section 5) passes on `ubuntu-latest` with the pinned Chromium. Twenty repeats in CI agree on pass/fail, and `mismatchPct` stays within `0.1` points of the median of those runs.
5. The scenario fixture opens a modal, flips a toggle, and submits a labeled form (exit `0`). A broken step exits `1` and the report includes that step's selector, action, and screenshot path.
6. Wireframe mode exits `1` when a landmark box moves by more than the tolerance in section 8 (SIDE-16), and exits `0` when only colors change.
7. `tools/pixel-perfect-gate/SKILL.md` tells the agent to stop at 5 iterations. A test fails if that cap is absent from the skill text.
8. Section 6 JSON is the only stdout for a pass, a gate failure, a missing reference, and a bad config. A fixture asserts `schemaVersion` and the required keys.
9. All three required v1 harnesses (**Antigravity Desktop, Antigravity CLI, and Cursor**) list the installed `pixel-perfect-gate` skill and pass the scripted Section 6 JSON smoke check (`SIDE-22`).

M3 (SIDE-23) and a blocking vision verdict are not required for this list.

---

## 4. Linear-Synced Milestone & Task Matrix (1:1 `SIDE-XX` Parity)

Status words match Linear (`Approved`, `In Review`, `Todo`). PR #2 (`SIDE-14`, `SIDE-15`, `SIDE-17`, `SIDE-18`) and PR #10 (`SIDE-16`) are merged to `main` and `Approved` in Linear, so all five are checked (`[x]`).

### Milestone 0: Repo Bootstrap & Linear Sync

- [x] **SIDE-10** `[M0.1]` Initialize `main` branch & GitHub remote *(Spine · Approved)*
- [x] **SIDE-11** `[M0.2]` Create `CONTEXT.md`, `AGENTS.md`, `SPEC.md` & npm workspaces *(Track A · Depends on: SIDE-10 · Approved)*
- [x] **SIDE-12** `[M0.3]` Create PR template & GitHub Actions CI workflow *(Track A · Depends on: SIDE-10 · Approved)*
- [x] **SIDE-13** `[M0.4]` Implement verification & 1:1 Linear sync CLI scripts *(Track B · Depends on: SIDE-11, SIDE-12 · Approved)*

### Milestone 1: Core Deterministic Engine (`pixel-gate`)

PR #2 (`feat/SIDE-14-m1-pixel-gate-engine`) and PR #10 (`feat/SIDE-16-wireframe-and-determinism`) are merged to `main`. `SIDE-14`, `SIDE-15`, `SIDE-16`, `SIDE-17`, and `SIDE-18` are `Approved`.

- [x] **SIDE-14** `[M1.1]` Scaffold `tools/pixel-perfect-gate` workspace package *(Spine · Depends on: SIDE-13 · Approved)*
- [x] **SIDE-15** `[M1.2]` Implement Gate 1 `layout-audit.mjs` (DOM, console, network) *(Track A · Depends on: SIDE-14 · Approved)*
- [x] **SIDE-16** `[M1.3]` Implement Gate 2 `visual-diff.mjs` (`pixelmatch`, `@2x` DPR, composite, wireframe) *(Track A · Depends on: SIDE-14 · Approved)*
- [x] **SIDE-17** `[M1.4]` Implement Eval Telemetry logger (`telemetry.mjs`) *(Track A · Depends on: SIDE-14 · Approved)*
- [x] **SIDE-18** `[M1.5]` Wire unified `pixel-gate` CLI & controlled fixture test suite *(Integration · Depends on: SIDE-15, SIDE-16, SIDE-17 · Approved)*

### Milestone 1 follow-on: Agent report

- [ ] **SIDE-24** `[M1.6]` Versioned agent report schema on every exit *(Depends on: SIDE-18 · Todo)*

### Milestone 2: Cross-Harness Skill, Spec Intake & Gate 3

- [ ] **SIDE-25** `[M2.0a]` Global `pixel-gate` install and per-project config *(Depends on: SIDE-24 · Todo)*
- [ ] **SIDE-26** `[M2.0b]` Spec intake: reference PNGs and markdown acceptance list *(Depends on: SIDE-25 · Todo)*
- [ ] **SIDE-19** `[M2.1]` Gate 3 static audit (`interaction-audit.mjs`) plus scenario runner *(Track A · Depends on: SIDE-18, SIDE-25 · Todo · re-scoped)*
- [ ] **SIDE-27** `[M2.1b]` Optional vision pass, off by default (advisory) *(Depends on: SIDE-24, SIDE-19 · Todo)*
- [ ] **SIDE-20** `[M2.2]` Author cross-harness `SKILL.md` (Agent Looping + optional `chrome-devtools-mcp`) *(Track A · Depends on: SIDE-24, SIDE-25, SIDE-19 · Todo · re-scoped)*
- [ ] **SIDE-21** `[M2.3]` Install skill links, global CLI, and Chromium (`tools/pixel-perfect-gate/scripts/install.mjs`) *(Track B · Depends on: SIDE-20, SIDE-25 · Todo · re-scoped)*
- [ ] **SIDE-22** `[M2.4]` Harness smoke check: Antigravity Desktop, Antigravity CLI, and Cursor *(Verification · Depends on: SIDE-19, SIDE-20, SIDE-21 · Todo · re-scoped)*

### Milestone 2b: Reference sources, target adapters & audit loop

Scope and rationale: section 12. Not part of the v1 Definition of Done (owner decision 7). Every row starts after `SIDE-22`, except `SIDE-30` (loop contract), which starts right after `SIDE-20`.

- [ ] **SIDE-28** `[M2b.1]` Reference bundle + `reference.kind` (`png`, `html-file`, `url`) and `pixel-gate reference capture` *(Depends on: SIDE-22, SIDE-24, SIDE-25, SIDE-26 · Todo)*
- [ ] **SIDE-29** `[M2b.2]` Dual-run functional parity (scenario on reference and target, per-step state diff) *(Depends on: SIDE-19, SIDE-28 · Todo)*
- [ ] **SIDE-30** `[M2b.3]` Audit loop contract (`runId`, `loop` object, stop reasons, best iteration) *(Depends on: SIDE-24, SIDE-20 · Todo)*
- [ ] **SIDE-31** `[M2b.4]` Target adapters `static` and `dev-server`, plus PWA checks *(Depends on: SIDE-22, SIDE-25 · Todo)*
- [ ] **SIDE-32** `[M2b.5]` Target adapter `wordpress` (Playground default; wp-env / existing configurable; any build type) with optional structure checks *(Depends on: SIDE-28, SIDE-31 · Todo)*
- [ ] **SIDE-33** `[M2b.6]` `screenshot` reference intake and advisory tiers B/C (default `mismatchPct <= 20`, i.e. >= 80% similar) *(Depends on: SIDE-28, SIDE-16 · Todo)*
- [ ] **SIDE-34** `[M2b.7]` `design-file` reference (Figma first; Penpot/Sketch/XD via export), tokens, layer landmarks, draft scenarios *(Depends on: SIDE-28, SIDE-33, SIDE-35 · Todo)*
- [ ] **SIDE-35** `[M2b.8]` Style/token parity check (`gate2.style.*`) *(Depends on: SIDE-28 · Todo)*
- [ ] **SIDE-36** `[M2b.9]` Skill playbooks per reference kind + MCP capability detection *(Depends on: SIDE-20, SIDE-29, SIDE-30, SIDE-32, SIDE-34 · Todo)*

### Milestone 3: Eval history viewer

- [ ] **SIDE-23** `[M3.1]` Eval Benchmarks & Linear Delivery Board viewer *(Integration · Depends on: SIDE-24, SIDE-19 · Todo · re-scoped · not a v1 blocker)*

---

## 5. Determinism Contract

Pixel pass/fail is a property of a pinned browser, pinned fonts, a frozen page, and a committed reference. It is not a property of the developer's OS font stack.

### Browser

- Pin `playwright` to exact version `1.65.1` in `tools/pixel-perfect-gate/package.json` (no caret, matching lockfile). CI and the installer run `npx playwright install --with-deps chromium` for that same version.
- Launch only that Chromium. Do not read the channel from the host Chrome install.

### Fonts

- Fixtures and the documented sample project use a font file committed in the tool (or in the fixture), applied with `@font-face`.
- The run waits until `document.fonts.ready` resolves, which PR #2 already does.
- `system-ui`, `sans-serif`, and any other family the OS substitutes are invalid in a pixel reference. A project that uses them must mask that text or accept Gate 2 failure.
- At least one Gate 2 test compares the page to a PNG committed in the repo. Generating the reference with the same Playwright call inside the test does not count.

### Motion

- Before capture, force `animation-duration`, `animation-delay`, `transition-duration`, and `transition-delay` to `0s` on all elements, and set `caret-color: transparent`. PR #2 already injects this CSS.
- Infinite animations and caret blink are not acceptable flake sources.

### Network

- Fail closed. Abort any request whose URL is outside an allowlist.
- The allowlist is the page's own origin plus origins named in the project config. Fixture tests allow only the fixture server.
- Gate 1 still records HTTP `>= 400` and failed requests on allowed URLs.
- A test must show that a request to an unrelated host is aborted and does not flip a pixel result by loading remote content.

### DPR, viewport, and odd sizes

- `deviceScaleFactor` is the integer `--dpr` (default `1`). `@2x` Figma exports use `--dpr 2`.
- Reference pixel width and height must both be divisible by `dpr`. If they are not, Gate 2 fails with a dimension finding. Do not `Math.round` the CSS viewport to hide the remainder. PR #2 rounds today; that behavior changes under this contract.
- CSS viewport width is `referenceWidth / dpr` and height is `referenceHeight / dpr`, exactly.
- `--full-page` compares against a full-page reference of the same pixel size. A height mismatch is a failure, not a silent crop. Full-page references are per route and viewport, not inferred from the first screen.
- Masked selectors are painted out on both sides before `pixelmatch`, using the same rectangles the capture used.

### OS policy

- **Windows-first (primary dev & test platform):** `npm install` (and global `pixel-gate` install), `pixel-gate --help`, Gate 1, the scenario runner, and Section 6 schema shape MUST pass on Windows (`windows-latest`); pixel `mismatchPct` differences on Windows/macOS are reported without blocking.
- **Pixel source of truth:** `ubuntu-latest` CI with the pinned Chromium is the strict pixel merge bar. A pixel mismatch there is blocking.
- Docs stay Windows-capable (directory junctions, PowerShell snippets). That requirement is independent of the pixel bar.

### Flake budget

- On `ubuntu-latest`, 20 repeats of the committed-PNG fixture agree on pass/fail.
- `mismatchPct` across those repeats stays within `0.1` percentage points of their median.
- A run outside that band is a bug in the harness (font, animation, network, or DPR), not a reason to raise `--max-diff`.

### Wireframe

- Pixel mode uses `pixelmatch` and `--max-diff` (default `0.5` percent), as in PR #2.
- Wireframe mode does not use `pixelmatch`. It compares landmark boxes. See SIDE-16 in section 8. Color-only changes pass. A shifted landmark fails.

---

## 6. Agent Report Contract

Every process exit prints exactly one JSON object on stdout, then exits. This includes gate failures, a missing reference, a bad config, and a browser launch error. Stderr may repeat a short message. Stderr is not a substitute for the object. No log lines share stdout with the JSON.

SIDE-20 and SIDE-23 read this object. They do not scrape free text.

### Envelope

Required keys on every exit:

| Key | Rule |
| --- | --- |
| `schemaVersion` | Integer `1` until a breaking change. Document the bump in this section. |
| `passed` | Boolean. `true` only when every enabled deterministic gate passed and no blocking vision verdict failed. |
| `exitCode` | `0` when `passed` is `true`. `1` otherwise. The process exit code equals `exitCode`. |
| `iteration` | Integer from `--iteration` or config, clamped to `1..5` in the skill. The CLI still records the number it was given. |
| `durationMs` | Non-negative integer. |
| `error` | `null` on a normal gate result. On a run that could not finish: `{ "message": "<short text>" }`. |
| `findings` | Array. Empty when there is nothing to report. Present even when `error` is set (`[]` if none). |
| `gates` | Object with `gate1`, `gate2`, and `gate3`. A gate that did not run is `{ "passed": true, "skipped": true, "reason": "<why>" }`. |
| `artifacts` | Paths the tool wrote, or `null` when it wrote nothing. Includes `composite` and `telemetry` when they exist. |
| `telemetry` | Path to `.visual-eval/telemetry.jsonl`, or `null` if the run failed before telemetry could be appended. |

Section 12.6 adds an optional `loop` object, optional finding keys (`refBox`, `expected`, `actual`), and `gates.gate2.advisory` (similarity against tier B/C references, never part of `passed`) for Milestone 2b (`SIDE-30`, `SIDE-33`). They are additive, so `schemaVersion` stays `1`.

`gate1` / `gate2` may keep the detail PR #2 already prints (counts, `mismatchPct`, `dimensions`) inside `gates`. The stable list for agents is `findings`.

### Findings

Each finding:

- `id` (string). Stable across runs of the same page. Format: `<gate>.<rule>.<selector-slug>` with a `.<n>` suffix in DOM order when the slug repeats. Rules are fixed tokens, not sentences. Examples: `gate1.clipped-text.p.title`, `gate1.console-error.1`, `gate2.region.3`, `gate3.scenario.open-modal.1`.
- `gate`: `gate1`, `gate2`, or `gate3`.
- `severity`: `fail` or `info`. Only `fail` can set `passed` to `false`.
- `selector`: CSS selector or `""` when the finding is not an element (dimension mismatch, config error).
- `box`: `{ "x", "y", "width", "height" }` in CSS pixels, integers, viewport-relative, or `null` when no box exists.
- `text`: one short sentence. v1 does not set a character cap.

Gate 1 findings that name an element (overflow, clip, overlap, broken image, occluded control) include a `box`. Console and network findings use `selector: ""`, `box: null`, and put the message or URL in `text`.

### Gate 2 regions

`gates.gate2` includes:

- `mismatchPct` (number or `null` in wireframe mode)
- `regions`: clustered diff areas, reading order (top, then left). Each region has `id` (`gate2.region.<n>`), `box`, and `mismatchPct` for that box.
- Cluster gap: 8 CSS pixels. Adjacent diff pixels within that gap form one region.
- Cap the array at 20 regions. Also set `regionCount` to the full count so a cap does not hide a page-wide miss.

Wireframe findings use landmark ids (`gate2.landmark.main`) and the same `box` shape. They do not invent `mismatchPct`.

### Telemetry line

Each line of `.visual-eval/telemetry.jsonl` is one JSON object. It keeps the PR #2 fields `iteration`, `mismatchPct`, `durationMs`, `gate1Passed`, `gate2Passed`, `model`, and `harness`. It also has `schemaVersion` (`1`) and `findingIds`: the `findings[].id` values for that run, in the same order. A run with no findings writes `[]`.

### Exit codes

| Code | When |
| --- | --- |
| `0` | `passed` is `true`. |
| `1` | A deterministic gate failed, a blocking vision verdict failed, or the run could not finish (`error` set). |

There is no third code in v1. Agents branch on `passed`, `findings[].id`, and `error`.

A fixture asserts the required keys for a pass, a Gate 1 failure, a Gate 2 mismatch, and a missing-file error.

---

## 7. Per-Project Config, Global Install, and Spec Intake

### Global install

- The published command is `pixel-gate`.
- One install per machine. It installs the CLI and the pinned Chromium. It does not run `npm install` inside the target app and does not add `@eval-tools/pixel-perfect-gate` to the target manifest.
- `pixel-gate --help` works on Windows and Ubuntu.
- The tool writes only under `.visual-eval/` in the working directory (or `--out`, which must stay inside that tree). Default `--out` remains `.visual-eval`.

### Config file

The target repo holds `pixel-gate.config.json` at its root (override with `--config`). Fields:

- `baseUrl` (string). Required.
- `viewports`: array of `{ "name", "width", "height" }`. Required. Names match reference filenames.
- `dpr` (integer). Default `1`.
- `maxDiff` (number, percent). Default `0.5`.
- `threshold` (number, pixelmatch). Default `0.1`.
- `masks`: array of CSS selectors applied to every route unless a route overrides them.
- `routes`: array of `{ "id", "path", "masks"?, "referenceRequired": true }`.
- `references` (directory path, repo-relative).
- `acceptance` (path to the markdown list).
- `scenarios` (path to the scenario file).
- `allowNetwork`: array of origin strings. Default is the origin of `baseUrl` only.
- `vision`: `{ "enabled": false, "blocking": false }`. Both default false.
- Milestone 2b (section 12): per-route `reference` (`kind`, `source`, `prepare`, `crop`, `region`, `selector`, `maxDiff`, `acknowledgeCopyright`), top-level `target` (`kind`, `command`, `readyUrl`, `readyTimeoutMs`, `selector`, `wordpress` with `runtime` / `buildType` / `structureCheck`, `pwa`), and `design.frames`. `reference.maxDiff` overrides `maxDiff` for that route; for advisory tier B/C references (`design-file`, `screenshot`) it defaults to `20` (>= 80% similar). All optional; omitting them keeps the behavior above.

CLI flags override the matching config field for a single run. A flag-only invocation (`--url` plus `--ref`) still works so PR #2 tests keep a path that does not need a config file.

### Spec intake

- Reference files live at `<references>/<route-id>/<viewport-name>.png`.
- A route with `referenceRequired: true` and a missing file produces finding `gate2.missing-reference.<route-id>.<viewport-name>`, `passed: false`, exit `1`. The run does not invent a screenshot and save it as the reference.
- The acceptance file is markdown. Each scenario heading maps to one scenario id in the scenario file. A heading with no scenario is finding `gate3.unmapped-acceptance.<slug>`. A scenario with no heading is finding `gate3.unmapped-scenario.<id>`.
- Viewports, masks, and routes in config are the inputs to Gate 2 and Gate 3. The skill does not ask the agent to guess them.

### Scenario file

Each scenario is an ordered list of steps. A step has `action` (`goto`, `click`, `fill`, `toggle`, `wait`), `selector` when it targets an element, and the URL or value it needs. The runner stops on the first failed step.

### Interfaces pinned by the M2 acceptance tests

These Section 7 pinned interfaces are formally adopted as the contract between the evaluation harness and the tool implementation. These are the exact shapes `M2-AC-01` to `M2-AC-37` assert. Change them only together with the tests.

- **Config run.** `pixel-gate` with no `--url` reads `pixel-gate.config.json` from the working directory (or `--config <file>`). It compares every `route x viewport` and adds `gates.gate2.checks[]` with `{ route, viewport, reference, passed, mismatchPct }`. A route with a reference at `<references>/<route-id>/<viewport-name>.png` is compared. Intake findings use `gate2.missing-reference.<route-id>.<viewport-name>`, `gate3.unmapped-acceptance.<slug>`, and `gate3.unmapped-scenario.<id>`. The slug is the lowercase heading text with runs of non `[a-z0-9]` turned into `-`. Only level 2 headings (`## `) are scenario headings, and a heading maps to a scenario when its text is exactly the scenario `id` or starts with `<id>:`.
- **Flags.** `--url`/`--ref` keep working without a config file, and a flag overrides the matching config field for one run. `--gate3-static` runs the static scan on `--url`. `--scenario <id>` replays that scenario from the config `scenarios` file and runs only Gate 3 (`gates.gate1` and `gates.gate2` are `skipped`). `--vision-verdict <file>` is read only when `vision.enabled` is true. `--out` must stay inside the working directory's `.visual-eval/` tree.
- **Gate 3 findings.** Static rules: `gate3.no-accessible-name.<slug>`, `gate3.dead-href.<slug>`, `gate3.covered-target.<slug>`, `gate3.no-label.<slug>`. Scenario failures: `gate3.scenario.<scenario-id>.<step-number>` (1-based, or `gate3.scenario.<scenario-id>`) with the step selector, action name, and screenshot path under `.visual-eval/` (which may be provided in dedicated properties `action` / `screenshot`, or in `text` / `artifacts.screenshot`). `gates.gate3.scenarios[]` lists `{ id, passed, steps: [{ action, passed }] }` for the steps that ran.
- **Static rule exclusions & hit-testing details.** `covered-target` uses center-point hit-testing via `document.elementFromPoint(centerX, centerY)`; overlays with `pointer-events: none` (`#pe-none`) or covering only edges do not flag the target. `no-label` scans `<input>`, `<select>`, and `<textarea>`; a `placeholder` attribute is not a label; hidden and submit inputs (`<input type="hidden">`, `<input type="submit">`) are out of scope; `<label for="...">`, wrapping `<label>`, `aria-label`, and `aria-labelledby` count as associated labels.
- **Scenario steps.** `goto { url }` (relative to `baseUrl`), `click { selector }`, `fill { selector, value }`, `toggle { selector }`, `wait { ms }` or `wait { selector, state }`. Any step may carry `timeoutMs`.
- **Vision.** When enabled, the caller reads `artifacts.composite` (path to composite PNG) and `findings` (top-level findings array). `report.vision` indicates vision configuration (`{ enabled: true, ... }`). The verdict becomes the finding `gate2.vision-verdict`, severity `info`, or `fail` only when `vision.blocking` is true and the verdict says `passed: false`. A malformed verdict that was asked for is a run error.
- **Skill.** `tools/pixel-perfect-gate/skills/pixel-perfect-gate/SKILL.md` (the directory name is the installed skill name).
- **Installer.** `tools/pixel-perfect-gate/scripts/install.mjs [--home <dir>] [--bin-dir <dir>] [--skip-chromium] [--dry-run]`. `--dry-run` prints `{ dryRun: true, actions: [{ type: 'link-skill', agent, source, target } | { type: 'install-bin', path } | { type: 'install-chromium', version }] }`. `playwright` is pinned to exact version `1.65.1` in `package.json`.
- **Harness smoke.** `tools/pixel-perfect-gate/scripts/harness-smoke.mjs --harness <antigravity-desktop|antigravity-cli|cursor|all> --home <dir> [--prompt-cmd <command>] [--recording <file>]` prints `{ ok, results: [{ harness, skillListed, skillPath, promptPassed, promptJson }], recording }`. The fixed prompt is `tools/pixel-perfect-gate/scripts/harness-smoke.prompt.txt`.
- **CI.** `.github/workflows/ci.yml` runs the installer and a bare `pixel-gate --help` step on `ubuntu-latest` and `windows-latest`.

---

## 8. Acceptance Criteria

Checkboxes here are issue-local. They are not the matrix in section 4. `sync-linear` ignores them because they do not use the `**SIDE-<n>**` line shape.

### SIDE-16 re-scope (M1, Approved — PR #10 merged)

PR #2 compared pixels, honored `--dpr`, wrote the composite, covered `--mask`, clipped text, and `console.error`. SIDE-16 delivers wireframe landmark comparison (<=4px tolerance, sidecar discovery), committed reference PNG fixtures, `--full-page` height mismatch enforcement, DPR divisibility validation, and determinism fixes. Status of acceptance items:

- [x] Wireframe mode fails when a landmark box (`header`, `nav`, `main`, `footer`, or a selector listed in config) moves more than `4` CSS pixels on `x` or `y`, or changes width or height by more than `4` CSS pixels.
- [x] A color-only change (same boxes, different paint) stays passing in wireframe mode.
- [x] At least one test compares against a PNG committed under `tools/pixel-perfect-gate/tests/fixtures/`, not a screenshot captured in that test.
- [x] A mask fixture shows a changing region under the mask stays inside `--max-diff`, and the same change outside the mask fails. *(Covered in PR #2)*
- [x] A `--full-page` fixture uses a committed full-page reference and fails on a height mismatch.
- [x] A fixture covers clipped text. *(Covered in PR #2)*
- [x] A fixture covers a `console.error`. *(Covered in PR #2)*
- [x] Reference dimensions not divisible by `--dpr` fail with a dimension finding and do not round the viewport.

### SIDE-24 report schema (`M1.6`)

- [ ] Stdout for a pass, a gate failure, a missing reference, and a thrown launch error all parse as the section 6 object with `schemaVersion` `1`.
- [ ] Each Gate 1 element finding includes `selector`, `box`, and short `text`.
- [ ] Gate 2 includes `mismatchPct` and clustered `regions` with boxes, capped at 20, plus `regionCount`.
- [ ] Finding `id` values for the broken-layout fixture are identical across two runs.
- [ ] Exit `0` on pass and exit `1` on fail, matching `exitCode`.
- [ ] A fixture asserts the required keys.
- [ ] `.visual-eval/telemetry.jsonl` gains `schemaVersion` and the finding ids for that run, and keeps the PR #2 fields (`iteration`, `mismatchPct`, `durationMs`, `gate1Passed`, `gate2Passed`, `model`, `harness`).

### SIDE-25 per-project config and global CLI (`M2.0a`)

- [ ] After one install, `pixel-gate` resolves on `PATH`.
- [ ] `pixel-gate --help` exits `0` on Windows and on Ubuntu.
- [ ] A config file in a second repo supplies base URL, viewports, reference directory, masks, routes, and scenarios.
- [ ] The tool writes only `.visual-eval/` in that repo and does not change its dependency manifest.
- [ ] `--url` and `--ref` still run Gate 1 and Gate 2 without a config file.

### SIDE-26 spec intake (`M2.0b`)

- [ ] Reference PNGs are keyed by route id and viewport name, as in section 7.
- [ ] A markdown acceptance list maps each scenario heading to a scenario id. An unmapped heading and an unmapped scenario each produce a finding and exit `1`.
- [ ] A configured route with no reference PNG fails with `gate2.missing-reference.<route-id>.<viewport-name>`.
- [ ] The determinism checks in section 5 that need a project fixture run here: pinned font on the committed PNG, non-fixture network aborted, `ubuntu-latest` as the pixel source of truth, and a `windows-latest` CI job satisfying the Section 5 Windows v1 requirement.

### SIDE-19 re-scope (M2)

Static audit and scenario runner ship together. Static checks use `src/interaction-audit.mjs` (ESM, same style as Gate 1), not a `.js` file.

Static:

- [ ] Flags a button or link-role control with no accessible name.
- [ ] Flags `href="#"` and `href=""`.
- [ ] Flags a click target whose center is covered by another element.
- [ ] Flags an input, select, or textarea with no associated label.
- [ ] Each static hit is a `findings` entry with `id`, `selector`, `box`, and `text`.

Static rule details & explicit exclusions: `covered-target` uses center-point hit-testing (`document.elementFromPoint`); overlays with `pointer-events: none` (`#pe-none`) or covering only edges are excluded. `no-label` scans `<input>`, `<select>`, `<textarea>`; placeholder is not a label; hidden and submit inputs are out of scope; `<label for="...">`, wrapping `<label>`, `aria-label`, and `aria-labelledby` count as associated labels.

Scenario runner:

- [ ] A fixture opens a modal, flips a toggle, and submits a labeled form, and exits `0`.
- [ ] A broken step returns `passed: false`, exit `1`, and a finding with the step selector, the action name, and a screenshot path under `.visual-eval/`.
- [ ] The runner performs the steps in the scenario file. It does not infer a flow from the static scan.

The static scan may also run inside the Gate 1 browser session as a cheap add-on. Its findings still use the `gate3.` id prefix so agents can tell the gates apart.

### SIDE-27 vision pass (`M2.1b`, off by default)

- [ ] With `vision.enabled` false or omitted, the CLI makes no vision call and does not read a verdict file. `passed` depends only on deterministic gates.
- [ ] With `vision.enabled` true, the report adds the composite PNG path and the `findings` array on a field the caller can read (`artifacts.composite` and `findings`). The CLI still does not open a network connection to a model.
- [ ] A caller may pass a verdict JSON (`--vision-verdict <file>`) with `{ "passed": boolean, "text": string }`. The text is copied into an `info` finding.
- [ ] That verdict does not change `passed` unless `vision.blocking` is true. The default is false.
- [ ] A test covers enabled+non-blocking (deterministic pass stays pass even if the verdict says fail) and blocking (verdict fail forces exit `1`).

### SIDE-20 re-scope (M2)

Depends on SIDE-24, SIDE-25, and the SIDE-19 scenario runner.

- [ ] `SKILL.md` tells the agent to run the global `pixel-gate` command, not a path into this repo.
- [ ] The skill tells the agent to parse the section 6 JSON and to stop after 5 iterations even if `passed` is still false.
- [ ] The skill tells the agent to write a Playwright `.spec.ts` that replays the scenario file.
- [ ] The skill states when to use pixel mode and when to use wireframe mode (pixel when a committed PNG exists; wireframe when the reference is a structural sketch).
- [ ] The skill states that optional host `chrome-devtools-mcp` inspection is an aid only and cannot change `passed`, `findings`, or `exitCode`.
- [ ] A test reads the skill file and fails if the 5-iteration cap is missing.
- [ ] No acceptance line of the form "passes skill structure validation" unless a checker exists in this repo and the test runs it. Do not add a prose-only validation claim.

### SIDE-21 re-scope (M2)

Depends on SIDE-20 and SIDE-25. One installer path: `tools/pixel-perfect-gate/scripts/install.mjs`. Do not also add `scripts/install.mjs` at the repo root.

- [ ] On Windows the installer creates a directory junction for the skill. On Unix it creates the skill link with `ln -sfn`.
- [ ] Skill destinations: Antigravity Desktop `~/.gemini/config/skills/`, Antigravity CLI `~/.gemini/antigravity-cli/skills/`, Cursor `~/.cursor/skills/`.
- [ ] The installer puts `pixel-gate` on `PATH` and installs the pinned Chromium.
- [ ] The installer does not add this package to the dependencies of the target application.
- [ ] Re-running the installer replaces the links and leaves a working `pixel-gate --help`.

### SIDE-22 re-scope (M2)

A live model loop is evidence, not a merge condition.

- [ ] All three required v1 harnesses (**Antigravity Desktop, Antigravity CLI, and Cursor**) list the installed `pixel-perfect-gate` skill (no skip path).
- [ ] A scripted prompt (fixed text, no requirement that a model invent a fix) returns stdout that parses as section 6 JSON in each of the three harnesses.
- [ ] A recording of a live loop-until-green session may be attached to the PR. CI does not fail when that recording is absent or when the model stops short of `passed: true`.

### SIDE-23 re-scope (M3)

Depends on SIDE-24 and SIDE-19. Not required for the v1 Definition of Done. Blocked until one real target project has produced `telemetry.jsonl` under schema version `1`.

- [ ] **Eval Benchmarks (primary):** Groups `.visual-eval/telemetry.jsonl` by `model`, `harness`, and `iteration`.
- [ ] **Linear Delivery Board (secondary):** Renders live Linear stages (`Todo`, `In Progress`, `In Review`, `Approved`, `Rework`) fetched server-side or via local CLI. When `LINEAR_API_KEY` is absent, the board route remains present and renders an empty state while Eval Benchmarks stay the primary view.
- [ ] `LINEAR_API_KEY` is read only on a server or in a local CLI. A check verifies it is absent from any client-side bundle.
- [ ] The viewer's dependency in Linear `blockedBy` is `SIDE-24` and `SIDE-19`.

### SIDE-28 reference bundle and capture (`M2b.1`)

- [ ] A route with no `reference` behaves exactly as today (`kind: "png"`); the existing test suite passes unchanged.
- [ ] `pixel-gate reference capture` on an `html-file` fixture (inline CSS + JS, committed font) writes PNG, `.landmarks.json`, `.styles.json`, and `manifest.json` under `.visual-eval/references/<route-id>/<viewport-name>/`, and nothing outside `.visual-eval/`.
- [ ] Capturing the same `html-file` twice on `ubuntu-latest` produces byte-identical PNGs (same `sha256` in both manifests).
- [ ] Gate 2 run against that bundle and against the same prototype served as the target exits `0` with `mismatchPct` `0`.
- [ ] Editing one PNG without updating `manifest.json` fails with `gate2.reference-tampered.<route>.<viewport>`.
- [ ] A `url` capture of a local fixture server applies `reference.prepare` (a fixture cookie banner is dismissed before capture), and records a `.har`.
- [ ] A `url` capture prints the section 12.8 copyright disclaimer and refuses to capture until the user acknowledges it (`reference.acknowledgeCopyright: true` in config, `--acknowledge-copyright`, or answering `yes` at the interactive prompt). Without it, it exits `1` with `gate2.reference-copy-unacknowledged.<route>` and a `blocked` stop reason. With it, `manifest.json` records `copyAcknowledgedAt`. There is no rights field and no origin allowlist.
- [ ] A loop run never re-reads a `url` source: stopping the fixture server after capture does not change the Gate 2 result. `--refresh` re-captures and writes a new `capturedAt`.

### SIDE-29 dual-run functional parity (`M2b.2`)

- [ ] The SIDE-19 scenario fixture runs against an `html-file` reference and a target that matches it, and exits `0` with no `gate3.parity*` findings.
- [ ] A target whose button renders but does nothing (handler removed) fails with `gate3.parity.<scenario-id>.<step>`, even though Gate 2 on the first screen passes.
- [ ] A target whose post-click state differs visually fails with `gate3.parity-state.<scenario-id>.<step>`, and the report lists both state screenshot paths.
- [ ] A step with a CSS selector that resolves only on the reference fails with `gate3.parity-unportable-locator.<scenario-id>.<step>`. The same step written with `getByRole` passes after a class rename on the target.
- [ ] A `screenshot` reference reports `gates.gate3.parity` as `{ "skipped": true, "reason": "reference has no behavior" }` and never `passed: true` on parity alone.
- [ ] Reference and target run in separate fresh contexts; a test proves that state set on the reference (e.g. `localStorage`) is not visible to the target.

### SIDE-30 audit loop contract (`M2b.3`)

- [ ] Every report carries `loop` with `runId`, `iteration`, `maxIterations` `5`, `best`, `delta`, `stopReason`, and `continue`, on pass, gate failure, and error exits.
- [ ] A fixture sequence of five telemetry rows asserts each stop reason: `passed`, `blocked` (missing reference), `regression` (new fail id and higher `failCount`), `no-progress` (same fail ids, `mismatchPct` change `< 0.1` on two consecutive iterations), and `max-iterations`.
- [ ] Two different `runId` values in the same `telemetry.jsonl` do not affect each other's `best` or `delta`, so a large migration split into separate loops (owner decision 8) tracks each loop independently.
- [ ] A config or flag that tries to raise `maxIterations` above `5` is rejected with a config error (`blocked`); the report still shows `maxIterations` `5`.
- [ ] `findings` keep the SIDE-24 shape; the optional `refBox`, `expected`, and `actual` keys appear only when set, and `schemaVersion` stays `1`.

### SIDE-31 static and dev-server targets, PWA checks (`M2b.4`)

- [ ] `target.kind: "dev-server"` starts `target.command`, waits for `target.readyUrl`, and kills the whole process tree on exit, on both `windows-latest` and `ubuntu-latest` (no orphaned process after the run, asserted by the test).
- [ ] A command that never becomes ready fails within `target.readyTimeoutMs` with a `blocked` stop reason and a structured `error`.
- [ ] Visual capture uses `serviceWorkers: "block"`; a fixture whose service worker serves a stale asset does not change the Gate 2 result.
- [ ] With `pwa` enabled, a fixture missing its manifest icon fails with `gate1.pwa-installability.<error-id>` taken from `Page.getInstallabilityErrors`, and the fixed fixture passes.
- [ ] `target.kind: "static"` serves a single HTML file and a directory without extra config.

### SIDE-32 WordPress target (`M2b.5`)

- [ ] With no `runtime` set, `playground` is used. On `windows-latest` and `ubuntu-latest` it starts WordPress from a committed blueprint without Docker and reaches REST `GET /wp-json/`.
- [ ] `runtime: "wp-env"` and `runtime: "existing"` (a local or remote site URL) are accepted. An unreachable site gives a `blocked` stop reason with a structured `error`, not a gate failure.
- [ ] `buildType` accepts `block-theme`, `classic-theme`, `hybrid-theme`, `patterns`, `custom-blocks`, `page-builder`, and `any` (default). The accuracy rule is the same for every build type: Gate 2 tier A on the browser output, plus SIDE-29 parity.
- [ ] A classic-theme fixture (PHP template, no blocks) and a block-theme fixture that both render the prototype pass with the default config. No structure finding appears, because `structureCheck` defaults to `off`.
- [ ] With `structureCheck: "advisory"`, a page whose whole content is one `core/html` block reports `gate1.wp-freeform-html.1` as `info`, and a block whose saved markup does not validate reports `gate1.wp-invalid-block.<n>` as `info`. Neither changes `passed`; a test asserts exit `0` when the browser output matches.
- [ ] A converted fixture page matches its `html-file` prototype within the tier A rule, comparing `target.selector` (default `main`, configurable) against `reference.selector`. Setting `target.selector` to `body` compares the whole page.
- [ ] The front-end capture contains no `#wpadminbar` (asserted on the DOM and the PNG height).
- [ ] SIDE-29 parity passes on the converted page only when the prototype's interaction is re-implemented in a way WordPress keeps (enqueued script, block `viewScript`, or page-builder widget); with the script dropped, parity fails.
- [ ] Credentials (application password) are read from the environment only and never appear in stdout, findings, or artifacts.

### SIDE-33 screenshot intake and tiers (`M2b.6`)

- [ ] A screenshot whose `width / dpr` does not equal a declared viewport width fails with `gate2.reference-scale-unknown.<route>` and is not resized.
- [ ] `reference.crop` removes a fixture browser bar; the cropped PNG is what `manifest.json` hashes.
- [ ] `reference.region: "viewport"` compares only the top `height / dpr` CSS px of a taller target; `"full"` keeps the section 5 exact-height failure.
- [ ] A JPEG input is accepted only for `kind: "screenshot"` and is marked tier C.
- [ ] Tier C comparison is advisory: a target with `mismatchPct` `35` against its screenshot exits `0` (when Gates 1/3 pass), reports `info` findings, and `gates.gate2.advisory` is `{ "similarityPct": 65, "thresholdPct": 80, "met": false }`.
- [ ] Default threshold: `reference.maxDiff` defaults to `20` for tier B/C (similarity `>= 80%`). Setting `reference.maxDiff: 5` on one route changes only that route's `thresholdPct` to `95`.
- [ ] With `advisory.met` false and no other stop rule firing, `loop.continue` is `true` and `stopReason` is `null`. With `passed` true and every advisory target met, `stopReason` is `passed`.
- [ ] Intake errors (`gate2.reference-scale-unknown.*`, unreadable image) still fail with `blocked`. They are setup problems, not comparison results.

### SIDE-34 design-file reference (`M2b.7`)

- [ ] `design.frames[]` maps a frame to route + viewport; a frame whose width differs from the viewport fails with `gate2.frame-viewport-mismatch.<nodeId>`.
- [ ] With a Figma token in the environment, capture exports each frame through REST `/v1/images` at `scale = dpr`. Without a token, a manually exported PNG with the same name produces the same bundle shape. CI uses only the committed manual export, with no network.
- [ ] Layer geometry produces a `.landmarks.json` for layers named after configured landmarks; wireframe mode then reports an `info` finding (advisory, tier B) for a target whose `header` moves `> 4` CSS px.
- [ ] Tokens (from the Variables REST API or a saved `get_variable_defs` output) produce `.tokens.json`, consumed by SIDE-35.
- [ ] Prototype `interactions` (`ON_CLICK` → `NODE`/`NAVIGATE`) produce `scenarios.draft.json`. Drafts are never executed as gating scenarios until a human moves them into the scenario file (owner decision 13).
- [ ] Tier B is advisory with the same default and override as SIDE-33 (`reference.maxDiff` default `20`): pixel, landmark, and token findings against a design file are `info` and never change `passed`.
- [ ] Figma access follows owner decision 9: manual export in CI; REST export only when `FIGMA_TOKEN` is set (never printed or written to artifacts); Figma/Penpot/Sketch MCP output is never read by the gate except a saved `get_variable_defs` file named in config.

### SIDE-35 style/token parity (`M2b.8`)

- [ ] For mapped elements, computed `color`, `background-color`, `font-family`, `font-size`, `font-weight`, `line-height`, `padding`, `margin`, `gap`, and `border-radius` are compared with the reference `.styles.json` or `.tokens.json`.
- [ ] A one-step color change (e.g. `#1a73e8` → `#1a74e8`) that stays under `maxDiff` in Gate 2 still fails with `gate2.style.<selector-slug>.color` and `expected` / `actual` set.
- [ ] An element missing on the target is one finding, not one per property.
- [ ] Style findings are `fail` against tier A references (`.styles.json` from `html-file` / `url`) and `info` against tier B tokens (`.tokens.json` from a design file).

### SIDE-36 skill playbooks (`M2b.9`)

- [ ] `SKILL.md` has one playbook per `reference.kind` (cases 1–5 in section 12.1): which command to run first, which tier applies, and which optional MCP servers help.
- [ ] The skill tells the agent to obey `loop.continue` and `loop.stopReason`, and to return to `loop.best.iteration` on `regression`.
- [ ] The skill tells the agent to check whether Figma, Penpot, Sketch, WordPress, Playwright, or Chrome DevTools MCP servers are enabled and to use them only for context, never to change `passed`.
- [ ] The skill tells the agent to show the user the copyright disclaimer before a `url` capture and never to set `reference.acknowledgeCopyright` or pass `--acknowledge-copyright` on the user's behalf.
- [ ] The skill tells the agent to split a large migration into separate loops (one `runId` per route or small route group) instead of exceeding 5 iterations, and never to move `scenarios.draft.json` entries into the scenario file itself (a human approves them).
- [ ] The skill tells the agent that tier B/C results are advisory: keep looping toward the similarity target, but never report the route as failed because of them.
- [ ] A test reads the skill file and fails if any of the five playbooks, the `loop.continue` rule, the copyright-acknowledgement rule, the advisory rule, the split-loops rule, or the draft-scenario rule is missing.

---

## 9. Dependency Order

Linear `blockedBy` relations match Section 4:

1. PR #2 and PR #10 merged (`SIDE-14`, `SIDE-15`, `SIDE-16`, `SIDE-17`, `SIDE-18` `Approved`).
2. **SIDE-24** report schema (`M1.6`). `SIDE-20` and `SIDE-23` both read it.
3. **SIDE-25** global install and per-project config (`M2.0a`).
4. **SIDE-26** spec intake (`M2.0b`) and **SIDE-19** (static audit and scenario runner), in the same stage. Includes the section 5 determinism pass: committed PNGs, pinned font, aborted non-fixture network, `ubuntu-latest` as the pixel bar, `windows-latest` CI satisfying the Section 5 Windows v1 requirement.
5. **SIDE-20** skill, then **SIDE-21** installer, then **SIDE-22** smoke checklist.
6. **SIDE-27** advisory vision pass and **SIDE-23** viewer, after one real project loop has used schema version `1`.
7. Milestone 2b (section 12; owner decision 7). Everything starts after **SIDE-22**, except the loop contract:
   - **SIDE-30** loop contract right after **SIDE-24** and **SIDE-20** (it changes what the skill obeys), before **SIDE-21** / **SIDE-22**.
   - **SIDE-28** reference bundle after **SIDE-22** (which already follows **SIDE-24**, **SIDE-25**, **SIDE-26**); **SIDE-31** static/dev-server targets after **SIDE-22** (parallel with SIDE-28).
   - **SIDE-29** parity after **SIDE-19** and **SIDE-28**; **SIDE-35** style parity after **SIDE-28**.
   - **SIDE-32** WordPress after **SIDE-28** and **SIDE-31**; **SIDE-33** screenshot tiers after **SIDE-28** and **SIDE-16**.
   - **SIDE-34** design files after **SIDE-28**, **SIDE-33**, and **SIDE-35**.
   - **SIDE-36** skill playbooks last, after **SIDE-20**, **SIDE-29**, **SIDE-30**, **SIDE-32**, and **SIDE-34** (one playbook per case needs every adapter).

   All Milestone 2b `SIDE-28`–`SIDE-36` issues and `blockedBy` relations are synced in Linear.

`SIDE-19`'s static checks do not wait on `SIDE-26`'s markdown mapper, but the issue stays one unit so the runner and the audit share the report schema. `SIDE-27` waits on that unit so vision text has finding ids to cite.

---

## 10. M1 Gap Log (do not re-implement what PR #2 already passes)

Tracked so later issues extend the engine instead of replacing it. The per-case gap analysis for reference sources and target adapters is section 12.1.

| Area | In PR #2 | Still open |
| --- | --- | --- |
| Single Chromium launch | Yes | — |
| Gate 1 overflow, overlap, broken images, HTTP `>= 400`, clipped text, console error | Yes, with tests | — |
| Gate 2 pixelmatch, `@2x`, composite, `--selector`, `--mask` | Yes, with tests. Committed PNGs and the 1px full-page height mismatch closed in SIDE-16 | — |
| Wireframe | Flag only in PR #2; landmark checks (<=4px tolerance, sidecar discovery, missing/shifted) closed in SIDE-16 | — |
| Telemetry JSONL | Yes | Add `schemaVersion` and finding ids (SIDE-24) |
| Stdout JSON | `{passed, gate1, gate2, telemetry}` + error JSON | Section 6 envelope (SIDE-24) |
| Animations off, `document.fonts.ready` | Yes | Pinned font file and committed reference (section 5, SIDE-26) |
| Network fail-closed | No | Section 5, exercised in SIDE-26 |
| Global CLI and project config | Bin field only; docs use a repo-local path | SIDE-25 |
| CI | `ubuntu-latest` + `windows-latest` (`npm ci`, `--help`, engine tests, section 13 acceptance suite, `acceptance-status`) | Section 5 committed-PNG pixel bar on Ubuntu (SIDE-26) |

---

## 11. Owner Decisions

### Resolved

All six planning questions from Issue #3 have been resolved by the owner (`@neobenjax`):

1. **Pixel bar when the developer OS cannot match a Figma export.**  
   **Resolved:** Windows-first for development and daily testing (`windows-latest` verifies install, `--help`, Gate 1, scenario runner, and schema shape); pinned Chromium on Linux CI (`ubuntu-latest`) is the strict pixel source of truth. A mismatch on Ubuntu blocks, while a font-only mismatch on Windows or macOS is reported without blocking.
2. **May a vision verdict fail a run?**  
   **Resolved:** Advisory by default (`vision.blocking: false`). The tool is designed for agents to loop and fix UI/UX issues; deterministic gates set `passed` unless a project config explicitly sets `vision.blocking: true`.
3. **Is Chrome DevTools MCP part of the first module?**  
   **Resolved:** Both Playwright and Chrome DevTools MCP are supported in v1—with **Playwright as the deterministic core** (`pixel-gate` CLI + scenario runner), and agents in any capable harness (not limited to Antigravity) checking if `chrome-devtools-mcp` is enabled and using it opportunistically for live DOM/CSS inspection. Host `chrome-devtools-mcp` inspection cannot change `passed`, `findings`, or `exitCode`.
4. **Which harnesses are required for the first usable release?**  
   **Resolved:** **Antigravity Desktop, Antigravity CLI, and Cursor** are required for v1. Claude Code symlink support stays compatible best-effort and will be tested post-MVP.
5. **What does M3 show?**  
   **Resolved:** **Both**—with primary focus on **Eval Benchmarks** (target project telemetry grouped by model, harness, and iteration) alongside the **Linear Delivery Board** (server-side only; `LINEAR_API_KEY` stays off the client).
6. **Are references exported PNGs only, or is a live Figma connection in scope?**  
   **Resolved:** **Exported PNGs only** in v1 to avoid tying the tool to Figma, while leaving room for optional developer integrations later.

### Reference-source scope (section 12)

Decisions 7–13 were resolved by the owner (`@neobenjax`) on PR #12.

7. **Is Milestone 2b part of v1?**  
   **Resolved:** No. The v1 Definition of Done stays as written. `SIDE-28`–`SIDE-36` ship after `SIDE-22`, except `SIDE-30` (loop contract), which lands right after `SIDE-20` because the skill's stop rules land there.
8. **Iteration cap for heavy migrations (e.g. a whole WordPress site).**  
   **Resolved:** Keep the 5-iteration hard cap per `runId` for every kind (AGENTS.md §6). A large migration is split into separate loops (one route, or a small group of routes, per `runId`) instead of raising the cap.
9. **Figma access method (`SIDE-34`).** Options: manual PNG export only; Figma REST API with a personal access token (frame export; variables need an Enterprise plan); remote Figma MCP server (OAuth, recommended by Figma); desktop Figma MCP server (needs a Dev/Full seat on a paid plan).  
   **Resolved:** Manual export is the CI path. The Figma REST API is the automated freeze path when a token exists. The Figma MCP server is agent context only. Penpot and Sketch MCP servers are treated the same way.
10. **Tier B/C tolerances (design files and screenshots).**  
    **Resolved:** Permissive and adjustable. The default is 80% similarity, i.e. `mismatchPct <= 20` (`reference.maxDiff` default `20`), and the user can change it per reference. Tier B/C results are **advisory only**: they report `info` findings and guide the loop toward the target, but never set `passed` to `false` or exit `1`.
11. **WordPress environment and compare region (`SIDE-32`).**  
    **Resolved:** `runtime: "playground"` by default (no Docker, fits Windows-first). The user can configure it to suit their WordPress development type: `wp-env`, or `existing` for a local or remote site. Every build approach is supported: classic, hybrid, and block themes, patterns, custom blocks, and page builders. What matters is the accuracy of the browser output, so the Gutenberg structure check is optional (`structureCheck`: `off` by default, `advisory` when enabled) and never a hard gate. The content-area comparison (`target.selector`, default `main`) stays the configurable default.
12. **Copying third-party sites (case 4).**  
    **Resolved:** A copyright disclaimer plus an explicit acknowledgement that the user understands what copying means. The acknowledgement is required before a `url` capture (section 12.8). There is no rights field and no origin allowlist. Captured bundles stay out of git by default.
13. **Prototype-link scenarios from design files (`SIDE-34`).**  
    **Resolved:** They stay drafts that a human approves by moving them into the scenario file. They are never executed as gating scenarios automatically, and an agent never promotes them itself.

---

## 12. Reference Sources, Target Adapters & the Audit Loop (M2b scope extension)

Added before M2 starts, so M2 work does not lock in a PNG-only design. Owner request: the agent must loop until the result matches the reference for five kinds of work. Rows `SIDE-28`–`SIDE-36` in section 4 carry this scope (Linear Milestone `M2b`).

**Design rule.** Every reference kind is *frozen* into the reference bundle that Gate 2 already understands: a PNG per route and viewport, plus sidecars. Gates 1–3 do not learn about Figma, WordPress, or live URLs. Only the intake side (reference sources) and the launch side (target adapters) change. One compare pipeline serves every case.

### 12.1 Gap analysis (state of `main` after PRs #2, #6, #8, #10, and the plan before this revision)

| # | Case | What `main` + the plan already cover | What is missing | Verdict before this revision |
| --- | --- | --- | --- | --- |
| 1 | Single-file HTML prototype → WordPress (Gutenberg or any build type) | Gate 1 runtime/layout, Gate 2 pixel + wireframe against a PNG, masks, DPR, `--full-page`. Planned: scenario runner (SIDE-19), config (SIDE-25), loop cap (SIDE-20). | No way to use the HTML file itself as the reference (someone must screenshot it by hand). No WordPress launcher (for any theme or build type), no admin-bar/theme chrome handling, no optional structure insight (e.g. noticing the prototype was pasted into one Custom HTML block). Scenarios run only on the result and are never compared with the prototype. | **Partially covered** (visual only, manual reference, no WP, no parity) |
| 2 | HTML prototype → PWA (e.g. React + Node) | Same as case 1. A dev server URL already works with `--url`. | No `html-file` reference, no dev-server start/ready contract, no PWA checks (manifest, service worker, installability), no service-worker cache isolation between iterations, no reference-vs-result functional parity. | **Partially covered** |
| 3 | Screenshot of a site → any output | A PNG reference is the native input. Wireframe mode exists. | No intake for an image of unknown viewport/DPR, browser chrome, or lossy JPEG. A full-page screenshot whose height differs from the target trips the `--full-page` exact-height rule, with no declared way to compare only the top region. No landmark sidecar without a DOM. No honest tolerance: the plan's single `maxDiff` 0.5% is not reachable against a foreign renderer. | **Partially covered** (works only if the screenshot happens to be a same-engine PNG at an exact viewport) |
| 4 | Live URL to copy (design + functionality) | Nothing beyond `--url` for the *result*. Network allowlist planned (section 5). | No URL reference capture/freeze, no drift handling (live pages change between iterations), no cookie-banner/ads/lazy-load normalization, no HAR capture of the reference's behavior, no parity scenarios, no copyright disclaimer or acknowledgement. | **Not covered** |
| 5 | Figma (or Penpot, Sketch, XD export) → prototype/PWA/site | `--dpr 2` for `@2x` exports. Owner decision 6: exported PNGs only in v1. | No frame-to-route/viewport map, no token/style comparison, no landmark sidecar from layer geometry, no prototype-link → scenario derivation, no tolerance tier for design-tool rasterization, no MCP/REST access path. | **Partially covered** (static PNG export only) |
| all | Loop until pixel-perfect | 5-iteration cap (AGENTS.md §6, SIDE-20), `iteration` in telemetry, findings schema planned (SIDE-24). | No run identity across iterations, no stop rule other than the cap (no no-progress or regression detection), no "best iteration" record, no definition of "pixel perfect" per reference kind. | **Partially covered** |

**Bottom line.** Before this revision the plan targeted one input: a human-made PNG plus a hand-written scenario, checked against one running URL. Cases 1–3 and 5 were reachable only by manual exporting and without functional parity. Case 4 was not covered. Sections 12.2–12.8 and rows `SIDE-28`–`SIDE-36` close those gaps.

### 12.2 Reference sources (`reference.kind`)

Each route in `pixel-gate.config.json` (section 7) gains an optional `reference` object. Omitted means `{ "kind": "png" }`, today's behavior.

| `kind` | Input | Freeze step (`pixel-gate reference capture`) | Bundle produced | Functionality source |
| --- | --- | --- | --- | --- |
| `png` | Committed PNG (today) | none | PNG (+ optional `.landmarks.json`) | Scenario file only |
| `html-file` | Path to a single-file HTML prototype (inline CSS + JS) | Serve the file from a local static server, render in the pinned Chromium per viewport, with the section 5 motion/font rules | PNG, `.landmarks.json` (from the DOM), `.styles.json` (computed styles of mapped elements), `manifest.json` | Same scenario file replayed on the reference (SIDE-29) |
| `url` | Live URL | Show the copyright disclaimer and require the acknowledgement (12.8). Visit once per viewport. Apply `reference.prepare` steps (dismiss cookie banner, scroll to trigger lazy load), then capture. Record a HAR (`recordHar`) | PNG, `.landmarks.json`, `.styles.json`, `.har`, `manifest.json` | Scenarios replayed against the HAR-backed snapshot (`routeFromHAR`), not the live site |
| `screenshot` | PNG/JPEG/WebP image | Convert to PNG, apply `reference.crop` (strip browser/OS chrome), check that `width / dpr` equals the declared viewport width | PNG, optional hand-authored `.landmarks.json`, `manifest.json` | **None.** An image has no behavior. The acceptance list may name behaviors, which are checked on the result only |
| `design-file` | Figma file key + node ids (or a Penpot/Sketch/XD export) | Export each mapped frame at `scale = dpr` (Figma REST `GET /v1/images/:key?ids=…&format=png&scale=…`, scale 0.01–4, or a manual export; owner decision 9: manual export in CI, REST when a token exists). Build landmarks from layer geometry and tokens from variables | PNG, `.landmarks.json`, `.tokens.json`, `manifest.json`, optional `scenarios.draft.json` | Optional: draft scenarios derived from prototype `interactions` (SIDE-34). A human confirms them before they count |

`manifest.json` records provenance: `kind`, source path/URL/file key + node id, `sha256` of the source and of each PNG, `capturedAt`, Chromium/Playwright version, viewport, `dpr`, and `tier` (12.6). Gate 2 refuses a bundle whose `manifest.json` disagrees with its PNG hash (`gate2.reference-tampered.<route>.<viewport>`).

**Where bundles live.** The tool writes only under `.visual-eval/` (section 7), so captured bundles go to `.visual-eval/references/<route-id>/<viewport-name>/`. An `html-file` bundle is rebuilt automatically when the source file's `sha256` changes. A project that wants a bundle reviewed in git copies its PNG and sidecars into its `references` directory, where the `png` kind reads them as today.

**Frozen, not live.** A `url` or `design-file` reference is never re-read during a loop. Re-capturing is an explicit command (`pixel-gate reference capture --refresh`). It writes a new `capturedAt` and resets the loop's best-iteration record. Otherwise the target would be moving while the agent iterates.

### 12.3 Target adapters (`target.kind`)

| `kind` | Launch | Ready check | Extra deterministic checks |
| --- | --- | --- | --- |
| `url` (default) | none (today's `baseUrl`) | HTTP 200 on `baseUrl` | — |
| `static` | Built-in static server over a directory or single file | HTTP 200 | — |
| `dev-server` (PWA, React, Vue, Next, etc.) | `target.command` (e.g. `npm run build && npm run preview`), spawned with Node `spawn(..., { shell: true })` (`cmd.exe` on Windows, `/bin/sh` elsewhere; `&&` works in both) and killed with its whole process tree on exit (`taskkill /T /F` on Windows) | `target.readyUrl` returns 200 within `target.readyTimeoutMs` | `pwa` block (optional): manifest parses (`Page.getAppManifest`), `Page.getInstallabilityErrors` returns none, a service worker controls the page. Lighthouse 12+ no longer has a PWA category, so the check uses the Chromium DevTools Protocol directly |
| `wordpress` | `target.wordpress.runtime`: `playground` (`@wp-playground/cli server --blueprint`, no Docker, Node ≥ 20.18), `wp-env` (Docker, or its experimental `--runtime=playground`), or `existing` (a local or remote site). Default `playground`; any `buildType` | Front-end URL returns 200 (REST `GET /wp-json/` when `structureCheck` is on) | Optional structure insight (below) |

**Visual capture isolation.** Visual and parity captures use a fresh browser context with `serviceWorkers: "block"`, so a cached service worker from iteration N cannot serve stale assets in iteration N+1. The PWA check runs in a separate context with service workers allowed.

**WordPress accuracy and optional structure checks (case 1).** The pass rule for every WordPress build is the accuracy of the browser output: Gate 2 (tier A) on the rendered front end plus SIDE-29 parity. How the page is built does not change that rule. `target.wordpress.buildType` names the approach (`block-theme`, `classic-theme`, `hybrid-theme`, `patterns`, `custom-blocks`, `page-builder`, or `any`, the default) and only tunes the optional checks below and the default region examples.

1. Captures the front end **logged out**, so there is no admin bar. When a logged-in capture is configured, `#wpadminbar` is hidden and the `html` top margin is reset.
2. Compares the region named by `target.selector` (default `main`, configurable, e.g. `.wp-site-blocks` for a block theme, `#content` for a classic theme, or `body` for the whole page) against `reference.selector` (e.g. `body` of the prototype), so theme header/footer the prototype lacks do not count. A blank page template is the alternative (owner decision 11).
3. `structureCheck` (`off` by default for every `buildType`, or `advisory`). When `advisory`, and only for block-based content (`block-theme`, `hybrid-theme`, `patterns`, `custom-blocks`), the adapter reads `content.raw` via REST (`GET /wp-json/wp/v2/pages/<id>?context=edit`, application-password auth), parses it with `@wordpress/block-serialization-default-parser`, and reports `info` findings: `gate1.wp-freeform-html.<n>` for `core/html` or freeform blocks beyond `wordpress.maxRawHtmlBlocks` (default `0`), and `gate1.wp-invalid-block.<n>` for blocks whose parsed `isValid` is false in the editor. Custom blocks count as normal blocks. Page-builder and classic content is not parsed. These findings never change `passed`.

Prototype `<script>` inside post content is stripped for users without `unfiltered_html`. JavaScript must move to an enqueued theme/plugin script, a block `viewScript`, or the page builder's own script mechanism. SIDE-29 parity scenarios are what catch a migration that looks right but lost its behavior.

### 12.4 Normalization (both sides, before any diff)

| Concern | Rule |
| --- | --- |
| Viewport / DPR | Same named viewports and integer `dpr` on reference and target (section 5). For `screenshot`, `width / dpr` must equal a declared viewport width; otherwise `gate2.reference-scale-unknown.<route>`. No silent resize. |
| Responsive breakpoints | One reference per route × viewport (section 7). A design file maps one frame per breakpoint; a missing breakpoint is `gate2.missing-reference.*`, not an inferred one. |
| Fonts | Reference and target load the same font files. For `url`, the capture allowlist includes the site's font origins; the copy must self-host fonts it is licensed to use. Design-tool rasterization differs from Chromium → tier B (12.6). |
| Animations / video / carousels | Section 5 motion CSS on both sides, plus `prefers-reduced-motion: reduce`. Autoplay media and carousels are masked or paused via `reference.prepare`. |
| Dynamic content | `masks` apply to both sides with the same rectangles (section 5). `url` adds `locale`, `timezoneId`, and a frozen `Date` via init script. |
| Cookie banners, chat widgets, ads | `reference.prepare` steps (click "accept" or hide a selector) before capture; leftovers are masked. Never mask by default. |
| Lazy loading / full page | `url` and `html-file` scroll to the bottom and back before a full-page capture. |
| WordPress chrome | Logged-out capture; region comparison via `target.selector` (12.3). |
| Screenshot height | `reference.region: "viewport"` compares the top `height / dpr` CSS px of the target. `"full"` keeps the section 5 exact-height rule. It must be declared; no default crop. |
| Lossy images | JPEG/WebP inputs are allowed only for `screenshot` and are always tier C. |
| Figma frame → viewport | `design.frames[]` maps `nodeId → { route, viewport }`; frame width must equal viewport width (CSS px) or the frame is rejected (`gate2.frame-viewport-mismatch.<nodeId>`). |

### 12.5 Functionality parity (not only pixels)

- **Where it applies.** `html-file` and `url` references have real behavior, so parity is required there. A `design-file` has prototype links; parity is optional and comes from derived draft scenarios. A `screenshot` has no behavior, so functional parity is **out of scope** and the report says so (`gates.gate3.parity: { skipped: true, reason: "reference has no behavior" }`).
- **Dual run.** SIDE-29 runs the same SIDE-19 scenario file against the reference and against the target, in separate fresh contexts. After each step it captures a state screenshot on both sides and compares them with Gate 2 rules (same masks, tier). Outcome mismatches give `gate3.parity.<scenario-id>.<step>`, for example: a step succeeds on the reference but its selector is missing on the target, or the URL/route or a network call differs. State mismatches give `gate3.parity-state.<scenario-id>.<step>`.
- **Portable locators.** A migration changes class names and DOM shape. Parity scenarios therefore use role/name/label/text locators (`getByRole('button', { name: 'Subscribe' })`) or `data-testid`, not CSS classes. A step with a raw CSS selector is allowed but fails parity when it does not resolve on both sides (`gate3.parity-unportable-locator.<scenario-id>.<step>`).
- **Authoring.** A human or the agent may record a flow with Playwright codegen or by driving the reference through Playwright MCP / Chrome DevTools MCP. Only the saved scenario file counts. An MCP session never sets `passed` (owner decision 3).
- **Network behavior.** For `url`, form posts and XHRs observed in the reference HAR become optional expectations (method + path pattern), so a copy that renders a form but never submits it fails parity.
- **Figma prototype links.** SIDE-34 reads node `interactions` (trigger such as `ON_CLICK`, action `NODE` with `navigation` `NAVIGATE`/`OVERLAY` to a `destinationId`) and writes `scenarios.draft.json`: "click the element mapped to layer X, expect the state to match the export of frame Y". Mapping layers to DOM elements needs a convention (`data-figma-node` or a matching accessible name). Transitions such as Smart Animate are not compared (motion is disabled). Drafts do not count until a human moves them into the scenario file (owner decision 13); an agent never promotes them.

### 12.6 Audit loop contract and what "pixel perfect" means

**Loop.** One repair session has a `runId` (`--run-id` or generated and printed on iteration 1). The CLI reads earlier rows with the same `runId` from `.visual-eval/telemetry.jsonl` and adds an additive `loop` object to the section 6 report:

| Key | Rule |
| --- | --- |
| `runId` | String. |
| `iteration` / `maxIterations` | `maxIterations` is `5` (AGENTS.md §6 hard cap; owner decision 8). It is not configurable. A large migration is split into separate loops, each with its own `runId`. |
| `best` | `{ iteration, mismatchPct, failCount }` of the best iteration so far (fewest `fail` findings, then lowest `mismatchPct`). |
| `delta` | `{ mismatchPct, newFailIds, resolvedFailIds }` against the previous iteration. |
| `stopReason` | `null` while the agent should keep going; otherwise `passed`, `max-iterations`, `no-progress`, `regression`, or `blocked`. |
| `continue` | Boolean. The skill (SIDE-20) obeys it. |
| `advisory` | `{ met, similarityPct, thresholdPct }` summed over tier B/C comparisons, or `null` when the run has none. Never affects `passed`. |

Stop rules, in order:

1. `passed`: `passed` is `true` **and** every advisory target is met (`loop.advisory` is `null` or `met: true`). When `passed` is `true` but an advisory target is not met, the loop keeps going until a later rule stops it.
2. `blocked`: `error` is set or a config/environment finding exists (missing reference, WordPress not reachable, frame/viewport mismatch, unknown screenshot scale, missing copyright acknowledgement). Code edits cannot fix these, so a human is needed.
3. `regression`: `newFailIds` is not empty and `failCount` is higher than `best.failCount`. The skill tells the agent to return to the `best.iteration` state before stopping or continuing.
4. `no-progress`: two consecutive iterations with an unchanged set of `fail` ids and a `mismatchPct` change smaller than `0.1` points (the section 5 flake band). For an advisory-only route, the same rule uses the advisory `info` ids and `similarityPct`.
5. `max-iterations`: `iteration` reached `5`.

Findings stay the SIDE-24 shape. They add two optional keys: `refBox` (the matching box in reference coordinates, when it differs from `box`) and, for style findings, `expected` / `actual` strings. New id families: `gate2.style.<selector-slug>.<property>`, `gate2.reference-scale-unknown.*`, `gate2.reference-tampered.*`, `gate2.frame-viewport-mismatch.*`, `gate3.parity.*`, `gate3.parity-state.*`, `gate3.parity-unportable-locator.*`, `gate1.wp-freeform-html.*`, `gate1.wp-invalid-block.*`, `gate1.pwa-installability.<error-id>`, `gate2.reference-copy-unacknowledged.*`. `gate1.wp-*` and every tier B/C comparison finding are always `info`. All are additive, so `schemaVersion` stays `1`.

**Pixel-perfect tiers.** "Pixel perfect" is a tier property, set in the bundle `manifest.json` by `reference.kind`. Similarity is `100 - mismatchPct`, so "80% similar" means `mismatchPct <= 20`:

| Tier | Kinds | Why | Rule |
| --- | --- | --- | --- |
| **A — same renderer** | `png` captured by `pixel-gate`, `html-file`, `url` (frozen) | Both sides render in the same pinned Chromium with the same fonts | `mismatchPct <= maxDiff` (default `0.5`, as today). `maxDiff: 0` is allowed and is the literal "pixel perfect": zero unmasked differing pixels. No landmark, style, or parity `fail` findings (WordPress structure findings are always `info`). |
| **B — design renderer** | `design-file` | Figma/Penpot/Sketch rasterize text and anti-aliasing differently from Chromium, so 0% is not reachable for text-heavy frames | Landmarks within `4` CSS px (SIDE-16 rule), style/token checks exact (color, font family/size/weight, line height, spacing, radius), and `mismatchPct <= reference.maxDiff` (default `20`, i.e. >= 80% similar). **Advisory:** every finding is `info` and feeds `loop.advisory`; none changes `passed`. |
| **C — foreign image** | `screenshot` | Unknown renderer, fonts, and scale; possibly lossy | Hand-authored landmarks within `4` CSS px when a sidecar exists, plus `mismatchPct <= reference.maxDiff` (default `20`, i.e. >= 80% similar). **Advisory**, like tier B. An advisory vision verdict (SIDE-27) is recommended. Tier C can never prove functionality. |

Owner decision 10: the tier B/C default is permissive (`reference.maxDiff: 20`) and the user can change it per reference in config. Tier B/C results never block on any OS. Tier A keeps the section 5 rule: blocking on `ubuntu-latest`, reported without blocking on Windows/macOS.

### 12.7 MCP and tool integration matrix

"Deterministic gate" means the CLI uses it to set `passed`. Everything else helps the building agent and cannot change `passed`, `findings`, or `exitCode` (owner decision 3).

| Tool / MCP | Role | Cases | Required? | Deterministic gate? |
| --- | --- | --- | --- | --- |
| Playwright + pinned Chromium | Capture, scenarios, dual-run parity, `recordHar` / `routeFromHAR`, CDP session | all | Required (already core) | Yes |
| `pixelmatch` + `pngjs` | Pixel diff | all | Required (already core) | Yes |
| Chrome DevTools Protocol `Page.getInstallabilityErrors` / `Page.getAppManifest` | PWA installability | 2 (PWA targets) | Required for `pwa` checks | Yes |
| WordPress Playground CLI (`@wp-playground/cli`) or `@wordpress/env` | Local WordPress for the target | 1 | Playground by default; `wp-env` or `existing` by config | Yes (launch) |
| WordPress REST API (application passwords) / WP-CLI | Read `content.raw`, page ids | 1 | Only when `structureCheck: "advisory"` | No (`info` findings) |
| `@wordpress/block-serialization-default-parser` | Parse block markup | 1 | Only when `structureCheck: "advisory"` | No (`info` findings) |
| Figma REST API (PAT or OAuth, `file_content:read`) | Frame PNG export (`/v1/images`), node geometry, prototype `interactions` | 5 | Optional: used when a token exists; manual export is the CI path (decision 9) | Advisory only (tier B), via the frozen bundle |
| Figma Variables REST API | Tokens | 5 | Optional. **Enterprise plan only** | Advisory only (tier B), via `.tokens.json` |
| Figma MCP server (remote `https://mcp.figma.com/mcp`, recommended; desktop `http://127.0.0.1:3845/mcp` needs a Dev/Full seat on a paid plan) | Agent context: `get_design_context`, `get_metadata`, `get_variable_defs`, `get_screenshot` | 5 | Optional | No. A saved `get_variable_defs` output may seed `.tokens.json` after the freeze step |
| Penpot MCP server (official; hosted or `npx @penpot/mcp`) / Sketch built-in MCP server (macOS, local) | Agent context for non-Figma design files | 5 | Optional | No. PNG export is the gate input |
| Adobe XD | Exported PNGs only | 5 | — | Via the PNG bundle |
| WordPress MCP Adapter (`WordPress/mcp-adapter`, WP 6.9+ Abilities API; replaces the deprecated `Automattic/wordpress-mcp`) | The building agent's write path into WordPress | 1 | Optional | No |
| Playwright MCP / Chrome DevTools MCP | Explore the reference, author scenarios, inspect live CSS | 1, 2, 4 | Optional | No |
| `@axe-core/playwright` | A11y parity: the target must not add violations the reference lacks | 1, 2, 4 | Optional (Gate 3 static checks in SIDE-19 stay the required a11y floor) | Only if the project enables it |
| Lighthouse / Lighthouse CI | Performance, a11y, best practices | 2 | Optional, advisory | No |
| `odiff` | Faster alternative diff with anti-alias handling and ignore regions | all | Not planned. Revisit only if `pixelmatch` is too slow on full-page captures | — |
| Vision / LLM judge | Second opinion on a composite | all (most useful for 3, 5) | Optional (SIDE-27) | Only when `vision.blocking: true` |

### 12.8 Copying third-party sites (case 4)

Owner decision 12: a copyright disclaimer plus an explicit acknowledgement, not a rights field or an origin allowlist.

Before every `url` capture, the CLI prints this disclaimer to stderr (stdout stays the section 6 JSON):

> Copying a website's design, text, images, or code can infringe copyright, trademark, or the site's terms of service. A visual or functional copy does not give you any rights to the original. Only publish a copy you own, have a license for, or have permission to make. This tool does not check rights for you.

The capture proceeds only when the user has acknowledged it: `reference.acknowledgeCopyright: true` in the config, the `--acknowledge-copyright` flag, or `yes` at the interactive prompt (TTY only). Without it, the capture exits `1` with `gate2.reference-copy-unacknowledged.<route>` and a `blocked` stop reason. The acknowledgement time is stored in `manifest.json` (`copyAcknowledgedAt`). The skill (SIDE-36) tells agents to show the disclaimer to the user and never to acknowledge it on the user's behalf. The tool also keeps captured bundles under the git-ignored `.visual-eval/references/` unless the project copies them out (12.2), and never downloads assets for reuse in the result.

---

## 13. Test-Driven Milestone Acceptance

Milestone work is driven by tests written from section 8. The product change follows the test. A milestone is done only when every acceptance test in its suite passes on both `windows-latest` and `ubuntu-latest`. Pixel `mismatchPct` stays under the section 5 rule (`ubuntu-latest` with pinned Chromium is the source of truth). Gate 1, exit codes, and the section 6 schema must pass on both operating systems.

### What is enforced

`ENFORCED_MILESTONES` in `tools/pixel-perfect-gate/tests/acceptance/manifest.mjs` is currently `M1` and `M2`. The family comes from the section 4 tag: `[M1.6]` is `M1`, `[M2.0a]` is `M2`, `[M2b.1]` is `M2b`. Section 8 checkboxes under an enforced family are the criteria. Checked boxes (`- [x]`) are the green suite. Unchecked boxes (`- [ ]`) are the gap suite. `- [X]` is not a checkbox.

Milestone 2 tests are written as a gap suite (`M2-AC-01` to `M2-AC-37`, all `*.pending.mjs` under `tools/pixel-perfect-gate/tests/acceptance/pending/`, helpers in `tools/pixel-perfect-gate/tests/acceptance/m2-helpers.mjs`). When an M2 issue is implemented, promote its tests into `tools/pixel-perfect-gate/tests/acceptance/m2/` as `*.test.mjs`, check the section 8 boxes, and flip the manifest `suite` to `pass` in the same change. Do not add `M2b` to `ENFORCED_MILESTONES` until each of that family's section 8 criteria has a test. Milestone 2b is not part of the M1 or M2 suites.

### Traceability

Each criterion has a stable id (`M1-AC-01`, then the next free number). Do not renumber ids. The manifest `text` is the section 8 checkbox text verbatim. The test name is `<id>: <text>` as a string literal passed to `test(...)` or `serialTest(...)`. `node scripts/acceptance-status.mjs` fails if the manifest, the checkbox, and the test name disagree.

Green tests are `*.test.mjs` under `tools/pixel-perfect-gate/tests/acceptance/` and are listed by path in `tools/pixel-perfect-gate/package.json` `scripts.test`. Gap tests are `*.pending.mjs`. `npm test` must not invoke a gap file directly.

### Gaps stay visible

A gap test is a real assertion of the criterion. It is expected to fail with `ERR_ASSERTION` until the product meets it. `node scripts/acceptance-status.mjs` runs the gap files. It exits 0 while every gap test fails that way, and exits 1 if a gap test is missing, skipped, todo, crashes, or starts passing. A gap test that starts passing is promoted into a green `*.test.mjs` file in the same change that checks its section 8 box. `node scripts/verify.mjs` runs this command (via the package test script) on `ubuntu-latest` and `windows-latest`, so `main` stays green and the remaining criteria cannot be skipped.

`node scripts/acceptance-status.mjs --static-only` checks names and wiring without executing gap tests. The green suite itself runs inside `npm test` before that command.

### Do not weaken a test

The default fix is to change the product so the existing assertion passes. A PR that modifies or deletes an existing file under `tools/pixel-perfect-gate/tests/`, or that edits `scripts/acceptance-lib.mjs`, `scripts/acceptance-status.mjs`, `scripts/acceptance-status.test.mjs`, `scripts/verify.mjs`, `tools/pixel-perfect-gate/package.json`, or `.github/workflows/ci.yml`, must include a PR-body line `Acceptance-test change rationale:` followed by why the assertion or the gate changed. The explanation is the author's own sentence. A blank line, the pull request template's hint, a copy of that template, and `n/a` do not count. Adding a new test file does not require that line. `node scripts/verify-pr-ready.mjs` enforces it when `PR_BODY` is set (CI sets it from the pull request body). The template leaves the rationale line blank and keeps the hint in the HTML comment.

Break-it tests are extra named tests listed on the criterion's `breakIt` array (NaN and null landmark coordinates, an empty sidecar, a missing sidecar, a landmark that is not on the page, the 4px boundary). Deleting one fails the gate. A new check in `scripts/acceptance-lib.mjs` has a mutation in `scripts/acceptance-status.test.mjs` that must fail: a missing criterion, an extra criterion, a flipped suite, a capital-X checkbox, a skipped test, a gap test that passes, and a test file `npm test` does not run.
