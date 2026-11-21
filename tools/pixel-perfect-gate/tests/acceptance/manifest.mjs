/**
 * Traceability map for enforced milestone acceptance criteria.
 * `text` must match the section 8 checkbox verbatim.
 * `suite: "pass"` is a green test (section 8 box checked).
 * `suite: "gap"` is an expected-fail test (section 8 box unchecked).
 * Ids are stable. Do not renumber them when a criterion is added.
 */
export const ENFORCED_MILESTONES = ['M1', 'M2'];

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
    suite: 'gap',
    text: 'Stdout for a pass, a gate failure, a missing reference, and a thrown launch error all parse as the section 6 object with `schemaVersion` `1`.',
    breakIt: [],
  },
  {
    id: 'M1-AC-10',
    milestone: SIDE24,
    suite: 'gap',
    text: 'Each Gate 1 element finding includes `selector`, `box`, and short `text`.',
    breakIt: [],
  },
  {
    id: 'M1-AC-11',
    milestone: SIDE24,
    suite: 'gap',
    text: 'Gate 2 includes `mismatchPct` and clustered `regions` with boxes, capped at 20, plus `regionCount`.',
    breakIt: [],
  },
  {
    id: 'M1-AC-12',
    milestone: SIDE24,
    suite: 'gap',
    text: 'Finding `id` values for the broken-layout fixture are identical across two runs.',
    breakIt: [],
  },
  {
    id: 'M1-AC-13',
    milestone: SIDE24,
    suite: 'gap',
    text: 'Exit `0` on pass and exit `1` on fail, matching `exitCode`.',
    breakIt: [],
  },
  {
    id: 'M1-AC-14',
    milestone: SIDE24,
    suite: 'gap',
    text: 'A fixture asserts the required keys.',
    breakIt: [],
  },
  {
    id: 'M1-AC-15',
    milestone: SIDE24,
    suite: 'gap',
    text: '`.visual-eval/telemetry.jsonl` gains `schemaVersion` and the finding ids for that run, and keeps the PR #2 fields (`iteration`, `mismatchPct`, `durationMs`, `gate1Passed`, `gate2Passed`, `model`, `harness`).',
    breakIt: [],
  },
  {
    id: 'M2-AC-01',
    milestone: 'M2',
    suite: 'gap',
    text: 'After one install, `pixel-gate` resolves on `PATH`.',
    breakIt: [
      'M2-AC-01 break-it: the PATH shim forwards arguments, stdout, and the exit code',
    ],
  },
  {
    id: 'M2-AC-02',
    milestone: 'M2',
    suite: 'gap',
    text: '`pixel-gate --help` exits `0` on Windows and on Ubuntu.',
    breakIt: [
      'M2-AC-02 break-it: running with no arguments and no config prints one section 6 error object',
    ],
  },
  {
    id: 'M2-AC-03',
    milestone: 'M2',
    suite: 'gap',
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
    suite: 'gap',
    text: 'The tool writes only `.visual-eval/` in that repo and does not change its dependency manifest.',
    breakIt: [
      'M2-AC-04 break-it: --out cannot leave the .visual-eval tree',
      'M2-AC-04 break-it: a failing run writes only under .visual-eval/ and invents no reference',
    ],
  },
  {
    id: 'M2-AC-05',
    milestone: 'M2',
    suite: 'gap',
    text: '`--url` and `--ref` still run Gate 1 and Gate 2 without a config file.',
    breakIt: [
      'M2-AC-05 break-it: --url without --ref runs Gate 1 only and reports Gate 2 as skipped',
    ],
  },
  {
    id: 'M2-AC-06',
    milestone: 'M2',
    suite: 'gap',
    text: 'Reference PNGs are keyed by route id and viewport name, as in section 7.',
    breakIt: [
      'M2-AC-06 break-it: a PNG in the wrong viewport slot fails only that route and viewport',
      'M2-AC-06 break-it: flat file names such as home-desktop.png are not read',
    ],
  },
  {
    id: 'M2-AC-07',
    milestone: 'M2',
    suite: 'gap',
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
    suite: 'gap',
    text: 'A configured route with no reference PNG fails with `gate2.missing-reference.<route-id>.<viewport-name>`.',
    breakIt: [
      'M2-AC-08 break-it: referenceRequired false with no PNG is not a finding',
      'M2-AC-08 break-it: a route that requires a reference fails for every viewport that lacks one',
    ],
  },
  {
    id: 'M2-AC-09',
    milestone: 'M2',
    suite: 'gap',
    text: 'The determinism checks in section 5 that need a project fixture run here: pinned font on the committed PNG, non-fixture network aborted, `ubuntu-latest` as the pixel source of truth, and a `windows-latest` CI job satisfying the Section 5 Windows v1 requirement.',
    breakIt: [
      'M2-AC-09 break-it: the pinned font is awaited before the capture',
      'M2-AC-09 break-it: only an origin named in allowNetwork may be loaded, and it changes the pixels',
    ],
  },
  {
    id: 'M2-AC-10',
    milestone: 'M2',
    suite: 'gap',
    text: 'Flags a button or link-role control with no accessible name.',
    breakIt: [],
  },
  {
    id: 'M2-AC-11',
    milestone: 'M2',
    suite: 'gap',
    text: 'Flags `href="#"` and `href=""`.',
    breakIt: [],
  },
  {
    id: 'M2-AC-12',
    milestone: 'M2',
    suite: 'gap',
    text: 'Flags a click target whose center is covered by another element.',
    breakIt: [],
  },
  {
    id: 'M2-AC-13',
    milestone: 'M2',
    suite: 'gap',
    text: 'Flags an input, select, or textarea with no associated label.',
    breakIt: [],
  },
  {
    id: 'M2-AC-14',
    milestone: 'M2',
    suite: 'gap',
    text: 'Each static hit is a `findings` entry with `id`, `selector`, `box`, and `text`.',
    breakIt: [
      'M2-AC-14 break-it: a clean page has no gate3 findings and gate3 passes',
    ],
  },
  {
    id: 'M2-AC-15',
    milestone: 'M2',
    suite: 'gap',
    text: 'A fixture opens a modal, flips a toggle, and submits a labeled form, and exits `0`.',
    breakIt: [
      'M2-AC-15 break-it: fill sends the value verbatim, including spaces and ampersands',
    ],
  },
  {
    id: 'M2-AC-16',
    milestone: 'M2',
    suite: 'gap',
    text: 'A broken step returns `passed: false`, exit `1`, and a finding with the step selector, the action name, and a screenshot path under `.visual-eval/`.',
    breakIt: [
      'M2-AC-16 break-it: a control that exists but is covered fails with the same finding shape',
      'M2-AC-16 break-it: a wait step whose selector never appears fails',
    ],
  },
  {
    id: 'M2-AC-17',
    milestone: 'M2',
    suite: 'gap',
    text: 'The runner performs the steps in the scenario file. It does not infer a flow from the static scan.',
    breakIt: [
      'M2-AC-17 break-it: a scenario with one goto step clicks nothing even though the page has controls',
      'M2-AC-17 break-it: an unknown scenario id fails closed and runs nothing',
    ],
  },
  {
    id: 'M2-AC-18',
    milestone: 'M2',
    suite: 'gap',
    text: 'With `vision.enabled` false or omitted, the CLI makes no vision call and does not read a verdict file. `passed` depends only on deterministic gates.',
    breakIt: [
      'M2-AC-18 break-it: passed depends only on the deterministic gates when vision is off',
    ],
  },
  {
    id: 'M2-AC-19',
    milestone: 'M2',
    suite: 'gap',
    text: 'With `vision.enabled` true, the report adds the composite PNG path and the `findings` array on a field the caller can read (`artifacts.composite` and `findings`). The CLI still does not open a network connection to a model.',
    breakIt: [
      'M2-AC-19 break-it: with a Gate 2 mismatch the vision field carries the same findings and a composite',
    ],
  },
  {
    id: 'M2-AC-20',
    milestone: 'M2',
    suite: 'gap',
    text: 'A caller may pass a verdict JSON (`--vision-verdict <file>`) with `{ "passed": boolean, "text": string }`. The text is copied into an `info` finding.',
    breakIt: [
      'M2-AC-20 break-it: a malformed verdict fails closed with an error',
    ],
  },
  {
    id: 'M2-AC-21',
    milestone: 'M2',
    suite: 'gap',
    text: 'That verdict does not change `passed` unless `vision.blocking` is true. The default is false.',
    breakIt: [
      'M2-AC-21 break-it: a blocking passing verdict cannot rescue a deterministic failure',
      'M2-AC-21 break-it: blocking true without a verdict file changes nothing',
    ],
  },
  {
    id: 'M2-AC-22',
    milestone: 'M2',
    suite: 'gap',
    text: 'A test covers enabled+non-blocking (deterministic pass stays pass even if the verdict says fail) and blocking (verdict fail forces exit `1`).',
    breakIt: [],
  },
  {
    id: 'M2-AC-23',
    milestone: 'M2',
    suite: 'gap',
    text: '`SKILL.md` tells the agent to run the global `pixel-gate` command, not a path into this repo.',
    breakIt: [],
  },
  {
    id: 'M2-AC-24',
    milestone: 'M2',
    suite: 'gap',
    text: 'The skill tells the agent to parse the section 6 JSON and to stop after 5 iterations even if `passed` is still false.',
    breakIt: [],
  },
  {
    id: 'M2-AC-25',
    milestone: 'M2',
    suite: 'gap',
    text: 'The skill tells the agent to write a Playwright `.spec.ts` that replays the scenario file.',
    breakIt: [],
  },
  {
    id: 'M2-AC-26',
    milestone: 'M2',
    suite: 'gap',
    text: 'The skill states when to use pixel mode and when to use wireframe mode (pixel when a committed PNG exists; wireframe when the reference is a structural sketch).',
    breakIt: [],
  },
  {
    id: 'M2-AC-27',
    milestone: 'M2',
    suite: 'gap',
    text: 'The skill states that optional host `chrome-devtools-mcp` inspection is an aid only and cannot change `passed`, `findings`, or `exitCode`.',
    breakIt: [],
  },
  {
    id: 'M2-AC-28',
    milestone: 'M2',
    suite: 'gap',
    text: 'A test reads the skill file and fails if the 5-iteration cap is missing.',
    breakIt: [],
  },
  {
    id: 'M2-AC-29',
    milestone: 'M2',
    suite: 'gap',
    text: 'No acceptance line of the form "passes skill structure validation" unless a checker exists in this repo and the test runs it. Do not add a prose-only validation claim.',
    breakIt: [
      'M2-AC-29 break-it: a validation claim without a checker script is detected',
    ],
  },
  {
    id: 'M2-AC-30',
    milestone: 'M2',
    suite: 'gap',
    text: 'On Windows the installer creates a directory junction for the skill. On Unix it creates the skill link with `ln -sfn`.',
    breakIt: [
      'M2-AC-30 break-it: edits to SKILL.md in the package are visible through every destination',
    ],
  },
  {
    id: 'M2-AC-31',
    milestone: 'M2',
    suite: 'gap',
    text: 'Skill destinations: Antigravity Desktop `~/.gemini/config/skills/`, Antigravity CLI `~/.gemini/antigravity-cli/skills/`, Cursor `~/.cursor/skills/`.',
    breakIt: [
      'M2-AC-31 break-it: the home directory comes from --home and never from the real profile',
    ],
  },
  {
    id: 'M2-AC-32',
    milestone: 'M2',
    suite: 'gap',
    text: 'The installer puts `pixel-gate` on `PATH` and installs the pinned Chromium.',
    breakIt: [
      'M2-AC-32 break-it: dry-run writes nothing and --skip-chromium drops only the browser action',
    ],
  },
  {
    id: 'M2-AC-33',
    milestone: 'M2',
    suite: 'gap',
    text: 'The installer does not add this package to the dependencies of the target application.',
    breakIt: [
      'M2-AC-33 break-it: the installer leaves this repository manifests unchanged',
    ],
  },
  {
    id: 'M2-AC-34',
    milestone: 'M2',
    suite: 'gap',
    text: 'Re-running the installer replaces the links and leaves a working `pixel-gate --help`.',
    breakIt: [
      'M2-AC-34 break-it: a re-run does not nest or duplicate links',
    ],
  },
  {
    id: 'M2-AC-35',
    milestone: 'M2',
    suite: 'gap',
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
    suite: 'gap',
    text: 'A scripted prompt (fixed text, no requirement that a model invent a fix) returns stdout that parses as section 6 JSON in each of the three harnesses.',
    breakIt: [
      'M2-AC-36 break-it: stdout with prose around the JSON fails',
      'M2-AC-36 break-it: a report missing a section 6 key fails',
    ],
  },
  {
    id: 'M2-AC-37',
    milestone: 'M2',
    suite: 'gap',
    text: 'A recording of a live loop-until-green session may be attached to the PR. CI does not fail when that recording is absent or when the model stops short of `passed: true`.',
    breakIt: [
      'M2-AC-37 break-it: an attached recording is echoed and still never required',
    ],
  },
];
