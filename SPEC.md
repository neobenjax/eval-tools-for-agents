# `SPEC.md` — Project Scope & Linear-Synced Task Matrix

**Project:** `eval-tools-for-agents` (`P-SIDE-6`)  
**Repository:** `git@github.com:neobenjax/eval-tools-for-agents.git`  
**Linear Team:** `Side Projects` (`SIDE`)  
**Leader & Assignee:** Benjamin Sanchez (`neobenjax`)  
**Spec revision:** Owner decisions resolved + Linear keys `SIDE-24`–`SIDE-27` assigned (follow-up to PR #5 & Issue #3).

`scripts/sync-linear.mjs --sync-spec` rewrites the `[ ]` / `[x]` on lines matching `^- \[ \] \*\*SIDE-<n>\*\*`. A key is `[x]` only when its Linear stage is `Approved`. All issues in Section 4 carry their native `SIDE-<n>` Linear key.

---

## 1. Objective & Grounding Premise

Build a reusable, cross-harness monorepo of deterministic evaluation tools for AI agents and harnesses, starting with **Pixel-Perfect Visual Gate** (`tools/pixel-perfect-gate`).

**Product goal.** A person installs the tool once on a machine. After that, the same `pixel-gate` command runs against any web project. The project supplies reference PNGs and a short acceptance list. The tool runs deterministic gates and prints one versioned JSON report. An agent may repair and re-run, with a hard cap of 5 iterations.

**What PR #2 built (merged to `main`).** PR #2 (`feat/SIDE-14-m1-pixel-gate-engine`, merged) delivered the M1 engine described by SIDE-14 through SIDE-18:

- npm workspace `tools/pixel-perfect-gate` with `playwright`, `pixelmatch`, `pngjs`, and `commander`. Package bin name is `pixel-gate`. Docs still invoke `node tools/pixel-perfect-gate/bin/pixel-gate.mjs` from this repo.
- One Chromium launch per run (`bin/pixel-gate.mjs`).
- Gate 1 (`src/layout-audit.mjs`): horizontal overflow, clipped text, sibling overlap (`data-allow-overlap` and negative-margin opt-out), broken images, `console.error` / `pageerror`, HTTP status `>= 400`, and failed requests.
- Gate 2 (`src/visual-diff.mjs`): `pixelmatch`, `--dpr`, `--mask`, `--full-page`, `--selector`, 3-panel `Reference | Actual | Diff` composite. `--mode wireframe` writes a 2-panel composite, skips `pixelmatch`, and returns `passed: true` with no structural metric.
- Telemetry (`src/telemetry.mjs`): append-only `.visual-eval/telemetry.jsonl` with `iteration`, `mismatchPct`, `durationMs`, `gate1Passed`, `gate2Passed`, `model`, and `harness`.
- Stdout today is one JSON object: `passed`, `iteration`, `durationMs`, `gate1`, `gate2`, `telemetry`. Exit `0` when both gates pass, exit `1` when they do not. A missing reference file prints `{ passed: false, error }` and exits `1`. Other crashes can still omit that object.
- Animations, transitions, and the caret are forced to zero duration before capture. The run waits on `document.fonts.ready`.
- Tests (12/12 passing in `tests/pixel-gate.test.mjs`) cover 1x match, broken-layout (overflow, 404, broken image, overlap opt-out), `@2x` match, odd-size `@2x` self-crop, `--selector` full-frame & element-sized cropping, `--mask`, clipped text, `console.error`, and wireframe mode. The 1x and `@2x` references are screenshots taken in the same test, not committed PNGs; `--full-page` height-mismatch and wireframe landmark tolerance remain open in Section 8 (`SIDE-16`). CI runs on both `ubuntu-latest` and `windows-latest`.

That engine is the core. It is not yet the product above. Nothing in PR #2 ingests a project's routes or acceptance list, runs a user flow, installs a global CLI for an arbitrary repo, or defines the Section 6 report an agent must read.

**Hybrid shape for v1.** Playwright is the deterministic browser core (`pixel-gate` CLI + scenario runner). The cross-harness `SKILL.md` tells the agent to run the global CLI, read the JSON report, stop at 5 iterations, and export a Playwright `.spec.ts` that replays the scenarios. Agents running in harnesses with `chrome-devtools-mcp` enabled (not limited to Antigravity) may detect its availability and use it opportunistically as a live DOM/CSS inspection aid; host `chrome-devtools-mcp` inspection cannot change `passed`, `findings`, or `exitCode`. An MCP wrapper around `pixel-gate` itself is later work, after the Section 6 CLI contract is stable.

**Windows-first** means the installer, path layout, `--help`, Gate 1, scenario runner, and schema shape work on Windows (directory junctions) and on Unix (symlinks), per the Section 5 OS policy. Pinned Chromium on `ubuntu-latest` CI is the strict pixel source of truth.

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
- A live Figma connection, plugin, or API. v1 references are exported PNG files.
- An MCP server in front of the `pixel-gate` CLI. Add one only after section 6 is implemented and covered by a fixture.
- A vision-model HTTP call inside the CLI. The caller may attach a verdict JSON. The CLI does not fetch one.
- A CI job whose pass/fail depends on a model looping until `passed: true`.
- The progression dashboard (SIDE-23) as a gate for this release. M3 follows one real project loop that used the report schema.
- `LINEAR_API_KEY` in any browser bundle or client-side dashboard code.

## 3. Standard DoR & DoD (All Issues)

- **DoR:** Upstream `SIDE-XX` dependencies in `blockedBy` are `Approved`. Scope for the issue is the matching acceptance list in section 8. Feature branch cut from `main`.
- **DoD:** `node scripts/verify.mjs` passes, PR (`Closes SIDE-XX`) squash-merged to `main`, feature branch purged, `SPEC.md` checkbox and Linear stage set to `Approved`.

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

Status words match Linear (`Approved`, `In Review`, `Todo`). PR #2 is merged to `main`, so `SIDE-14`, `SIDE-15`, `SIDE-17`, and `SIDE-18` are checked (`[x]`), while `SIDE-16` remains unchecked (`[ ]`, `In Review`) until its remaining Section 8 items land.

### Milestone 0: Repo Bootstrap & Linear Sync

- [x] **SIDE-10** `[M0.1]` Initialize `main` branch & GitHub remote *(Spine · Approved)*
- [x] **SIDE-11** `[M0.2]` Create `CONTEXT.md`, `AGENTS.md`, `SPEC.md` & npm workspaces *(Track A · Depends on: SIDE-10 · Approved)*
- [x] **SIDE-12** `[M0.3]` Create PR template & GitHub Actions CI workflow *(Track A · Depends on: SIDE-10 · Approved)*
- [x] **SIDE-13** `[M0.4]` Implement verification & 1:1 Linear sync CLI scripts *(Track B · Depends on: SIDE-11, SIDE-12 · Approved)*

### Milestone 1: Core Deterministic Engine (`pixel-gate`)

PR #2 (`feat/SIDE-14-m1-pixel-gate-engine`) is merged to `main`. `SIDE-14`, `SIDE-15`, `SIDE-17`, and `SIDE-18` are `Approved`. `SIDE-16` remains `In Review` until its remaining wireframe and committed-PNG acceptance criteria in section 8 land.

- [x] **SIDE-14** `[M1.1]` Scaffold `tools/pixel-perfect-gate` workspace package *(Spine · Depends on: SIDE-13 · Approved)*
- [x] **SIDE-15** `[M1.2]` Implement Gate 1 `layout-audit.mjs` (DOM, console, network) *(Track A · Depends on: SIDE-14 · Approved)*
- [ ] **SIDE-16** `[M1.3]` Implement Gate 2 `visual-diff.mjs` (`pixelmatch`, `@2x` DPR, composite, wireframe) *(Track A · Depends on: SIDE-14 · In Review · remaining items in section 8)*
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

### Milestone 3: Eval history viewer

- [ ] **SIDE-23** `[M3.1]` Eval Benchmarks & Linear Delivery Board viewer *(Integration · Depends on: SIDE-24, SIDE-19 · Todo · re-scoped · not a v1 blocker)*

---

## 5. Determinism Contract

Pixel pass/fail is a property of a pinned browser, pinned fonts, a frozen page, and a committed reference. It is not a property of the developer's OS font stack.

### Browser

- Pin `playwright` to an exact version in `tools/pixel-perfect-gate/package.json` (no caret). CI and the installer run `npx playwright install --with-deps chromium` for that same version.
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

`gate1` / `gate2` may keep the detail PR #2 already prints (counts, `mismatchPct`, `dimensions`) inside `gates`. The stable list for agents is `findings`.

### Findings

Each finding:

- `id` (string). Stable across runs of the same page. Format: `<gate>.<rule>.<selector-slug>` with a `.<n>` suffix in DOM order when the slug repeats. Rules are fixed tokens, not sentences. Examples: `gate1.clipped-text.p.title`, `gate1.console-error.1`, `gate2.region.3`, `gate3.scenario.open-modal`.
- `gate`: `gate1`, `gate2`, or `gate3`.
- `severity`: `fail` or `info`. Only `fail` can set `passed` to `false`.
- `selector`: CSS selector or `""` when the finding is not an element (dimension mismatch, config error).
- `box`: `{ "x", "y", "width", "height" }` in CSS pixels, integers, viewport-relative, or `null` when no box exists.
- `text`: one short sentence.

Gate 1 findings that name an element (overflow, clip, overlap, broken image, occluded control) include a `box`. Console and network findings use `selector: ""`, `box: null`, and put the message or URL in `text`.

### Gate 2 regions

`gates.gate2` includes:

- `mismatchPct` (number or `null` in wireframe mode)
- `regions`: clustered diff areas, reading order (top, then left). Each region has `id` (`gate2.region.<n>`), `box`, and `mismatchPct` for that box.
- Cluster gap: 8 CSS pixels. Adjacent diff pixels within that gap form one region.
- Cap the array at 20 regions. Also set `regionCount` to the full count so a cap does not hide a page-wide miss.

Wireframe findings use landmark ids (`gate2.landmark.main`) and the same `box` shape. They do not invent `mismatchPct`.

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

CLI flags override the matching config field for a single run. A flag-only invocation (`--url` plus `--ref`) still works so PR #2 tests keep a path that does not need a config file.

### Spec intake

- Reference files live at `<references>/<route-id>/<viewport-name>.png`.
- A route with `referenceRequired: true` and a missing file produces finding `gate2.missing-reference.<route-id>.<viewport-name>`, `passed: false`, exit `1`. The run does not invent a screenshot and save it as the reference.
- The acceptance file is markdown. Each scenario heading maps to one scenario id in the scenario file. A heading with no scenario is finding `gate3.unmapped-acceptance.<slug>`. A scenario with no heading is finding `gate3.unmapped-scenario.<id>`.
- Viewports, masks, and routes in config are the inputs to Gate 2 and Gate 3. The skill does not ask the agent to guess them.

### Scenario file

Each scenario is an ordered list of steps. A step has `action` (`goto`, `click`, `fill`, `toggle`, `wait`), `selector` when it targets an element, and the URL or value it needs. The runner stops on the first failed step.

---

## 8. Acceptance Criteria

Checkboxes here are issue-local. They are not the matrix in section 4. `sync-linear` ignores them because they do not use the `**SIDE-<n>**` line shape.

### SIDE-16 re-scope (M1, In Review — PR #2 merged)

PR #2 already compares pixels, honors `--dpr`, writes the 3-panel composite, covers `--mask`, clipped text, and `console.error`, and has a wireframe flag that always passes. Status of acceptance items:

- [ ] Wireframe mode fails when a landmark box (`header`, `nav`, `main`, `footer`, or a selector listed in config) moves more than `4` CSS pixels on `x` or `y`, or changes width or height by more than `4` CSS pixels.
- [ ] A color-only change (same boxes, different paint) stays passing in wireframe mode.
- [ ] At least one test compares against a PNG committed under `tools/pixel-perfect-gate/tests/fixtures/`, not a screenshot captured in that test.
- [x] A mask fixture shows a changing region under the mask stays inside `--max-diff`, and the same change outside the mask fails. *(Covered in PR #2)*
- [ ] A `--full-page` fixture uses a committed full-page reference and fails on a height mismatch.
- [x] A fixture covers clipped text. *(Covered in PR #2)*
- [x] A fixture covers a `console.error`. *(Covered in PR #2)*
- [ ] Reference dimensions not divisible by `--dpr` fail with a dimension finding and do not round the viewport.

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
- [ ] The installer does not add this package to the target application's dependencies.
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

---

## 9. Dependency Order

Linear `blockedBy` relations match Section 4:

1. PR #2 merged (`SIDE-14`, `SIDE-15`, `SIDE-17`, `SIDE-18` `Approved`). Finish `SIDE-16` section 8 items before `SIDE-16` is `Approved`.
2. **SIDE-24** report schema (`M1.6`). `SIDE-20` and `SIDE-23` both read it.
3. **SIDE-25** global install and per-project config (`M2.0a`).
4. **SIDE-26** spec intake (`M2.0b`) and **SIDE-19** (static audit and scenario runner), in the same stage. Includes the section 5 determinism pass: committed PNGs, pinned font, aborted non-fixture network, `ubuntu-latest` as the pixel bar, `windows-latest` CI satisfying the Section 5 Windows v1 requirement.
5. **SIDE-20** skill, then **SIDE-21** installer, then **SIDE-22** smoke checklist.
6. **SIDE-27** advisory vision pass and **SIDE-23** viewer, after one real project loop has used schema version `1`.

`SIDE-19`'s static checks do not wait on `SIDE-26`'s markdown mapper, but the issue stays one unit so the runner and the audit share the report schema. `SIDE-27` waits on that unit so vision text has finding ids to cite.

---

## 10. M1 Gap Log (do not re-implement what PR #2 already passes)

Tracked so later issues extend the engine instead of replacing it.

| Area | In PR #2 | Still open |
| --- | --- | --- |
| Single Chromium launch | Yes | — |
| Gate 1 overflow, overlap, broken images, HTTP `>= 400`, clipped text, console error | Yes, with tests | — |
| Gate 2 pixelmatch, `@2x`, composite, `--selector`, `--mask` | Yes, with tests | Committed PNG, full-page height-mismatch fixture (SIDE-16) |
| Wireframe | Flag only; always `passed: true` | Landmark tolerance (SIDE-16) |
| Telemetry JSONL | Yes | Add `schemaVersion` and finding ids (SIDE-24) |
| Stdout JSON | `{passed, gate1, gate2, telemetry}` + error JSON | Section 6 envelope (SIDE-24) |
| Animations off, `document.fonts.ready` | Yes | Pinned font file and committed reference (section 5, SIDE-26) |
| Network fail-closed | No | Section 5, exercised in SIDE-26 |
| Global CLI and project config | Bin field only; docs use a repo-local path | SIDE-25 |
| CI | `ubuntu-latest` + `windows-latest` (`npm ci`, `--help`, 12/12 tests) | Section 5 committed-PNG pixel bar on Ubuntu (SIDE-26) |

---

## 11. Owner Decisions (Resolved)

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
