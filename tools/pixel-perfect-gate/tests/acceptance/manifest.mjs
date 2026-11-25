/**
 * Traceability map for enforced milestone acceptance criteria.
 * `text` must match the section 8 checkbox verbatim.
 * `suite: "pass"` is a green test (section 8 box checked).
 * `suite: "gap"` is an expected-fail test (section 8 box unchecked).
 * Ids are stable. Do not renumber them when a criterion is added.
 */
export const ENFORCED_MILESTONES = ['M1', 'M2', 'M2b', 'M3'];

const SIDE16 = 'M1';
const SIDE24 = 'M1';

export const criteria = [
  {
    id: 'M1-AC-01',
    milestone: SIDE16,
    suite: 'pass',
    text: 'Wireframe mode fails when a landmark box (`header`, `nav`, `main`, `footer`, or a selector listed in config) moves more than `4` CSS pixels on `x` or `y`, or changes width or height by more than `4` CSS pixels.',
    breakIt: [
      'M1-AC-01 break-it: shift of exactly 4 CSS px stays within tolerance',
      'M1-AC-01 break-it: a sidecar whose only delta is width 5 CSS px fails',
      'M1-AC-01 break-it: a sidecar whose only delta is height 5 CSS px fails',
      'M1-AC-01 break-it: width or height of 5 CSS px fails and 4 CSS px stays within tolerance',
      'M1-AC-01 break-it: null coordinate in the landmarks sidecar fails closed',
      'M1-AC-01 break-it: NaN or null landmark coordinate fails closed',
      'M1-AC-01 break-it: empty landmarks sidecar fails closed',
      'M1-AC-01 break-it: missing landmarks sidecar fails closed',
      'M1-AC-01 break-it: landmark missing from the page fails closed',
    ],
  },
  {
    id: 'M1-AC-02',
    milestone: SIDE16,
    suite: 'pass',
    text: 'A color-only change (same boxes, different paint) stays passing in wireframe mode.',
    breakIt: [],
  },
  {
    id: 'M1-AC-03',
    milestone: SIDE16,
    suite: 'pass',
    text: 'At least one test compares against a PNG committed under `tools/pixel-perfect-gate/tests/fixtures/`, not a screenshot captured in that test.',
    breakIt: [],
  },
  {
    id: 'M1-AC-04',
    milestone: SIDE16,
    suite: 'pass',
    text: 'A mask fixture shows a changing region under the mask stays inside `--max-diff`, and the same change outside the mask fails. *(Covered in PR #2)*',
    breakIt: [],
  },
  {
    id: 'M1-AC-05',
    milestone: SIDE16,
    suite: 'pass',
    text: 'A `--full-page` fixture uses a committed full-page reference and fails on a height mismatch.',
    breakIt: [],
  },
  {
    id: 'M1-AC-06',
    milestone: SIDE16,
    suite: 'pass',
    text: 'A fixture covers clipped text. *(Covered in PR #2)*',
    breakIt: [],
  },
  {
    id: 'M1-AC-07',
    milestone: SIDE16,
    suite: 'pass',
    text: 'A fixture covers a `console.error`. *(Covered in PR #2)*',
    breakIt: [],
  },
  {
    id: 'M1-AC-08',
    milestone: SIDE16,
    suite: 'pass',
    text: 'Reference dimensions not divisible by `--dpr` fail with a dimension finding and do not round the viewport.',
    breakIt: [],
  },
  {
    id: 'M1-AC-09',
    milestone: SIDE24,
    suite: 'pass',
    text: 'Stdout for a pass, a gate failure, a missing reference, and a thrown launch error all parse as the section 6 object with `schemaVersion` `1`.',
    breakIt: [],
  },
  {
    id: 'M1-AC-10',
    milestone: SIDE24,
    suite: 'pass',
    text: 'Each Gate 1 element finding includes `selector`, `box`, and short `text`.',
    breakIt: [],
  },
  {
    id: 'M1-AC-11',
    milestone: SIDE24,
    suite: 'pass',
    text: 'Gate 2 includes `mismatchPct` and clustered `regions` with boxes, capped at 20, plus `regionCount`.',
    breakIt: [],
  },
  {
    id: 'M1-AC-12',
    milestone: SIDE24,
    suite: 'pass',
    text: 'Finding `id` values for the broken-layout fixture are identical across two runs.',
    breakIt: [],
  },
  {
    id: 'M1-AC-13',
    milestone: SIDE24,
    suite: 'pass',
    text: 'Exit `0` on pass and exit `1` on fail, matching `exitCode`.',
    breakIt: [],
  },
  {
    id: 'M1-AC-14',
    milestone: SIDE24,
    suite: 'pass',
    text: 'A fixture asserts the required keys.',
    breakIt: [],
  },
  {
    id: 'M1-AC-15',
    milestone: SIDE24,
    suite: 'pass',
    text: '`.visual-eval/telemetry.jsonl` gains `schemaVersion` and the finding ids for that run, and keeps the PR #2 fields (`iteration`, `mismatchPct`, `durationMs`, `gate1Passed`, `gate2Passed`, `model`, `harness`).',
    breakIt: [],
  },
  {
    id: 'M2-AC-01',
    milestone: 'M2',
    suite: 'pass',
    text: 'After one install, `pixel-gate` resolves on `PATH`.',
    breakIt: [
      'M2-AC-01 break-it: the PATH shim forwards arguments, stdout, and the exit code',
    ],
  },
  {
    id: 'M2-AC-02',
    milestone: 'M2',
    suite: 'pass',
    text: '`pixel-gate --help` exits `0` on Windows and on Ubuntu.',
    breakIt: [
      {
        title: 'M2-AC-02 break-it: running with no arguments and no config prints one section 6 error object',
        suite: 'pass',
      },
    ],
  },
  {
    id: 'M2-AC-03',
    milestone: 'M2',
    suite: 'pass',
    text: 'A config file in a second repo supplies base URL, viewports, reference directory, masks, routes, and scenarios.',
    breakIt: [
      'M2-AC-03 break-it: a mask listed in config is what keeps the dynamic region out of the diff',
      'M2-AC-03 break-it: --config selects a config file with another name',
      'M2-AC-03 break-it: a missing required config field is a config error',
      'M2-AC-03 break-it: a scenarios path that does not exist is a config error',
    ],
  },
  {
    id: 'M2-AC-04',
    milestone: 'M2',
    suite: 'pass',
    text: 'The tool writes only `.visual-eval/` in that repo and does not change its dependency manifest.',
    breakIt: [
      'M2-AC-04 break-it: --out cannot leave the .visual-eval tree',
      {
        title: 'M2-AC-04 break-it: a failing run writes only under .visual-eval/ and invents no reference',
        suite: 'pass',
      },
    ],
  },
  {
    id: 'M2-AC-05',
    milestone: 'M2',
    suite: 'pass',
    text: '`--url` and `--ref` still run Gate 1 and Gate 2 without a config file.',
    breakIt: [
      {
        title: 'M2-AC-05 break-it: --url without --ref runs Gate 1 only and reports Gate 2 as skipped',
        suite: 'pass',
      },
    ],
  },
  {
    id: 'M2-AC-06',
    milestone: 'M2',
    suite: 'pass',
    text: 'Reference PNGs are keyed by route id and viewport name, as in section 7.',
    breakIt: [
      'M2-AC-06 break-it: a PNG in the wrong viewport slot fails only that route and viewport',
      'M2-AC-06 break-it: flat file names such as home-desktop.png are not read',
    ],
  },
  {
    id: 'M2-AC-07',
    milestone: 'M2',
    suite: 'pass',
    text: 'A markdown acceptance list maps each scenario heading to a scenario id. An unmapped heading and an unmapped scenario each produce a finding and exit `1`.',
    breakIt: [
      'M2-AC-07 break-it: an unmapped heading is the only finding when every scenario has a heading',
      'M2-AC-07 break-it: an unmapped scenario is the only finding when every heading has a scenario',
      'M2-AC-07 break-it: only level 2 headings are scenario headings and the id must match exactly',
    ],
  },
  {
    id: 'M2-AC-08',
    milestone: 'M2',
    suite: 'pass',
    text: 'A configured route with no reference PNG fails with `gate2.missing-reference.<route-id>.<viewport-name>`.',
    breakIt: [
      'M2-AC-08 break-it: referenceRequired false with no PNG is not a finding',
      'M2-AC-08 break-it: a route that requires a reference fails for every viewport that lacks one',
    ],
  },
  {
    id: 'M2-AC-09',
    milestone: 'M2',
    suite: 'pass',
    text: 'The determinism checks in section 5 that need a project fixture run here: pinned font on the committed PNG, non-fixture network aborted, `ubuntu-latest` as the pixel source of truth, and a `windows-latest` CI job satisfying the Section 5 Windows v1 requirement.',
    breakIt: [
      'M2-AC-09 break-it: the pinned font is awaited before the capture',
      'M2-AC-09 break-it: only an origin named in allowNetwork may be loaded, and it changes the pixels',
    ],
  },
  {
    id: 'M2-AC-10',
    milestone: 'M2',
    suite: 'pass',
    text: 'Flags a button or link-role control with no accessible name.',
    breakIt: [],
  },
  {
    id: 'M2-AC-11',
    milestone: 'M2',
    suite: 'pass',
    text: 'Flags `href="#"` and `href=""`.',
    breakIt: [],
  },
  {
    id: 'M2-AC-12',
    milestone: 'M2',
    suite: 'pass',
    text: 'Flags a click target whose center is covered by another element.',
    breakIt: [],
  },
  {
    id: 'M2-AC-13',
    milestone: 'M2',
    suite: 'pass',
    text: 'Flags an input, select, or textarea with no associated label.',
    breakIt: [],
  },
  {
    id: 'M2-AC-14',
    milestone: 'M2',
    suite: 'pass',
    text: 'Each static hit is a `findings` entry with `id`, `selector`, `box`, and `text`.',
    breakIt: [
      'M2-AC-14 break-it: a clean page has no gate3 findings and gate3 passes',
    ],
  },
  {
    id: 'M2-AC-15',
    milestone: 'M2',
    suite: 'pass',
    text: 'A fixture opens a modal, flips a toggle, and submits a labeled form, and exits `0`.',
    breakIt: [
      'M2-AC-15 break-it: fill sends the value verbatim, including spaces and ampersands',
    ],
  },
  {
    id: 'M2-AC-16',
    milestone: 'M2',
    suite: 'pass',
    text: 'A broken step returns `passed: false`, exit `1`, and a finding with the step selector, the action name, and a screenshot path under `.visual-eval/`.',
    breakIt: [
      'M2-AC-16 break-it: a control that exists but is covered fails with the same finding shape',
      'M2-AC-16 break-it: a wait step whose selector never appears fails',
    ],
  },
  {
    id: 'M2-AC-17',
    milestone: 'M2',
    suite: 'pass',
    text: 'The runner performs the steps in the scenario file. It does not infer a flow from the static scan.',
    breakIt: [
      'M2-AC-17 break-it: a scenario with one goto step clicks nothing even though the page has controls',
      'M2-AC-17 break-it: an unknown scenario id fails closed and runs nothing',
    ],
  },
  {
    id: 'M2-AC-18',
    milestone: 'M2',
    suite: 'pass',
    text: 'With `vision.enabled` false or omitted, the CLI makes no vision call and does not read a verdict file. `passed` depends only on deterministic gates.',
    breakIt: [
      {
        title: 'M2-AC-18 break-it: passed depends only on the deterministic gates when vision is off',
        suite: 'pass',
      },
    ],
  },
  {
    id: 'M2-AC-19',
    milestone: 'M2',
    suite: 'pass',
    text: 'With `vision.enabled` true, the report adds the composite PNG path and the `findings` array on a field the caller can read (`artifacts.composite` and `findings`). The CLI still does not open a network connection to a model.',
    breakIt: [
      'M2-AC-19 break-it: with a Gate 2 mismatch the vision field carries the same findings and a composite',
    ],
  },
  {
    id: 'M2-AC-20',
    milestone: 'M2',
    suite: 'pass',
    text: 'A caller may pass a verdict JSON (`--vision-verdict <file>`) with `{ "passed": boolean, "text": string }`. The text is copied into an `info` finding.',
    breakIt: [
      'M2-AC-20 break-it: a malformed verdict fails closed with an error',
    ],
  },
  {
    id: 'M2-AC-21',
    milestone: 'M2',
    suite: 'pass',
    text: 'That verdict does not change `passed` unless `vision.blocking` is true. The default is false.',
    breakIt: [
      {
        title: 'M2-AC-21 break-it: a blocking passing verdict cannot rescue a deterministic failure',
        suite: 'pass',
      },
      'M2-AC-21 break-it: blocking true without a verdict file changes nothing',
    ],
  },
  {
    id: 'M2-AC-22',
    milestone: 'M2',
    suite: 'pass',
    text: 'A test covers enabled+non-blocking (deterministic pass stays pass even if the verdict says fail) and blocking (verdict fail forces exit `1`).',
    breakIt: [],
  },
  {
    id: 'M2-AC-23',
    milestone: 'M2',
    suite: 'pass',
    text: '`SKILL.md` tells the agent to run the global `pixel-gate` command, not a path into this repo.',
    breakIt: [],
  },
  {
    id: 'M2-AC-24',
    milestone: 'M2',
    suite: 'pass',
    text: 'The skill tells the agent to parse the section 6 JSON and to stop after 5 iterations even if `passed` is still false.',
    breakIt: [],
  },
  {
    id: 'M2-AC-25',
    milestone: 'M2',
    suite: 'pass',
    text: 'The skill tells the agent to write a Playwright `.spec.ts` that replays the scenario file.',
    breakIt: [],
  },
  {
    id: 'M2-AC-26',
    milestone: 'M2',
    suite: 'pass',
    text: 'The skill states when to use pixel mode and when to use wireframe mode (pixel when a committed PNG exists; wireframe when the reference is a structural sketch).',
    breakIt: [],
  },
  {
    id: 'M2-AC-27',
    milestone: 'M2',
    suite: 'pass',
    text: 'The skill states that optional host `chrome-devtools-mcp` inspection is an aid only and cannot change `passed`, `findings`, or `exitCode`.',
    breakIt: [],
  },
  {
    id: 'M2-AC-28',
    milestone: 'M2',
    suite: 'pass',
    text: 'A test reads the skill file and fails if the 5-iteration cap is missing.',
    breakIt: [],
  },
  {
    id: 'M2-AC-29',
    milestone: 'M2',
    suite: 'pass',
    text: 'No acceptance line of the form "passes skill structure validation" unless a checker exists in this repo and the test runs it. Do not add a prose-only validation claim.',
    breakIt: [
      'M2-AC-29 break-it: a validation claim without a checker script is detected',
    ],
  },
  {
    id: 'M2-AC-30',
    milestone: 'M2',
    suite: 'pass',
    text: 'On Windows the installer creates a directory junction for the skill. On Unix it creates the skill link with `ln -sfn`.',
    breakIt: [
      'M2-AC-30 break-it: edits to SKILL.md in the package are visible through every destination',
    ],
  },
  {
    id: 'M2-AC-31',
    milestone: 'M2',
    suite: 'pass',
    text: 'Skill destinations: Antigravity Desktop `~/.gemini/config/skills/`, Antigravity CLI `~/.gemini/antigravity-cli/skills/`, Cursor `~/.cursor/skills/`.',
    breakIt: [
      'M2-AC-31 break-it: the home directory comes from --home and never from the real profile',
    ],
  },
  {
    id: 'M2-AC-32',
    milestone: 'M2',
    suite: 'pass',
    text: 'The installer puts `pixel-gate` on `PATH` and installs the pinned Chromium.',
    breakIt: [
      'M2-AC-32 break-it: dry-run writes nothing and --skip-chromium drops only the browser action',
    ],
  },
  {
    id: 'M2-AC-33',
    milestone: 'M2',
    suite: 'pass',
    text: 'The installer does not add this package to the dependencies of the target application.',
    breakIt: [
      'M2-AC-33 break-it: the installer leaves this repository manifests unchanged',
    ],
  },
  {
    id: 'M2-AC-34',
    milestone: 'M2',
    suite: 'pass',
    text: 'Re-running the installer replaces the links and leaves a working `pixel-gate --help`.',
    breakIt: [
      'M2-AC-34 break-it: a re-run does not nest or duplicate links',
    ],
  },
  {
    id: 'M2-AC-35',
    milestone: 'M2',
    suite: 'pass',
    text: 'All three required v1 harnesses (**Antigravity Desktop, Antigravity CLI, and Cursor**) list the installed `pixel-perfect-gate` skill (no skip path).',
    breakIt: [
      'M2-AC-35 break-it: a fresh home fails and no flag or environment variable skips the check',
      'M2-AC-35 break-it: one missing harness fails the whole run and is named',
      'M2-AC-35 break-it: an unknown harness name is rejected',
    ],
  },
  {
    id: 'M2-AC-36',
    milestone: 'M2',
    suite: 'pass',
    text: 'A scripted prompt (fixed text, no requirement that a model invent a fix) returns stdout that parses as section 6 JSON in each of the three harnesses.',
    breakIt: [
      'M2-AC-36 break-it: stdout with prose around the JSON fails',
      'M2-AC-36 break-it: a report missing a section 6 key fails',
    ],
  },
  {
    id: 'M2-AC-37',
    milestone: 'M2',
    suite: 'pass',
    text: 'A recording of a live loop-until-green session may be attached to the PR. CI does not fail when that recording is absent or when the model stops short of `passed: true`.',
    breakIt: [
      'M2-AC-37 break-it: an attached recording is echoed and still never required',
    ],
  },
  {
    id: 'M2b-AC-01',
    milestone: 'M2b',
    suite: 'gap',
    text: "A route with no `reference` behaves exactly as today (`kind: \"png\"`); the existing test suite passes unchanged.",
    breakIt: [
      "M2b-AC-01 break-it: an explicit reference.kind of url is not compared as a committed png",
    ],
  },
  {
    id: 'M2b-AC-02',
    milestone: 'M2b',
    suite: 'gap',
    text: "`pixel-gate reference capture` on an `html-file` fixture (inline CSS + JS, committed font) writes PNG, `.landmarks.json`, `.styles.json`, and `manifest.json` under `.visual-eval/references/<route-id>/<viewport-name>/`, and nothing outside `.visual-eval/`.",
    breakIt: [
      "M2b-AC-02 break-it: a missing html-file source fails and writes no reference bundle",
    ],
  },
  {
    id: 'M2b-AC-03',
    milestone: 'M2b',
    suite: 'gap',
    text: "Capturing the same `html-file` twice on `ubuntu-latest` produces byte-identical PNGs (same `sha256` in both manifests).",
    breakIt: [
      "M2b-AC-03 break-it: a changed source sha256 does not reuse the previous PNG",
    ],
  },
  {
    id: 'M2b-AC-04',
    milestone: 'M2b',
    suite: 'gap',
    text: "Gate 2 run against that bundle and against the same prototype served as the target exits `0` with `mismatchPct` `0`.",
    breakIt: [
      "M2b-AC-04 break-it: a one-pixel change in the target fails Gate 2 on the pixel source of truth",
    ],
  },
  {
    id: 'M2b-AC-05',
    milestone: 'M2b',
    suite: 'gap',
    text: "Editing one PNG without updating `manifest.json` fails with `gate2.reference-tampered.<route>.<viewport>`.",
    breakIt: [
      "M2b-AC-05 break-it: updating manifest sha256.png to the edited bytes clears the tamper finding",
    ],
  },
  {
    id: 'M2b-AC-06',
    milestone: 'M2b',
    suite: 'gap',
    text: "A `url` capture of a local fixture server applies `reference.prepare` (a fixture cookie banner is dismissed before capture), and records a `.har`.",
    breakIt: [
      "M2b-AC-06 break-it: without reference.prepare the cookie banner remains in the capture",
    ],
  },
  {
    id: 'M2b-AC-07',
    milestone: 'M2b',
    suite: 'gap',
    text: "A `url` capture prints the section 12.8 copyright disclaimer and refuses to capture until the user acknowledges it (`reference.acknowledgeCopyright: true` in config, `--acknowledge-copyright`, or answering `yes` at the interactive prompt). Without it, it exits `1` with `gate2.reference-copy-unacknowledged.<route>` and a `blocked` stop reason. With it, `manifest.json` records `copyAcknowledgedAt`. There is no rights field and no origin allowlist.",
    breakIt: [
      "M2b-AC-07 break-it: a rights field does not authorize a url capture",
      "M2b-AC-07 break-it: an origin allowlist does not authorize a url capture",
      "M2b-AC-07 break-it: answering no at the prompt does not authorize a url capture",
    ],
  },
  {
    id: 'M2b-AC-08',
    milestone: 'M2b',
    suite: 'gap',
    text: "A loop run never re-reads a `url` source: stopping the fixture server after capture does not change the Gate 2 result. `--refresh` re-captures and writes a new `capturedAt`.",
    breakIt: [
      "M2b-AC-08 break-it: --refresh is what changes capturedAt",
    ],
  },
  {
    id: 'M2b-AC-09',
    milestone: 'M2b',
    suite: 'gap',
    text: "The SIDE-19 scenario fixture runs against an `html-file` reference and a target that matches it, and exits `0` with no `gate3.parity*` findings.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-10',
    milestone: 'M2b',
    suite: 'gap',
    text: "A target whose button renders but does nothing (handler removed) fails with `gate3.parity.<scenario-id>.<step>`, even though Gate 2 on the first screen passes.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-11',
    milestone: 'M2b',
    suite: 'gap',
    text: "A target whose post-click state differs visually fails with `gate3.parity-state.<scenario-id>.<step>`, and the report lists both state screenshot paths.",
    breakIt: [
      "M2b-AC-11 break-it: a matching post-click state does not emit gate3.parity-state",
    ],
  },
  {
    id: 'M2b-AC-12',
    milestone: 'M2b',
    suite: 'gap',
    text: "A step with a CSS selector that resolves only on the reference fails with `gate3.parity-unportable-locator.<scenario-id>.<step>`. The same step written with `getByRole` passes after a class rename on the target.",
    breakIt: [
      "M2b-AC-12 break-it: a CSS selector that resolves on both sides is not an unportable locator",
    ],
  },
  {
    id: 'M2b-AC-13',
    milestone: 'M2b',
    suite: 'gap',
    text: "A `screenshot` reference reports `gates.gate3.parity` as `{ \"skipped\": true, \"reason\": \"reference has no behavior\" }` and never `passed: true` on parity alone.",
    breakIt: [
      "M2b-AC-13 break-it: a skipped parity object does not set passed true when Gate 2 fails",
    ],
  },
  {
    id: 'M2b-AC-14',
    milestone: 'M2b',
    suite: 'gap',
    text: "Reference and target run in separate fresh contexts; a test proves that state set on the reference (e.g. `localStorage`) is not visible to the target.",
    breakIt: [
      "M2b-AC-14 break-it: the reference context still observes the localStorage value it set",
    ],
  },
  {
    id: 'M2b-AC-15',
    milestone: 'M2b',
    suite: 'gap',
    text: "Every report carries `loop` with `runId`, `iteration`, `maxIterations` `5`, `best`, `delta`, `stopReason`, and `continue`, on pass, gate failure, and error exits.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-16',
    milestone: 'M2b',
    suite: 'gap',
    text: "A fixture sequence of five telemetry rows asserts each stop reason: `passed`, `blocked` (missing reference), `regression` (new fail id and higher `failCount`), `no-progress` (same fail ids, `mismatchPct` change `< 0.1` on two consecutive iterations), and `max-iterations`.",
    breakIt: [
      "M2b-AC-16 break-it: a mismatchPct change of 0.1 is not no-progress",
      "M2b-AC-16 break-it: a mismatchPct change below 0.1 with the same fail ids is no-progress",
    ],
  },
  {
    id: 'M2b-AC-17',
    milestone: 'M2b',
    suite: 'gap',
    text: "Two different `runId` values in the same `telemetry.jsonl` do not affect each other's `best` or `delta`, so a large migration split into separate loops (owner decision 8) tracks each loop independently.",
    breakIt: [
      "M2b-AC-17 break-it: a better best on another runId is ignored",
    ],
  },
  {
    id: 'M2b-AC-18',
    milestone: 'M2b',
    suite: 'gap',
    text: "A config or flag that tries to raise `maxIterations` above `5` is rejected with a config error (`blocked`); the report still shows `maxIterations` `5`.",
    breakIt: [
      "M2b-AC-18 break-it: maxIterations of 5 is accepted",
    ],
  },
  {
    id: 'M2b-AC-19',
    milestone: 'M2b',
    suite: 'gap',
    text: "`findings` keep the SIDE-24 shape; the optional `refBox`, `expected`, and `actual` keys appear only when set, and `schemaVersion` stays `1`.",
    breakIt: [
      { title: "M2b-AC-19 break-it: a Gate 1 finding does not grow refBox, expected, or actual keys", suite: "pass" },
    ],
  },
  {
    id: 'M2b-AC-20',
    milestone: 'M2b',
    suite: 'gap',
    text: "`target.kind: \"dev-server\"` starts `target.command`, waits for `target.readyUrl`, and kills the whole process tree on exit, on both `windows-latest` and `ubuntu-latest` (no orphaned process after the run, asserted by the test).",
    breakIt: [
      "M2b-AC-20 break-it: the ready check is an HTTP 200 on target.readyUrl before capture",
    ],
  },
  {
    id: 'M2b-AC-21',
    milestone: 'M2b',
    suite: 'gap',
    text: "A command that never becomes ready fails within `target.readyTimeoutMs` with a `blocked` stop reason and a structured `error`.",
    breakIt: [
      "M2b-AC-21 break-it: the never-ready process is not left running",
    ],
  },
  {
    id: 'M2b-AC-22',
    milestone: 'M2b',
    suite: 'gap',
    text: "Visual capture uses `serviceWorkers: \"block\"`; a fixture whose service worker serves a stale asset does not change the Gate 2 result.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-23',
    milestone: 'M2b',
    suite: 'gap',
    text: "With `pwa` enabled, a fixture missing its manifest icon fails with `gate1.pwa-installability.<error-id>` taken from `Page.getInstallabilityErrors`, and the fixed fixture passes.",
    breakIt: [
      { title: "M2b-AC-23 break-it: with pwa omitted, a page is not failed for installability", suite: "pass" },
      "M2b-AC-23 break-it: the fixed installable fixture has no failing installability finding",
    ],
  },
  {
    id: 'M2b-AC-24',
    milestone: 'M2b',
    suite: 'gap',
    text: "`target.kind: \"static\"` serves a single HTML file and a directory without extra config.",
    breakIt: [
      "M2b-AC-24 break-it: static mode does not require target.command or baseUrl",
    ],
  },
  {
    id: 'M2b-AC-25',
    milestone: 'M2b',
    suite: 'gap',
    text: "With no `runtime` set, `playground` is used. On `windows-latest` and `ubuntu-latest` it starts WordPress from a committed blueprint without Docker and reaches REST `GET /wp-json/`.",
    breakIt: [
      "M2b-AC-25 break-it: an explicit runtime of existing does not spawn playground",
    ],
  },
  {
    id: 'M2b-AC-26',
    milestone: 'M2b',
    suite: 'gap',
    text: "`runtime: \"wp-env\"` and `runtime: \"existing\"` (a local or remote site URL) are accepted. An unreachable site gives a `blocked` stop reason with a structured `error`, not a gate failure.",
    breakIt: [
      "M2b-AC-26 break-it: a reachable existing URL is not a blocked error",
    ],
  },
  {
    id: 'M2b-AC-27',
    milestone: 'M2b',
    suite: 'gap',
    text: "`buildType` accepts `block-theme`, `classic-theme`, `hybrid-theme`, `patterns`, `custom-blocks`, `page-builder`, and `any` (default). The accuracy rule is the same for every build type: Gate 2 tier A on the browser output, plus SIDE-29 parity.",
    breakIt: [
      "M2b-AC-27 break-it: a buildType outside the allowed set is a config error",
    ],
  },
  {
    id: 'M2b-AC-28',
    milestone: 'M2b',
    suite: 'gap',
    text: "A classic-theme fixture (PHP template, no blocks) and a block-theme fixture that both render the prototype pass with the default config. No structure finding appears, because `structureCheck` defaults to `off`.",
    breakIt: [
      "M2b-AC-28 break-it: a core/html block produces no structure finding while structureCheck is off",
    ],
  },
  {
    id: 'M2b-AC-29',
    milestone: 'M2b',
    suite: 'gap',
    text: "With `structureCheck: \"advisory\"`, a page whose whole content is one `core/html` block reports `gate1.wp-freeform-html.1` as `info`, and a block whose saved markup does not validate reports `gate1.wp-invalid-block.<n>` as `info`. Neither changes `passed`; a test asserts exit `0` when the browser output matches.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-30',
    milestone: 'M2b',
    suite: 'gap',
    text: "A converted fixture page matches its `html-file` prototype within the tier A rule, comparing `target.selector` (default `main`, configurable) against `reference.selector`. Setting `target.selector` to `body` compares the whole page.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-31',
    milestone: 'M2b',
    suite: 'gap',
    text: "The front-end capture contains no `#wpadminbar` (asserted on the DOM and the PNG height).",
    breakIt: [
      "M2b-AC-31 break-it: a logged-in capture still has no wpadminbar in the DOM or the PNG height",
    ],
  },
  {
    id: 'M2b-AC-32',
    milestone: 'M2b',
    suite: 'gap',
    text: "SIDE-29 parity passes on the converted page only when the prototype's interaction is re-implemented in a way WordPress keeps (enqueued script, block `viewScript`, or page-builder widget); with the script dropped, parity fails.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-33',
    milestone: 'M2b',
    suite: 'gap',
    text: "Credentials (application password) are read from the environment only and never appear in stdout, findings, or artifacts.",
    breakIt: [
      "M2b-AC-33 break-it: a password placed in the config is rejected and is not forwarded",
    ],
  },
  {
    id: 'M2b-AC-34',
    milestone: 'M2b',
    suite: 'gap',
    text: "A screenshot whose `width / dpr` does not equal a declared viewport width fails with `gate2.reference-scale-unknown.<route>` and is not resized.",
    breakIt: [
      "M2b-AC-34 break-it: a screenshot whose width divided by dpr equals the viewport is not scale-unknown",
    ],
  },
  {
    id: 'M2b-AC-35',
    milestone: 'M2b',
    suite: 'gap',
    text: "`reference.crop` removes a fixture browser bar; the cropped PNG is what `manifest.json` hashes.",
    breakIt: [
      "M2b-AC-35 break-it: without crop the manifest hash covers the uncropped PNG including the bar",
    ],
  },
  {
    id: 'M2b-AC-36',
    milestone: 'M2b',
    suite: 'gap',
    text: "`reference.region: \"viewport\"` compares only the top `height / dpr` CSS px of a taller target; `\"full\"` keeps the section 5 exact-height failure.",
    breakIt: [
      "M2b-AC-36 break-it: omitting reference.region does not crop to the viewport",
    ],
  },
  {
    id: 'M2b-AC-37',
    milestone: 'M2b',
    suite: 'gap',
    text: "A JPEG input is accepted only for `kind: \"screenshot\"` and is marked tier C.",
    breakIt: [
      "M2b-AC-37 break-it: a JPEG reference with kind png is rejected",
      "M2b-AC-37 break-it: a WebP screenshot is accepted and marked tier C",
    ],
  },
  {
    id: 'M2b-AC-38',
    milestone: 'M2b',
    suite: 'gap',
    text: "Tier C comparison is advisory: a target with `mismatchPct` `35` against its screenshot exits `0` (when Gates 1/3 pass), reports `info` findings, and `gates.gate2.advisory` is `{ \"similarityPct\": 65, \"thresholdPct\": 80, \"met\": false }`.",
    breakIt: [
      "M2b-AC-38 break-it: the same 35 percent mismatch against a tier A html-file reference does not exit 0",
    ],
  },
  {
    id: 'M2b-AC-39',
    milestone: 'M2b',
    suite: 'gap',
    text: "Default threshold: `reference.maxDiff` defaults to `20` for tier B/C (similarity `>= 80%`). Setting `reference.maxDiff: 5` on one route changes only that route's `thresholdPct` to `95`.",
    breakIt: [
      "M2b-AC-39 break-it: a tier A route keeps maxDiff 0.5 when a sibling screenshot route sets maxDiff 5",
    ],
  },
  {
    id: 'M2b-AC-40',
    milestone: 'M2b',
    suite: 'gap',
    text: "With `advisory.met` false and no other stop rule firing, `loop.continue` is `true` and `stopReason` is `null`. With `passed` true and every advisory target met, `stopReason` is `passed`.",
    breakIt: [
      "M2b-AC-40 break-it: a blocked intake error stops the loop even when advisory.met is false",
    ],
  },
  {
    id: 'M2b-AC-41',
    milestone: 'M2b',
    suite: 'gap',
    text: "Intake errors (`gate2.reference-scale-unknown.*`, unreadable image) still fail with `blocked`. They are setup problems, not comparison results.",
    breakIt: [
      "M2b-AC-41 break-it: an unreadable image is blocked and a high mismatch is not blocked",
    ],
  },
  {
    id: 'M2b-AC-42',
    milestone: 'M2b',
    suite: 'gap',
    text: "`design.frames[]` maps a frame to route + viewport; a frame whose width differs from the viewport fails with `gate2.frame-viewport-mismatch.<nodeId>`.",
    breakIt: [
      "M2b-AC-42 break-it: a frame whose width equals the viewport is not a frame-viewport mismatch",
    ],
  },
  {
    id: 'M2b-AC-43',
    milestone: 'M2b',
    suite: 'gap',
    text: "With a Figma token in the environment, capture exports each frame through REST `/v1/images` at `scale = dpr`. Without a token, a manually exported PNG with the same name produces the same bundle shape. CI uses only the committed manual export, with no network.",
    breakIt: [
      "M2b-AC-43 break-it: with no token the figma stub receives no request",
    ],
  },
  {
    id: 'M2b-AC-44',
    milestone: 'M2b',
    suite: 'gap',
    text: "Layer geometry produces a `.landmarks.json` for layers named after configured landmarks; wireframe mode then reports an `info` finding (advisory, tier B) for a target whose `header` moves `> 4` CSS px.",
    breakIt: [
      "M2b-AC-44 break-it: a header shift of exactly 4 CSS px does not emit the landmark info finding",
      "M2b-AC-44 break-it: a header shift of 5 CSS px emits an info finding and passed stays true",
    ],
  },
  {
    id: 'M2b-AC-45',
    milestone: 'M2b',
    suite: 'gap',
    text: "Tokens (from the Variables REST API or a saved `get_variable_defs` output) produce `.tokens.json`, consumed by SIDE-35.",
    breakIt: [
      "M2b-AC-45 break-it: a token mismatch becomes a style finding and a matching token does not",
    ],
  },
  {
    id: 'M2b-AC-46',
    milestone: 'M2b',
    suite: 'gap',
    text: "Prototype `interactions` (`ON_CLICK` → `NODE`/`NAVIGATE`) produce `scenarios.draft.json`. Drafts are never executed as gating scenarios until a human moves them into the scenario file (owner decision 13).",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-47',
    milestone: 'M2b',
    suite: 'gap',
    text: "Tier B is advisory with the same default and override as SIDE-33 (`reference.maxDiff` default `20`): pixel, landmark, and token findings against a design file are `info` and never change `passed`.",
    breakIt: [
      "M2b-AC-47 break-it: reference.maxDiff 5 on a design-file route sets thresholdPct to 95 and passed stays true",
    ],
  },
  {
    id: 'M2b-AC-48',
    milestone: 'M2b',
    suite: 'gap',
    text: "Figma access follows owner decision 9: manual export in CI; REST export only when `FIGMA_TOKEN` is set (never printed or written to artifacts); Figma/Penpot/Sketch MCP output is never read by the gate except a saved `get_variable_defs` file named in config.",
    breakIt: [
      "M2b-AC-48 break-it: an unnamed MCP variable file is not read",
    ],
  },
  {
    id: 'M2b-AC-49',
    milestone: 'M2b',
    suite: 'gap',
    text: "For mapped elements, computed `color`, `background-color`, `font-family`, `font-size`, `font-weight`, `line-height`, `padding`, `margin`, `gap`, and `border-radius` are compared with the reference `.styles.json` or `.tokens.json`.",
    breakIt: [
      "M2b-AC-49 break-it: a property outside the compared list is not a finding",
    ],
  },
  {
    id: 'M2b-AC-50',
    milestone: 'M2b',
    suite: 'gap',
    text: "A one-step color change (e.g. `#1a73e8` → `#1a74e8`) that stays under `maxDiff` in Gate 2 still fails with `gate2.style.<selector-slug>.color` and `expected` / `actual` set.",
    breakIt: [
      "M2b-AC-50 break-it: an identical computed color does not emit gate2.style.button.color",
    ],
  },
  {
    id: 'M2b-AC-51',
    milestone: 'M2b',
    suite: 'gap',
    text: "An element missing on the target is one finding, not one per property.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-52',
    milestone: 'M2b',
    suite: 'gap',
    text: "Style findings are `fail` against tier A references (`.styles.json` from `html-file` / `url`) and `info` against tier B tokens (`.tokens.json` from a design file).",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-53',
    milestone: 'M2b',
    suite: 'gap',
    text: "`SKILL.md` has one playbook per `reference.kind` (cases 1–5 in section 12.1): which command to run first, which tier applies, and which optional MCP servers help.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-54',
    milestone: 'M2b',
    suite: 'gap',
    text: "The skill tells the agent to obey `loop.continue` and `loop.stopReason`, and to return to `loop.best.iteration` on `regression`.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-55',
    milestone: 'M2b',
    suite: 'gap',
    text: "The skill tells the agent to check whether Figma, Penpot, Sketch, WordPress, Playwright, or Chrome DevTools MCP servers are enabled and to use them only for context, never to change `passed`.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-56',
    milestone: 'M2b',
    suite: 'gap',
    text: "The skill tells the agent to show the user the copyright disclaimer before a `url` capture and never to set `reference.acknowledgeCopyright` or pass `--acknowledge-copyright` on the user's behalf.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-57',
    milestone: 'M2b',
    suite: 'gap',
    text: "The skill tells the agent to split a large migration into separate loops (one `runId` per route or small route group) instead of exceeding 5 iterations, and never to move `scenarios.draft.json` entries into the scenario file itself (a human approves them).",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-58',
    milestone: 'M2b',
    suite: 'gap',
    text: "The skill tells the agent that tier B/C results are advisory: keep looping toward the similarity target, but never report the route as failed because of them.",
    breakIt: [

    ],
  },
  {
    id: 'M2b-AC-59',
    milestone: 'M2b',
    suite: 'gap',
    text: "A test reads the skill file and fails if any of the five playbooks, the `loop.continue` rule, the copyright-acknowledgement rule, the advisory rule, the split-loops rule, or the draft-scenario rule is missing.",
    breakIt: [
      { title: "M2b-AC-59 break-it: deleting one playbook heading from a complete skill is detected", suite: "pass" },
      { title: "M2b-AC-59 break-it: a skill that keeps every required rule has no problems", suite: "pass" },
      { title: "M2b-AC-59 break-it: an extra playbook heading does not fail the checker", suite: "pass" },
    ],
  },
  {
    id: 'M3-AC-01',
    milestone: 'M3',
    suite: 'gap',
    text: '**Eval Benchmarks (primary):** Groups `.visual-eval/telemetry.jsonl` by `model`, `harness`, and `iteration`.',
    breakIt: [
      'M3-AC-01 break-it: rows with the same model, harness, and iteration are one group',
      'M3-AC-01 break-it: a different model, harness, or iteration is a different group',
      'M3-AC-01 break-it: groups are ordered by model, then harness, then numeric iteration',
      'M3-AC-01 break-it: an extra telemetry field does not create a group and a missing model, harness, iteration, or schemaVersion 1 is rejected',
      'M3-AC-01 break-it: a missing telemetry file and a non-JSON line fail closed, and blank or CRLF lines do not create a group',
    ],
  },
  {
    id: 'M3-AC-02',
    milestone: 'M3',
    suite: 'gap',
    text: '**Linear Delivery Board (secondary):** Renders live Linear stages (`Todo`, `In Progress`, `In Review`, `Approved`, `Rework`) fetched server-side or via local CLI. When `LINEAR_API_KEY` is absent, the board route remains present and renders an empty state while Eval Benchmarks stay the primary view.',
    breakIt: [
      'M3-AC-02 break-it: a configured key uses the local CLI, and a zero-issue result is not the no-key empty state',
      'M3-AC-02 break-it: an unknown stage and a failing local CLI are rejected and are not the empty state',
      'M3-AC-02 break-it: Eval Benchmarks stay the primary view when the key is set',
    ],
  },
  {
    id: 'M3-AC-03',
    milestone: 'M3',
    suite: 'gap',
    text: '`LINEAR_API_KEY` is read only on a server or in a local CLI. A check verifies it is absent from any client-side bundle.',
    breakIt: [
      'M3-AC-03 break-it: a client file containing LINEAR_API_KEY fails the check and names that file',
      'M3-AC-03 break-it: a clean client root passes, a token outside that root does not fail, and a missing root fails',
      'M3-AC-03 break-it: the server key value is absent from the client script and both pages',
    ],
  },
  {
    id: 'M3-AC-04',
    milestone: 'M3',
    suite: 'pass',
    text: 'The viewer\'s dependency in Linear `blockedBy` is `SIDE-24` and `SIDE-19`.',
    breakIt: [
      'M3-AC-04 break-it: an extra dependency id is rejected',
      'M3-AC-04 break-it: a missing dependency id is rejected',
      'M3-AC-04 break-it: a duplicate dependency id is rejected',
    ],
  },
];
