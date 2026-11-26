import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  acceptanceEditRequiresRationale,
  criterionTitle,
  defaultPullRequestTemplate,
  isAcceptedRationale,
  KNOWN_RATIONALE_PLACEHOLDERS,
  extractEnforcedCriteria,
  gapExecutionErrors,
  indexAcceptanceSources,
  readJsString,
  staticAcceptanceErrors,
} from './acceptance-lib.mjs';
import { runAcceptanceStatus } from './acceptance-status.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const packageRoot = path.join(repoRoot, 'tools', 'pixel-perfect-gate');
const manifestHref = pathToFileURL(path.join(packageRoot, 'tests', 'acceptance', 'manifest.mjs')).href;
const manifest = await import(manifestHref);

function realSpec() {
  return fs.readFileSync(path.join(repoRoot, 'SPEC.md'), 'utf8');
}

test('real SPEC section 8 M1 and M2 criteria match the manifest and test files', async () => {
  assert.deepEqual(manifest.ENFORCED_MILESTONES, ['M1', 'M2', 'M2b', 'M3']);
  const extracted = extractEnforcedCriteria(realSpec(), ['M1']);
  assert.deepEqual(extracted.errors, []);
  assert.deepEqual(
    [...new Set(extracted.criteria.map((criterion) => criterion.key))],
    ['SIDE-16', 'SIDE-24']
  );
  assert.equal(extracted.criteria.filter((criterion) => criterion.key === 'SIDE-16').length, 8);
  assert.equal(extracted.criteria.filter((criterion) => criterion.key === 'SIDE-24').length, 7);
  const crlf = extractEnforcedCriteria(realSpec().replace(/\n/g, '\r\n'), ['M1']);
  assert.deepEqual(crlf.criteria.map((criterion) => criterion.text), extracted.criteria.map((criterion) => criterion.text));

  const m2 = extractEnforcedCriteria(realSpec(), ['M2']);
  assert.deepEqual(m2.errors, []);
  const perIssue = {};
  for (const criterion of m2.criteria) perIssue[criterion.key] = (perIssue[criterion.key] || 0) + 1;
  assert.deepEqual(perIssue, {
    'SIDE-25': 5,
    'SIDE-26': 4,
    'SIDE-19': 8,
    'SIDE-27': 5,
    'SIDE-20': 7,
    'SIDE-21': 5,
    'SIDE-22': 3,
  });
  const m2Manifest = manifest.criteria.filter((entry) => entry.milestone === 'M2');
  assert.equal(m2Manifest.length, 37);
  assert.deepEqual(m2Manifest.map((entry) => entry.id), m2.criteria.map((_, i) => `M2-AC-${String(i + 1).padStart(2, '0')}`));

  const m2b = extractEnforcedCriteria(realSpec(), ['M2b']);
  assert.deepEqual(m2b.errors, []);
  const m2bPerIssue = {};
  for (const criterion of m2b.criteria) m2bPerIssue[criterion.key] = (m2bPerIssue[criterion.key] || 0) + 1;
  assert.deepEqual(m2bPerIssue, {
    'SIDE-28': 8,
    'SIDE-29': 6,
    'SIDE-30': 5,
    'SIDE-31': 5,
    'SIDE-32': 9,
    'SIDE-33': 8,
    'SIDE-34': 7,
    'SIDE-35': 4,
    'SIDE-36': 7,
  });
  const m2bManifest = manifest.criteria.filter((entry) => entry.milestone === 'M2b');
  assert.equal(m2bManifest.length, 59);
  assert.deepEqual(
    m2bManifest.map((entry) => entry.id),
    m2b.criteria.map((_, i) => `M2b-AC-${String(i + 1).padStart(2, '0')}`)
  );

  const code = await runAcceptanceStatus(['--static-only']);
  assert.equal(code, 0);
});

