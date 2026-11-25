/**
 * M2b.3 audit loop contract. Gap tests assert the section 12.6 loop object.
 * They fail with ERR_ASSERTION until the product writes it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  compare,
  findingIds,
  findings,
  freshDir,
  makeWork,
  pixelSourceOfTruth,
  seedTelemetry,
  telemetryRow,
  writeJson,
  writePng,
  solid,
} from '../m2b-helpers.mjs';

const VIEW = [{ name: 'desktop', width: 400, height: 300 }];
const SPILL = '<!doctype html><html><body style="margin:0"><div id="spill" style="width:900px;height:20px">spill</div></body></html>';
const CLEAN = '<!doctype html><html><body style="margin:0"><main>clean</main></body></html>';
const SPILL_ID = 'gate1.overflow.div-spill';

function pageRepo(name, html, extra = {}) {
  const repo = freshDir('m2b', name);
  fs.writeFileSync(path.join(repo, 'page.html'), html);
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/page.html', referenceRequired: false }],
    target: { kind: 'static', file: path.join(repo, 'page.html') },
    ...extra,
  });
  return repo;
}

function loopOf(result) {
  return result.json && result.json.loop;
}

/** 400x300 white reference and a 40x300 green block: 12000/120000 pixels, mismatchPct 10. */
function mismatchRepo(name, runId, previous) {
  const repo = freshDir('m2b', name);
  writePng(path.join(repo, 'references', 'home', 'desktop.png'), 400, 300, solid(255, 255, 255));
  const page = path.join(repo, 'page.html');
  fs.writeFileSync(page, '<!doctype html><html><body style="margin:0;background:#fff"><div style="width:40px;height:300px;background:#00ff00"></div></body></html>');
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    maxDiff: 0.5,
    threshold: 0.1,
    references: 'references',
    routes: [{ id: 'home', path: '/page.html', referenceRequired: true }],
    target: { kind: 'static', file: page },
  });
  seedTelemetry(repo, previous.map((row) => telemetryRow({
    runId,
    iteration: row.iteration,
    failCount: 1,
    findingIds: ['gate2.region.1'],
    mismatchPct: row.mismatchPct,
    gate1Passed: true,
    gate2Passed: false,
  })));
  return repo;
}

serialTest("M2b-AC-15: Every report carries `loop` with `runId`, `iteration`, `maxIterations` `5`, `best`, `delta`, `stopReason`, and `continue`, on pass, gate failure, and error exits.", async () => {
  const pass = await compare(pageRepo('ac15-pass', CLEAN), ['--run-id', 'pass-run']);
  const fail = await compare(pageRepo('ac15-fail', SPILL), ['--run-id', 'fail-run']);
  const broken = freshDir('m2b', 'ac15-err');
  fs.writeFileSync(path.join(broken, 'pixel-gate.config.json'), '{');
  const error = await compare(broken, []);
  for (const [label, result] of [['pass', pass], ['gate failure', fail], ['error', error]]) {
    const loop = loopOf(result);
    assert.ok(loop, `${label} report carries loop`);
    assert.equal(typeof loop.runId, 'string');
    assert.equal(loop.maxIterations, 5);
    assert.equal(typeof loop.iteration, 'number');
    assert.ok(loop.best && typeof loop.best.iteration === 'number' && typeof loop.best.failCount === 'number');
    assert.ok(loop.delta && Array.isArray(loop.delta.newFailIds) && Array.isArray(loop.delta.resolvedFailIds));
    assert.equal(typeof loop.continue, 'boolean');
    assert.ok(loop.stopReason === null || typeof loop.stopReason === 'string');
  }
  assert.equal(pass.json.loop.runId, 'pass-run');
  assert.equal(pass.json.loop.stopReason, 'passed');
  assert.equal(pass.json.loop.continue, false);
  assert.equal(fail.json.passed, false);
  assert.ok(findingIds(fail.json).includes(SPILL_ID));
  assert.equal(error.code, 1);
  assert.equal(error.json.loop.stopReason, 'blocked');
});

