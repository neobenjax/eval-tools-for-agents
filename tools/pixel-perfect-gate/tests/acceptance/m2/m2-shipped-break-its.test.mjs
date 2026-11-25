/**
 * Green break-its under still-unchecked criteria (M2-AC-02, M2-AC-04, M2-AC-05, M2-AC-18, M2-AC-21).
 * Registered in the manifest as { title, suite: "pass" }. Assertions are unchanged from the gap
 * files they moved out of. The section 8 boxes stay unchecked until each criterion's own test passes.
 * When another gap break-it starts passing early, move it here the same way (SPEC.md section 13).
 * Section 6: schemaVersion 1; gates.gate1/gate2/gate3; findings[].id is the stable branch key;
 * error is null or { message }; a skipped gate is { passed: true, skipped: true, reason };
 * --help and --version are the only non-JSON exits. Playwright is pinned to 1.65.1.
 * mismatchPct blocks on ubuntu-latest; Windows and macOS report it (guard process.platform !== "win32").
 * Editing this file requires "Acceptance-test change rationale:" in the PR body.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  cliPath,
  diffTrees,
  envelopeProblems,
  findingsOf,
  freshDir,
  makeRepo,
  netSpy,
  runGate,
  runNode,
  snapshotTree,
  withServer,
} from '../m2-helpers.mjs';

const HOME_URL = '/m2/site/home.html';
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

serialTest('M2-AC-02 break-it: running with no arguments and no config prints one section 6 error object', async () => {
  const cwd = freshDir('ac02-noargs');
  const result = await runNode([cliPath], { cwd });
  assert.equal(result.code, 1, 'no arguments and no config is a failed run');
  assert.deepEqual(envelopeProblems(result.json), [], 'the failure is one section 6 object, not commander text');
  assert.equal(result.json.passed, false);
  assert.ok(result.json.error && result.json.error.message, 'the error object explains the missing config');
});

serialTest('M2-AC-04 break-it: a failing run writes only under .visual-eval/ and invents no reference', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac04-fail', server.baseUrl, { refs: [] });
    const before = snapshotTree(repo);
    const result = await runGate(repo, []);
    assert.equal(result.code, 1, 'a route with no reference fails');
    assert.deepEqual(envelopeProblems(result.json), [], 'the failure is one section 6 object');
    const diff = diffTrees(before, snapshotTree(repo));
    for (const file of diff.added) assert.ok(file.startsWith('.visual-eval/'), `wrote outside .visual-eval/: ${file}`);
    assert.equal(fs.existsSync(path.join(repo, 'references')), false, 'the tool never saves a screenshot as a reference');
    assert.deepEqual(diff.changed, [], 'no existing file changes');
  });
});

serialTest('M2-AC-05 break-it: --url without --ref runs Gate 1 only and reports Gate 2 as skipped', async () => {
  await withServer(async (server) => {
    const cwd = freshDir('ac05-gate1');
    const result = await runGate(cwd, ['--url', `${server.baseUrl}${HOME_URL}`]);
    assert.deepEqual(envelopeProblems(result.json), [], 'a Gate 1 only run prints a section 6 object');
    assert.equal(result.json.gates.gate2.skipped, true, 'Gate 2 is skipped without a reference');
    assert.equal(result.json.gates.gate2.passed, true);
    assert.equal(typeof result.json.gates.gate2.reason, 'string');
    assert.equal(result.json.gates.gate1.skipped === true, false, 'Gate 1 ran');
  });
});

serialTest('M2-AC-18 break-it: passed depends only on the deterministic gates when vision is off', async () => {
  await visionRun(
    'ac18-detfail',
    { vision: { enabled: false }, page: MISMATCH, verdict: { passed: true, text: 'Looks fine' } },
    async ({ result }) => {
      assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
      assert.equal(result.code, 1, 'a deterministic Gate 2 failure fails the run');
      assert.equal(result.json.passed, false, 'a passing verdict cannot rescue it when vision is off');
      assert.equal(verdictFinding(result.json), undefined);
    }
  );
});

serialTest('M2-AC-21 break-it: a blocking passing verdict cannot rescue a deterministic failure', async () => {
  await visionRun(
    'ac21-rescue',
    { vision: { enabled: true, blocking: true }, page: MISMATCH, verdict: { passed: true, text: 'Looks fine to me' } },
    async ({ result }) => {
      assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
      assert.equal(result.code, 1, 'Gate 2 mismatch still fails the run');
      assert.equal(result.json.passed, false);
    }
  );
});