test('parser and manifest mutations fail closed', () => {
  const spec = realSpec();
  const extracted = extractEnforcedCriteria(spec, ['M1']);
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const baseInput = {
    specText: spec,
    manifest,
    acceptanceDir: path.join(packageRoot, 'tests', 'acceptance'),
    packageRoot,
    packageTestScript: packageJson.scripts.test,
  };
  assert.deepEqual(staticAcceptanceErrors(baseInput).errors, []);

  const missing = {
    ...manifest,
    criteria: manifest.criteria.slice(1),
  };
  assert.ok(staticAcceptanceErrors({ ...baseInput, manifest: missing }).errors.some((error) => error.includes('no manifest entry')));

  const extra = {
    ...manifest,
    criteria: [
      ...manifest.criteria,
      {
        id: 'M1-AC-99',
        milestone: 'M1',
        suite: 'gap',
        text: 'This criterion is not in section 8.',
        breakIt: [],
      },
    ],
  };
  assert.ok(staticAcceptanceErrors({ ...baseInput, manifest: extra }).errors.some((error) => error.includes('M1-AC-99')));

  const flipped = {
    ...manifest,
    criteria: manifest.criteria.map((entry) =>
      entry.id === 'M1-AC-09' ? { ...entry, suite: entry.suite === 'gap' ? 'pass' : 'gap' } : entry
    ),
  };
  assert.ok(staticAcceptanceErrors({ ...baseInput, manifest: flipped }).errors.some((error) => error.includes('M1-AC-09')));

  const empty = { ...manifest, criteria: [] };
  assert.ok(staticAcceptanceErrors({ ...baseInput, manifest: empty }).errors.length > 0);

  const capitalX = spec.replace(
    'Stdout for a pass, a gate failure',
    'IGNORED'
  ).replace(/- \[[ x]\] IGNORED/, '- [X] IGNORED');
  const capital = extractEnforcedCriteria(capitalX, ['M1']);
  assert.ok(capital.errors.some((error) => error.includes('capital X')));
  assert.equal(capital.criteria.some((criterion) => criterion.text.startsWith('IGNORED')), false);

  const duplicate = spec.replace(
    /- \[[ x]\] A fixture asserts the required keys\./,
    '- [ ] A fixture asserts the required keys.\n- [ ] A fixture asserts the required keys.'
  );
  assert.ok(extractEnforcedCriteria(duplicate, ['M1']).errors.some((error) => error.includes('Duplicate')));

  const unwired = packageJson.scripts.test.replace('tests/acceptance/m1-engine.acceptance.test.mjs', 'tests/acceptance/missing.acceptance.test.mjs');
  assert.ok(staticAcceptanceErrors({ ...baseInput, packageTestScript: unwired }).errors.some((error) => error.includes('does not run')));

  const tmpAccRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-gap-'));
  const tmpAccDir = path.join(tmpAccRoot, 'tests', 'acceptance');
  fs.cpSync(baseInput.acceptanceDir, tmpAccDir, { recursive: true });
  fs.mkdirSync(path.join(tmpAccDir, 'pending'), { recursive: true });
  fs.writeFileSync(path.join(tmpAccDir, 'pending', 'dummy.pending.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('M1-AC-09: dummy', () => { assert.fail('gap'); });\n");
  const runsGapDirectly = `${packageJson.scripts.test} tests/acceptance/pending/dummy.pending.mjs`;
  assert.ok(staticAcceptanceErrors({
    ...baseInput,
    packageRoot: tmpAccRoot,
    acceptanceDir: tmpAccDir,
    packageTestScript: runsGapDirectly,
  }).errors.some((error) => error.includes('must not run gap file')));
  fs.rmSync(tmpAccRoot, { recursive: true, force: true });

  const noStatus = packageJson.scripts.test.replace('acceptance-status.mjs', 'not-the-status-script.mjs');
  assert.ok(staticAcceptanceErrors({ ...baseInput, packageTestScript: noStatus }).errors.some((error) => error.includes('acceptance-status.mjs')));
});

test('skip, todo, and assert-free acceptance tests are rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-src-'));
  const skipped = path.join(dir, 'skip.test.mjs');
  fs.writeFileSync(skipped, "import test from 'node:test';\ntest.skip('hidden', () => { throw new Error('no'); });\n");
  const skipResult = indexAcceptanceSources([skipped]);
  assert.ok(skipResult.errors.some((error) => error.includes('skip')));

  const empty = path.join(dir, 'empty.test.mjs');
  fs.writeFileSync(empty, "import test from 'node:test';\ntest('M1-AC-01: empty', () => {});\n");
  const emptyResult = indexAcceptanceSources([empty]);
  assert.ok(emptyResult.errors.some((error) => error.includes('without an assert')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('gap execution must be an assertion failure, never a skip or a surprise pass', () => {
  const gap = { ...manifest.criteria.find((entry) => entry.id === 'M1-AC-09'), suite: 'gap' };
  const title = criterionTitle(gap);
  const header = `TAP version 13\n`;
  const footer = `
1..1
# tests 1
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
`;
  const failing = `${header}not ok 1 - ${title}\n  ---\n  failureType: 'testCodeFailure'\n  code: 'ERR_ASSERTION'\n  ...\n${footer}`;
  assert.deepEqual(gapExecutionErrors([gap], failing).errors, []);

  const passing = failing.replace('not ok 1', 'ok 1').replace('# pass 0', '# pass 1').replace('# fail 1', '# fail 0');
  assert.ok(gapExecutionErrors([gap], passing).errors.some((error) => error.includes('promoted')));

  const crashed = failing.replace("code: 'ERR_ASSERTION'", "code: 'ERR_TEST_FAILURE'");
  assert.ok(gapExecutionErrors([gap], crashed).errors.some((error) => error.includes('ERR_TEST_FAILURE')));

  const skipped = `TAP version 13\nok 1 - ${title} # SKIP\n  ---\n  ...\n1..1\n# tests 1\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n`;
  assert.ok(gapExecutionErrors([gap], skipped).errors.some((error) => error.includes('SKIP') || error.includes('skipped')));

  const cancelled = failing.replace('# cancelled 0', '# cancelled 1');
  assert.ok(gapExecutionErrors([gap], cancelled).errors.some((error) => error.includes('cancelled')));

  const hashed = { ...manifest.criteria.find((entry) => entry.id === 'M1-AC-15'), suite: 'gap' };
  const escaped = criterionTitle(hashed).replaceAll('#', '\\#');
  const hashedTap = `TAP version 13\nnot ok 1 - ${escaped}\n  ---\n  failureType: 'testCodeFailure'\n  code: 'ERR_ASSERTION'\n  ...\n1..1\n# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n`;
  assert.deepEqual(gapExecutionErrors([hashed], hashedTap).errors, []);

  const parent = 'M1-AC-01: Unchecked example criterion';
  const gapBreak = 'M1-AC-01 break-it: still a gap';
  const shippedBreak = 'M1-AC-01 break-it: already shipped';
  const mixed = {
    id: 'M1-AC-01',
    suite: 'gap',
    text: 'Unchecked example criterion',
    breakIt: [gapBreak, { title: shippedBreak, suite: 'pass' }],
  };
  const mixedTap = `TAP version 13
not ok 1 - ${parent}
  ---
  failureType: 'testCodeFailure'
  code: 'ERR_ASSERTION'
  ...
not ok 2 - ${gapBreak}
  ---
  failureType: 'testCodeFailure'
  code: 'ERR_ASSERTION'
  ...
1..2
# tests 2
# pass 0
# fail 2
# cancelled 0
# skipped 0
# todo 0
`;
  assert.deepEqual(gapExecutionErrors([mixed], mixedTap).errors, []);
  const gapBreakPasses = mixedTap.replace(`not ok 2 - ${gapBreak}`, `ok 2 - ${gapBreak}`).replace('# pass 0', '# pass 1').replace('# fail 2', '# fail 1');
  const promoted = gapExecutionErrors([mixed], gapBreakPasses).errors;
  assert.equal(promoted.length, 1);
  assert.match(promoted[0], new RegExp(`promoted to the green suite: ${gapBreak}`));
  assert.equal(promoted.some((error) => error.includes(shippedBreak)), false);
});

test('changing an existing acceptance file requires a rationale line; additions do not', () => {
  const added = 'A\ttools/pixel-perfect-gate/tests/acceptance/manifest.mjs\n';
  assert.equal(acceptanceEditRequiresRationale(added, '').ok, true);

  const unwatched = 'M\tREADME.md\n';
  assert.equal(acceptanceEditRequiresRationale(unwatched, '').ok, true);

  const modified = 'M\tscripts/verify.mjs\nM\t.github/workflows/ci.yml\n';
  const blocked = acceptanceEditRequiresRationale(modified, '');
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /Acceptance-test change rationale:/);

  const crlf = 'M\tscripts\\verify.mjs\r\n';
  assert.equal(acceptanceEditRequiresRationale(crlf, '').ok, false);
  const explained = 'Acceptance-test change rationale: the assertion changed because the criterion text changed.';
  assert.equal(acceptanceEditRequiresRationale(modified, explained).ok, true);
  assert.equal(acceptanceEditRequiresRationale(modified, 'Acceptance-test change rationale:').ok, false);
  assert.equal(acceptanceEditRequiresRationale(modified, 'Acceptance-test change rationale: n/a').ok, false);
  assert.equal(acceptanceEditRequiresRationale(modified, 'Acceptance-test change rationale: none').ok, false);

  const template = defaultPullRequestTemplate();
  assert.match(template, /Acceptance-test change rationale:\s*$/m);
  assert.equal(acceptanceEditRequiresRationale(modified, template).ok, false);
  assert.equal(isAcceptedRationale(KNOWN_RATIONALE_PLACEHOLDERS[0], template), false);
  const oldHint = `Acceptance-test change rationale: ${KNOWN_RATIONALE_PLACEHOLDERS[0]}`;
  assert.equal(acceptanceEditRequiresRationale(modified, oldHint).ok, false);
  assert.equal(acceptanceEditRequiresRationale(modified, `${template}\n${explained}`).ok, true);
});

test('status command exits 0 when gap tests fail their assertions and 1 when a gap test passes', () => {
  const passingGap = writeFixture(false);
  const failingGap = writeFixture(true);
  const wiredWrong = writeFixture(false, { testScriptExtra: ' tests/acceptance/gap.pending.mjs' });
  try {
    const expectedGap = runStatus(failingGap);
    assert.equal(expectedGap.status, 0, `${expectedGap.stdout}\n${expectedGap.stderr}`);
    assert.match(expectedGap.stdout, /GAP/);

    const promoted = runStatus(passingGap);
    assert.notEqual(promoted.status, 0);
    assert.match(`${promoted.stdout}\n${promoted.stderr}`, /promoted/);

    const directGap = runStatus(wiredWrong);
    assert.notEqual(directGap.status, 0);
    assert.match(`${directGap.stdout}\n${directGap.stderr}`, /must not run gap file/);
  } finally {
    fs.rmSync(passingGap, { recursive: true, force: true });
    fs.rmSync(failingGap, { recursive: true, force: true });
    fs.rmSync(wiredWrong, { recursive: true, force: true });
  }
});

function writeFixture(gapShouldFail, { testScriptExtra = '' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-fixture-'));
  const acceptanceDir = path.join(dir, 'tests', 'acceptance');
  fs.mkdirSync(acceptanceDir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SPEC.md'), `# fixture

## 4. Matrix

- [ ] **SIDE-99** \`[M1.9]\` example

## 5. Other

## 8. Acceptance

### SIDE-99 example

- [ ] Unchecked example criterion
- [x] Checked example criterion

## 9. Order

SIDE-99 stays cited.

## 10. End
`);
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(
    path.join(acceptanceDir, 'manifest.mjs'),
    `export const ENFORCED_MILESTONES = ['M1'];
export const criteria = [
  { id: 'M1-AC-01', milestone: 'M1', suite: 'gap', text: 'Unchecked example criterion', breakIt: [] },
  { id: 'M1-AC-02', milestone: 'M1', suite: 'pass', text: 'Checked example criterion', breakIt: [] },
];
`
  );
  fs.writeFileSync(
    path.join(acceptanceDir, 'green.test.mjs'),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('M1-AC-02: Checked example criterion', () => {\n  assert.equal(1, 1);\n});\n"
  );
  fs.writeFileSync(
    path.join(acceptanceDir, 'gap.pending.mjs'),
    `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('M1-AC-01: Unchecked example criterion', () => {\n  assert.equal(1, ${gapShouldFail ? 2 : 1});\n});\n`
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      type: 'module',
      scripts: {
        test: `node --test tests/acceptance/green.test.mjs && node acceptance-status.mjs${testScriptExtra}`,
      },
    })
  );
  return dir;
}

function runStatus(dir) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'acceptance-status.mjs')], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      ACCEPTANCE_REPO_ROOT: dir,
      ACCEPTANCE_PACKAGE_ROOT: dir,
      ACCEPTANCE_SPEC: path.join(dir, 'SPEC.md'),
      ACCEPTANCE_MANIFEST: path.join(dir, 'tests', 'acceptance', 'manifest.mjs'),
      ACCEPTANCE_DIR: path.join(dir, 'tests', 'acceptance'),
      ACCEPTANCE_PACKAGE_JSON: path.join(dir, 'package.json'),
    },
  });
}