serialTest("M2b-AC-16: A fixture sequence of five telemetry rows asserts each stop reason: `passed`, `blocked` (missing reference), `regression` (new fail id and higher `failCount`), `no-progress` (same fail ids, `mismatchPct` change `< 0.1` on two consecutive iterations), and `max-iterations`.", async () => {
  const passed = await compare(pageRepo('ac16-pass', CLEAN), ['--run-id', 'reason-passed']);
  assert.equal(loopOf(passed) && passed.json.loop.stopReason, 'passed');

  const blockedPage = freshDir('m2b', 'ac16-blocked-page');
  fs.writeFileSync(path.join(blockedPage, 'page.html'), CLEAN);
  const blockedRepo = makeWork('ac16-blocked', {
    viewports: VIEW,
    dpr: 1,
    references: 'references',
    routes: [{ id: 'home', path: '/page.html', referenceRequired: true }],
    target: { kind: 'static', file: path.join(blockedPage, 'page.html') },
  });
  const blocked = await compare(blockedRepo, ['--run-id', 'reason-blocked']);
  assert.equal(loopOf(blocked) && blocked.json.loop.stopReason, 'blocked');
  assert.ok(findingIds(blocked.json).includes('gate2.missing-reference.home.desktop'));

  const regressionRepo = pageRepo('ac16-reg', SPILL);
  seedTelemetry(regressionRepo, [telemetryRow({ runId: 'reason-regression', iteration: 1, failCount: 0, findingIds: [], mismatchPct: 0 })]);
  const regression = await compare(regressionRepo, ['--run-id', 'reason-regression', '--iteration', '2']);
  assert.equal(loopOf(regression) && regression.json.loop.stopReason, 'regression');
  assert.equal(regression.json.loop.best.failCount, 0);
  assert.ok(regression.json.loop.delta.newFailIds.includes(SPILL_ID));

  const noProgress = await compare(mismatchRepo('ac16-flat', 'flat-run', [
    { iteration: 1, mismatchPct: 10.05 },
    { iteration: 2, mismatchPct: 10 },
  ]), ['--run-id', 'flat-run', '--iteration', '3']);
  const maxRepo = pageRepo('ac16-max', SPILL);
  seedTelemetry(maxRepo, [1, 2, 3, 4].map((iteration) => telemetryRow({
    runId: 'max-run',
    iteration,
    failCount: 1,
    findingIds: ['gate1.overflow.other'],
    mismatchPct: null,
    gate1Passed: false,
  })));
  const maxed = await compare(maxRepo, ['--run-id', 'max-run', '--iteration', '5']);
  assert.equal(loopOf(maxed) && maxed.json.loop.stopReason, 'max-iterations');
  assert.equal(maxed.json.loop.continue, false);
  if (pixelSourceOfTruth) {
    assert.equal(loopOf(noProgress) && noProgress.json.loop.stopReason, 'no-progress');
    assert.deepEqual(
      [passed, blocked, regression, noProgress, maxed].map((result) => result.json.loop.stopReason),
      ['passed', 'blocked', 'regression', 'no-progress', 'max-iterations']
    );
  } else {
    assert.ok(loopOf(noProgress), 'the no-progress run still carries loop on Windows');
  }
});

serialTest("M2b-AC-16 break-it: a mismatchPct change of 0.1 is not no-progress", async () => {
  const result = await compare(mismatchRepo('ac16-boundary', 'boundary', [
    { iteration: 1, mismatchPct: 9.9 },
    { iteration: 2, mismatchPct: 9.9 },
  ]), ['--run-id', 'boundary', '--iteration', '3']);
  assert.ok(loopOf(result), 'loop is present so the boundary is real');
  if (pixelSourceOfTruth) assert.equal(result.json.loop.stopReason, null);
});

serialTest("M2b-AC-16 break-it: a mismatchPct change below 0.1 with the same fail ids is no-progress", async () => {
  const result = await compare(mismatchRepo('ac16-under', 'under', [
    { iteration: 1, mismatchPct: 10.05 },
    { iteration: 2, mismatchPct: 10 },
  ]), ['--run-id', 'under', '--iteration', '3']);
  assert.ok(loopOf(result), 'loop is present');
  if (pixelSourceOfTruth) assert.equal(result.json.loop.stopReason, 'no-progress');
});

