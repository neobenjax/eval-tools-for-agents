/**
 * SIDE-27 (M2.1b) optional vision pass, off by default and advisory.
 * Config key: vision { enabled, blocking } (both default false). Flag: --vision-verdict <file>.
 * When enabled, the report exposes `artifacts.composite` and top-level `findings` without opening any model network connection.
 * The verdict becomes the `info` finding `gate2.vision-verdict`; it is `fail` only when blocking
 * is true and the verdict says `passed: false`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  envelopeProblems,
  findingIds,
  findingsOf,
  freshDir,
  isPng,
  makeRepo,
  netSpy,
  runGate,
  withServer,
} from '../m2-helpers.mjs';

const MATCH = '/m2/site/home.html';
const MISMATCH = '/m2/site/about.html';
const VERDICT_ID = 'gate2.vision-verdict';

async function visionRun(name, { vision, page = MATCH, verdict, verdictPath, args = [] }, body) {
  return withServer(async (server) => {
    const spy = netSpy(freshDir(`${name}-spy`));
    const { repo, configPath } = makeRepo(name, server.baseUrl, {
      refs: ['home/desktop'],
      config: {
        viewports: [{ name: 'desktop', width: 400, height: 300 }],
        routes: [{ id: 'home', path: page, referenceRequired: true }],
        vision,
      },
    });
    const flags = [];
    let verdictFile = null;
    if (verdict !== undefined) {
      verdictFile = path.join(repo, 'verdict.json');
      fs.writeFileSync(verdictFile, typeof verdict === 'string' ? verdict : JSON.stringify(verdict));
    }
    if (verdictPath !== undefined) {
      verdictFile = verdictPath === '<repo>' ? repo : verdictPath === '<missing>' ? path.join(repo, 'no-such-verdict.json') : verdictPath;
    }
    if (verdictFile) flags.push('--vision-verdict', verdictFile);
    const result = await runGate(repo, ['--config', configPath, ...flags, ...args], spy.env);
    return body({ result, repo, spy, server });
  });
}

function verdictFinding(report) {
  return findingsOf(report).find((f) => f.id === VERDICT_ID);
}

serialTest('M2-AC-18: With `vision.enabled` false or omitted, the CLI makes no vision call and does not read a verdict file. `passed` depends only on deterministic gates.', async () => {
  // Vision omitted and the verdict path is a directory: reading it would throw EISDIR.
  await visionRun('ac18-omitted', { vision: undefined, verdictPath: '<repo>' }, async ({ result, spy }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 0, 'an unreadable verdict is ignored when vision is off');
    assert.equal(result.json.passed, true);
    assert.equal(result.json.error, null, 'the verdict file was not read, so it cannot be an error');
    assert.equal('vision' in result.json, false, 'no vision field when vision is off');
    assert.equal(findingIds(result.json).some((id) => id.includes('vision')), false, 'no vision finding');
    assert.deepEqual(spy.lines(), [], 'no connection to a non-loopback host');
  });
  // vision.enabled false with a readable verdict that says fail: still ignored.
  await visionRun(
    'ac18-disabled',
    { vision: { enabled: false, blocking: true }, verdict: { passed: false, text: 'Looks wrong' } },
    async ({ result, spy }) => {
      assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
      assert.equal(result.code, 0, 'a failing verdict cannot fail the run while vision is disabled, even with blocking true');
      assert.equal(result.json.passed, true);
      assert.equal(verdictFinding(result.json), undefined, 'the verdict text is not copied when vision is off');
      assert.equal('vision' in result.json, false);
      assert.deepEqual(spy.lines(), []);
    }
  );
});

serialTest('M2-AC-19: With `vision.enabled` true, the report adds the composite PNG path and the `findings` array on a field the caller can read (`artifacts.composite` and `findings`). The CLI still does not open a network connection to a model.', async () => {
  await visionRun('ac19-match', { vision: { enabled: true } }, async ({ result, repo, spy }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 0);
    const { artifacts, findings } = result.json;
    assert.equal(typeof artifacts?.composite, 'string', 'artifacts.composite is a path');
    assert.ok(isPng(path.resolve(repo, artifacts.composite)), 'the composite is a PNG that exists relative to the repo');
    assert.ok(Array.isArray(findings), 'findings array is present');
    assert.deepEqual(spy.lines(), [], 'the CLI opens no connection to a model');
  });
});

serialTest('M2-AC-19 break-it: with a Gate 2 mismatch the vision field carries the same findings and a composite', async () => {
  await visionRun('ac19-mismatch', { vision: { enabled: true }, page: MISMATCH }, async ({ result, repo, spy }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 1, 'the mismatch fails Gate 2');
    assert.ok(result.json.findings.length > 0, 'a mismatch produces findings');
    const composite = result.json.artifacts?.composite || result.json.vision?.composite;
    assert.equal(typeof composite, 'string', 'composite is a path');
    assert.ok(isPng(path.resolve(repo, composite)), 'the composite PNG exists relative to the repo');
    assert.deepEqual(spy.lines(), [], 'the CLI opens no connection to a model');
  });
});

serialTest('M2-AC-20: A caller may pass a verdict JSON (`--vision-verdict <file>`) with `{ "passed": boolean, "text": string }`. The text is copied into an `info` finding.', async () => {
  const text = 'Hero spacing looks tight on mobile';
  await visionRun(
    'ac20-fail',
    { vision: { enabled: true }, verdict: { passed: false, text } },
    async ({ result, spy }) => {
      assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
      const finding = verdictFinding(result.json);
      assert.ok(finding, `expected ${VERDICT_ID}, got ${findingIds(result.json).join(', ')}`);
      assert.equal(finding.severity, 'info');
      assert.equal(finding.gate, 'gate2');
      assert.equal(finding.text, text, 'the verdict text is copied verbatim');
      assert.equal(finding.selector, '');
      assert.equal(finding.box, null);
      assert.deepEqual(spy.lines(), []);
    }
  );
  await visionRun(
    'ac20-pass',
    { vision: { enabled: true }, verdict: { passed: true, text: 'Matches the design' } },
    async ({ result }) => {
      const finding = verdictFinding(result.json);
      assert.ok(finding, 'a passing verdict also produces an info finding');
      assert.equal(finding.severity, 'info');
      assert.equal(finding.text, 'Matches the design');
    }
  );
});

serialTest('M2-AC-20 break-it: a malformed verdict fails closed with an error', async () => {
  const cases = {
    'not json': 'this is not json',
    'missing text': { passed: true },
    'missing passed': { text: 'hello' },
    'passed is a string': { passed: 'yes', text: 'hello' },
    'text is a number': { passed: true, text: 42 },
    'array instead of object': [{ passed: true, text: 'hello' }],
  };
  for (const [label, verdict] of Object.entries(cases)) {
    await visionRun(`ac20-bad-${label.replace(/\W+/g, '-')}`, { vision: { enabled: true }, verdict }, async ({ result }) => {
      assert.deepEqual(envelopeProblems(result.json), [], `${label}: the run prints one section 6 object`);
      assert.equal(result.code, 1, `${label}: a malformed verdict fails the run`);
      assert.equal(result.json.passed, false, `${label}: passed is false`);
      assert.ok(result.json.error && /verdict/i.test(result.json.error.message), `${label}: error.message names the verdict`);
    });
  }
  await visionRun(
    'ac20-missing-file',
    { vision: { enabled: true }, verdictPath: '<missing>' },
    async ({ result }) => {
      assert.deepEqual(envelopeProblems(result.json), [], 'a missing verdict file prints one section 6 object');
      assert.equal(result.code, 1, 'a verdict file that was asked for and cannot be read fails the run');
      assert.ok(result.json.error && /verdict/i.test(result.json.error.message));
    }
  );
});

serialTest('M2-AC-21: That verdict does not change `passed` unless `vision.blocking` is true. The default is false.', async () => {
  const fail = { passed: false, text: 'Verdict says fail' };
  await visionRun('ac21-default', { vision: { enabled: true }, verdict: fail }, async ({ result }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 0, 'blocking defaults to false, so a failing verdict does not change the exit code');
    assert.equal(result.json.passed, true);
    assert.equal(verdictFinding(result.json)?.severity, 'info');
  });
  await visionRun('ac21-blocking', { vision: { enabled: true, blocking: true }, verdict: fail }, async ({ result }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 1, 'a blocking failing verdict forces exit 1');
    assert.equal(result.json.passed, false);
    assert.equal(result.json.exitCode, 1);
    const finding = verdictFinding(result.json);
    assert.ok(finding, 'the verdict finding is reported');
    assert.equal(finding.severity, 'fail', 'only a fail finding can set passed to false');
  });
  await visionRun(
    'ac21-blocking-pass',
    { vision: { enabled: true, blocking: true }, verdict: { passed: true, text: 'Verdict says pass' } },
    async ({ result }) => {
      assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
      assert.equal(result.code, 0, 'a blocking passing verdict leaves the run passing');
      assert.equal(verdictFinding(result.json)?.severity, 'info');
    }
  );
});

serialTest('M2-AC-21 break-it: blocking true without a verdict file changes nothing', async () => {
  await visionRun('ac21-noverdict', { vision: { enabled: true, blocking: true } }, async ({ result }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 0, 'no verdict means no vision effect on passed');
    assert.equal(result.json.passed, true);
    assert.equal(verdictFinding(result.json), undefined, 'no verdict finding without a verdict');
  });
});

serialTest('M2-AC-22: A test covers enabled+non-blocking (deterministic pass stays pass even if the verdict says fail) and blocking (verdict fail forces exit `1`).', async () => {
  const rows = [];
  for (const blocking of [false, true]) {
    for (const deterministic of ['pass', 'fail']) {
      for (const verdictPassed of [true, false]) {
        rows.push({ blocking, deterministic, verdictPassed });
      }
    }
  }
  assert.equal(rows.length, 8, 'the truth table has eight rows');
  for (const row of rows) {
    const label = `blocking=${row.blocking} deterministic=${row.deterministic} verdict=${row.verdictPassed ? 'pass' : 'fail'}`;
    const expectedPassed = row.deterministic === 'pass' && (!row.blocking || row.verdictPassed);
    await visionRun(
      `ac22-${label.replace(/\W+/g, '-')}`,
      {
        vision: { enabled: true, blocking: row.blocking },
        page: row.deterministic === 'pass' ? MATCH : MISMATCH,
        verdict: { passed: row.verdictPassed, text: label },
      },
      async ({ result }) => {
        assert.deepEqual(envelopeProblems(result.json), [], `${label}: the run prints one section 6 object`);
        assert.equal(result.json.passed, expectedPassed, `${label}: passed`);
        assert.equal(result.code, expectedPassed ? 0 : 1, `${label}: exit code`);
        assert.equal(result.json.exitCode, expectedPassed ? 0 : 1, `${label}: exitCode`);
        assert.equal(verdictFinding(result.json)?.text, label, `${label}: verdict text is copied`);
      }
    );
  }
});