test('a green break-it under an unchecked criterion is enforced, and a gap test that starts passing still fails', () => {
  const shipped = [
    'M2b-AC-19 break-it: a Gate 1 finding does not grow refBox, expected, or actual keys',
  ];
  const spec = realSpec();
  for (const title of shipped) {
    const id = title.slice(0, 'M2b-AC-00'.length);
    const entry = manifest.criteria.find((item) => item.id === id);
    assert.equal(entry.suite, 'pass', `${id} is now promoted to pass`);
    assert.ok(spec.includes(`- [x] ${entry.text}`), `${id} section 8 box is checked`);
    assert.deepEqual(
      entry.breakIt.find((item) => item && item.title === title),
      { title, suite: 'pass' }
    );
  }

  const happy = writeShippedFixture();
  const passingGapBreak = writeShippedFixture({ gapBreakPasses: true });
  const shippedLeftInGap = writeShippedFixture({ shippedIn: 'gap' });
  const gapBreakInGreen = writeShippedFixture({ gapBreakIn: 'green' });
  try {
    const input = (dir) => ({
      specText: fs.readFileSync(path.join(dir, 'SPEC.md'), 'utf8'),
      manifest: loadFixtureManifest(dir),
      acceptanceDir: path.join(dir, 'tests', 'acceptance'),
      packageRoot: dir,
      packageTestScript: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts.test,
    });
    assert.deepEqual(staticAcceptanceErrors(input(happy)).errors, []);
    const held = runStatus(happy);
    assert.equal(held.status, 0, `${held.stdout}\n${held.stderr}`);
    assert.match(held.stdout, /1 green break-it tests are enforced under gap criteria/);

    const surprise = runStatus(passingGapBreak);
    assert.notEqual(surprise.status, 0);
    assert.match(`${surprise.stdout}\n${surprise.stderr}`, /M1-AC-01 break-it: still a gap/);
    assert.match(`${surprise.stdout}\n${surprise.stderr}`, /promoted/);

    const stillGapFile = staticAcceptanceErrors(input(shippedLeftInGap)).errors;
    assert.ok(stillGapFile.some((error) => error.includes('already shipped') && error.includes('pass file')));
    const earlyGreen = staticAcceptanceErrors(input(gapBreakInGreen)).errors;
    assert.ok(earlyGreen.some((error) => error.includes('still a gap') && error.includes('gap file')));

    const manifestText = fs.readFileSync(path.join(happy, 'tests', 'acceptance', 'manifest.mjs'), 'utf8');
    fs.writeFileSync(
      path.join(happy, 'tests', 'acceptance', 'manifest.mjs'),
      manifestText.replace("suite: 'pass' },", "suite: 'nope' },")
    );
    assert.ok(staticAcceptanceErrors(input(happy)).errors.some((error) => error.includes('title string or')));

    const checkedSpec = fs.readFileSync(path.join(gapBreakInGreen, 'SPEC.md'), 'utf8').replace(
      '- [ ] Unchecked example criterion',
      '- [x] Unchecked example criterion'
    );
    fs.writeFileSync(path.join(gapBreakInGreen, 'SPEC.md'), checkedSpec);
    fs.writeFileSync(
      path.join(gapBreakInGreen, 'tests', 'acceptance', 'manifest.mjs'),
      manifestText
        .replace("suite: 'gap',\n    text: 'Unchecked example criterion'", "suite: 'pass',\n    text: 'Unchecked example criterion'")
        .replace("{ title: 'M1-AC-01 break-it: already shipped', suite: 'pass' }", "{ title: 'M1-AC-01 break-it: already shipped', suite: 'gap' }")
    );
    assert.ok(staticAcceptanceErrors(input(gapBreakInGreen)).errors.some((error) => error.includes('cannot stay in the gap suite')));
  } finally {
    for (const dir of [happy, passingGapBreak, shippedLeftInGap, gapBreakInGreen]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function loadFixtureManifest(dir) {
  const source = fs.readFileSync(path.join(dir, 'tests', 'acceptance', 'manifest.mjs'), 'utf8');
  const exported = source.replace('export const ENFORCED_MILESTONES', 'const ENFORCED_MILESTONES').replace('export const criteria', 'const criteria');
  return new Function(`${exported}; return { ENFORCED_MILESTONES, criteria };`)();
}

function writeShippedFixture({ gapBreakPasses = false, shippedIn = 'green', gapBreakIn = 'gap' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-shipped-'));
  const acceptanceDir = path.join(dir, 'tests', 'acceptance');
  fs.mkdirSync(acceptanceDir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SPEC.md'), `# fixture

## 4. Matrix

- [ ] **SIDE-99** \`[M1.9]\` example

## 5. Other

## 8. Acceptance

### SIDE-99 example

- [ ] Unchecked example criterion
- [x] Checked example criterion

## 9. Order

## 10. End
`);
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# fixture\n');
  fs.writeFileSync(
    path.join(acceptanceDir, 'manifest.mjs'),
    `export const ENFORCED_MILESTONES = ['M1'];
export const criteria = [
  {
    id: 'M1-AC-01',
    milestone: 'M1',
    suite: 'gap',
    text: 'Unchecked example criterion',
    breakIt: [
      'M1-AC-01 break-it: still a gap',
      { title: 'M1-AC-01 break-it: already shipped', suite: 'pass' },
    ],
  },
  { id: 'M1-AC-02', milestone: 'M1', suite: 'pass', text: 'Checked example criterion', breakIt: [] },
];
`
  );
  const header = "import test from 'node:test';\nimport assert from 'node:assert/strict';\n";
  const shippedBody = "test('M1-AC-01 break-it: already shipped', () => {\n  assert.equal(1, 1);\n});\n";
  const gapBreakBody = `test('M1-AC-01 break-it: still a gap', () => {\n  assert.equal(1, ${gapBreakPasses ? 1 : 2});\n});\n`;
  const greenParts = [
    `${header}test('M1-AC-02: Checked example criterion', () => {\n  assert.equal(1, 1);\n});\n`,
  ];
  const gapParts = [
    `${header}test('M1-AC-01: Unchecked example criterion', () => {\n  assert.equal(1, 2);\n});\n`,
  ];
  if (shippedIn === 'green') greenParts.push(shippedBody);
  else gapParts.push(shippedBody);
  if (gapBreakIn === 'gap') gapParts.push(gapBreakBody);
  else greenParts.push(gapBreakBody);
  fs.writeFileSync(path.join(acceptanceDir, 'green.test.mjs'), greenParts.join('\n'));
  fs.writeFileSync(path.join(acceptanceDir, 'gap.pending.mjs'), gapParts.join('\n'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      type: 'module',
      scripts: { test: 'node --test tests/acceptance/green.test.mjs && node acceptance-status.mjs' },
    })
  );
  return dir;
}

test('real SPEC section 8 M3 criteria are the four viewer boxes', () => {
  const m3 = extractEnforcedCriteria(realSpec(), ['M3']);
  assert.deepEqual(m3.errors, []);
  assert.deepEqual([...new Set(m3.criteria.map((criterion) => criterion.key))], ['SIDE-23']);
  assert.equal(m3.criteria.length, 4);
  assert.deepEqual(m3.criteria.map((criterion) => criterion.checked), [true, true, true, true]);
  const m3Manifest = manifest.criteria.filter((entry) => entry.milestone === 'M3');
  assert.deepEqual(
    m3Manifest.map((entry) => entry.id),
    m3.criteria.map((_, index) => `M3-AC-${String(index + 1).padStart(2, '0')}`)
  );
  assert.deepEqual(m3Manifest.map((entry) => entry.text), m3.criteria.map((criterion) => criterion.text));
});

test('acceptance titles unescape apostrophes so a criterion can contain one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-title-'));
  const file = path.join(dir, 'quote.pending.mjs');
  fs.writeFileSync(
    file,
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('it\\'s a title', () => {\n  assert.equal(1, 1);\n});\n"
  );
  try {
    const indexed = indexAcceptanceSources([file]);
    assert.deepEqual(indexed.errors, []);
    assert.deepEqual(indexed.tests.map((item) => item.title), ["it's a title"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify.mjs and CI keep the acceptance gate wired', () => {
  const verify = fs.readFileSync(path.join(repoRoot, 'scripts', 'verify.mjs'), 'utf8');
  const ci = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  const pkg = fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8');
  assert.match(verify, /acceptance-status\.test\.mjs/);
  assert.match(pkg, /acceptance-status\.mjs/);
  assert.match(ci, /PR_BODY:/);
  assert.match(ci, /verify\.mjs/);
});

test('readJsString round-trips a title with an apostrophe, quotes, and a hash', () => {
  const title = `the user's "kind: \\"png\\"" and #wpadminbar`;
  const source = `serialTest(${JSON.stringify(title)}, async () => {\n  assert.equal(1, 2);\n});\n`;
  const start = source.match(/\b(?:test|serialTest)\(\s*(?=['"`])/);
  assert.ok(start);
  assert.equal(readJsString(source, start.index + start[0].length), title);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm2b-title-'));
  const plain = path.join(dir, 'plain.pending.mjs');
  fs.writeFileSync(plain, source);
  const regexCall = path.join(dir, 'regex.pending.mjs');
  fs.writeFileSync(regexCall, "test('kept', () => {\n  assert.equal(/docker/i.test(String('docker')), true);\n});\n");
  const indexed = indexAcceptanceSources([plain, regexCall]);
  assert.deepEqual(indexed.errors, []);
  assert.deepEqual(indexed.tests.map((found) => found.title), [title, 'kept']);

  const skipped = path.join(dir, 'skip.pending.mjs');
  fs.writeFileSync(skipped, "test.skip('hidden', () => { assert.equal(1, 1); });\n");
  assert.ok(indexAcceptanceSources([skipped]).errors.some((error) => error.includes('skip or todo')));

  const noAssert = path.join(dir, 'empty.pending.mjs');
  fs.writeFileSync(noAssert, "test('empty', () => {\n  return 1;\n});\n");
  assert.ok(indexAcceptanceSources([noAssert]).errors.some((error) => error.includes('without an assert')));
});
