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
  assert.deepEqual(manifest.ENFORCED_MILESTONES, ['M1', 'M2']);
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
    criteria: manifest.criteria.map((entry) => (entry.id === 'M1-AC-09' ? { ...entry, suite: 'pass' } : entry)),
  };
  assert.ok(staticAcceptanceErrors({ ...baseInput, manifest: flipped }).errors.some((error) => error.includes('M1-AC-09')));

  const empty = { ...manifest, criteria: [] };
  assert.ok(staticAcceptanceErrors({ ...baseInput, manifest: empty }).errors.length > 0);

  const capitalX = spec.replace(
    'Stdout for a pass, a gate failure',
    'IGNORED'
  ).replace('- [ ] IGNORED', '- [X] IGNORED');
  const capital = extractEnforcedCriteria(capitalX, ['M1']);
  assert.ok(capital.errors.some((error) => error.includes('capital X')));
  assert.equal(capital.criteria.some((criterion) => criterion.text.startsWith('IGNORED')), false);

  const duplicate = spec.replace(
    '- [ ] A fixture asserts the required keys.',
    '- [ ] A fixture asserts the required keys.\n- [ ] A fixture asserts the required keys.'
  );
  assert.ok(extractEnforcedCriteria(duplicate, ['M1']).errors.some((error) => error.includes('Duplicate')));

  const unwired = packageJson.scripts.test.replace('tests/acceptance/m1-engine.acceptance.test.mjs', 'tests/acceptance/missing.acceptance.test.mjs');
  assert.ok(staticAcceptanceErrors({ ...baseInput, packageTestScript: unwired }).errors.some((error) => error.includes('does not run')));

  const runsGapDirectly = `${packageJson.scripts.test} tests/acceptance/pending/m1-report.pending.mjs`;
  assert.ok(staticAcceptanceErrors({ ...baseInput, packageTestScript: runsGapDirectly }).errors.some((error) => error.includes('must not run gap file')));

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
  const gap = manifest.criteria.find((entry) => entry.id === 'M1-AC-09');
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

  const hashed = manifest.criteria.find((entry) => entry.id === 'M1-AC-15');
  const escaped = criterionTitle(hashed).replaceAll('#', '\\#');
  const hashedTap = `TAP version 13\nnot ok 1 - ${escaped}\n  ---\n  failureType: 'testCodeFailure'\n  code: 'ERR_ASSERTION'\n  ...\n1..1\n# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n`;
  assert.deepEqual(gapExecutionErrors([hashed], hashedTap).errors, []);
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

test('verify.mjs and CI keep the acceptance gate wired', () => {
  const verify = fs.readFileSync(path.join(repoRoot, 'scripts', 'verify.mjs'), 'utf8');
  const ci = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  const pkg = fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8');
  assert.match(verify, /acceptance-status\.test\.mjs/);
  assert.match(pkg, /acceptance-status\.mjs/);
  assert.match(ci, /PR_BODY:/);
  assert.match(ci, /verify\.mjs/);
});
