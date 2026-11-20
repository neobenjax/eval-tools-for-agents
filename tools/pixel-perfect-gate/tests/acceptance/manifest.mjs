/**
 * Traceability map for enforced milestone acceptance criteria.
 * `text` must match the section 8 checkbox verbatim.
 * `suite: "pass"` is a green test (section 8 box checked).
 * `suite: "gap"` is an expected-fail test (section 8 box unchecked).
 * Ids are stable. Do not renumber them when a criterion is added.
 */
export const ENFORCED_MILESTONES = ['M1'];

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
];