serialTest("M2b-AC-17: Two different `runId` values in the same `telemetry.jsonl` do not affect each other's `best` or `delta`, so a large migration split into separate loops (owner decision 8) tracks each loop independently.", async () => {
  const repo = pageRepo('ac17', SPILL);
  seedTelemetry(repo, [
    telemetryRow({ runId: 'loop-a', iteration: 1, failCount: 4, findingIds: ['gate2.region.1', 'gate2.region.2', 'gate2.region.3', 'gate2.region.4'], mismatchPct: 12 }),
    telemetryRow({ runId: 'loop-b', iteration: 1, failCount: 0, findingIds: [], mismatchPct: 0 }),
  ]);
  const result = await compare(repo, ['--run-id', 'loop-a', '--iteration', '2']);
  const loop = loopOf(result);
  assert.ok(loop, 'loop is present');
  assert.equal(loop.runId, 'loop-a');
  assert.equal(loop.best.failCount, 4);
  assert.equal(loop.best.iteration, 1);
  assert.equal(loop.delta.newFailIds.includes(SPILL_ID), true);
  assert.equal(loop.delta.resolvedFailIds.includes('gate2.region.1'), false);
});

serialTest("M2b-AC-17 break-it: a better best on another runId is ignored", async () => {
  const repo = pageRepo('ac17-ignore', SPILL);
  seedTelemetry(repo, [
    telemetryRow({ runId: 'other', iteration: 1, failCount: 0, findingIds: [], mismatchPct: 0 }),
  ]);
  const result = await compare(repo, ['--run-id', 'mine', '--iteration', '1']);
  const loop = loopOf(result);
  assert.ok(loop, 'loop is present');
  assert.equal(loop.best.failCount, findings(result.json).filter((f) => f.severity === 'fail').length);
  assert.notEqual(loop.best.failCount, 0);
});

serialTest("M2b-AC-18: A config or flag that tries to raise `maxIterations` above `5` is rejected with a config error (`blocked`); the report still shows `maxIterations` `5`.", async () => {
  const repo = pageRepo('ac18', CLEAN, { loop: { maxIterations: 6 } });
  const byConfig = await compare(repo, []);
  assert.equal(byConfig.code, 1);
  assert.match(byConfig.json && byConfig.json.error && byConfig.json.error.message || '', /maxIterations/);
  assert.equal(loopOf(byConfig) && byConfig.json.loop.maxIterations, 5);
  assert.equal(byConfig.json.loop.stopReason, 'blocked');

  const flagged = await compare(pageRepo('ac18-flag', CLEAN), ['--max-iterations', '6']);
  assert.equal(flagged.code, 1);
  assert.match(flagged.json && flagged.json.error && flagged.json.error.message || '', /maxIterations/);
  assert.equal(loopOf(flagged) && flagged.json.loop.maxIterations, 5);
  assert.equal(flagged.json.loop.stopReason, 'blocked');
});

serialTest("M2b-AC-18 break-it: maxIterations of 5 is accepted", async () => {
  const repo = pageRepo('ac18-ok', CLEAN, { loop: { maxIterations: 5 } });
  const result = await compare(repo, ['--max-iterations', '5']);
  assert.equal(loopOf(result) && result.json.loop.maxIterations, 5);
  assert.notEqual(result.json.loop.stopReason, 'blocked');
  assert.equal(result.code, 0);
});

serialTest("M2b-AC-19: `findings` keep the SIDE-24 shape; the optional `refBox`, `expected`, and `actual` keys appear only when set, and `schemaVersion` stays `1`.", async () => {
  const ref = freshDir('m2b', 'ac19-ref');
  const reference = path.join(ref, 'reference.html');
  const target = path.join(ref, 'target.html');
  const css = (color) => `<!doctype html><html><body style="margin:0"><button style="color:${color}">Save</button></body></html>`;
  fs.writeFileSync(reference, css('#1a73e8'));
  fs.writeFileSync(target, css('#1a74e8'));
  const repo = makeWork('ac19', {
    viewports: VIEW,
    dpr: 1,
    maxDiff: 100,
    routes: [{ id: 'home', path: '/', reference: { kind: 'html-file', source: reference } }],
    target: { kind: 'static', file: target },
  });
  const result = await compare(repo, []);
  assert.equal(result.json && result.json.schemaVersion, 1);
  const style = findings(result.json).find((f) => f.id === 'gate2.style.button.color');
  assert.ok(style, `expected gate2.style.button.color, got ${findingIds(result.json).join(', ')}`);
  assert.equal(typeof style.expected, 'string');
  assert.equal(typeof style.actual, 'string');
  assert.notEqual(style.expected, style.actual);
  for (const finding of findings(result.json)) {
    for (const key of ['id', 'gate', 'severity', 'selector', 'box', 'text']) {
      assert.equal(key in finding, true, `${finding.id} keeps ${key}`);
    }
  }
});
