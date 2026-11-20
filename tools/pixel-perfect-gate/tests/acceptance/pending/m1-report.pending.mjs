/**
 * Milestone 1 gap tests for the section 6 report.
 * These assertions describe the contract the product does not meet yet.
 * acceptance-status.mjs expects each test to fail with ERR_ASSERTION.
 * When a test starts passing, move it into a green *.test.mjs file and check its section 8 box.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { fixturesDir, runCli, serialTest, startStaticServer, tmpOut } from '../harness.mjs';

const REQUIRED_KEYS = [
  'schemaVersion',
  'passed',
  'exitCode',
  'iteration',
  'durationMs',
  'error',
  'findings',
  'gates',
  'artifacts',
  'telemetry',
];

let envPromise;
let regionServer;

function fixtureEnv() {
  if (!envPromise) {
    envPromise = (async () => {
      fs.mkdirSync(tmpOut, { recursive: true });
      const server = await startStaticServer(fixturesDir);
      const refPath = path.join(tmpOut, 'pending-ref-1x.png');
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 480, height: 280 }, deviceScaleFactor: 1 });
        await page.goto(`${server.baseUrl}/passing-card.html`, { waitUntil: 'networkidle' });
        await page.screenshot({ path: refPath });
        await page.close();
      } finally {
        await browser.close();
      }
      return { server, refPath };
    })();
  }
  return envPromise;
}

test.after(async () => {
  if (envPromise) {
    const env = await envPromise.catch(() => null);
    if (env?.server) await env.server.close();
  }
  if (regionServer) await regionServer.close();
});

const runs = new Map();
async function runOnce(name, args) {
  if (!runs.has(name)) runs.set(name, await runCli(args));
  return runs.get(name);
}

async function passRun() {
  const env = await fixtureEnv();
  return runOnce('pass', [
    '--url', `${env.server.baseUrl}/passing-card.html`,
    '--ref', env.refPath,
    '--iteration', '1',
    '--model', 'acceptance-gap',
    '--harness', 'node-test',
    '--out', path.join(tmpOut, 'gap-pass'),
  ]);
}

async function gateFailureRun() {
  const env = await fixtureEnv();
  return runOnce('gate-failure', [
    '--url', `${env.server.baseUrl}/broken-layout.html`,
    '--ref', env.refPath,
    '--iteration', '2',
    '--model', 'acceptance-gap',
    '--harness', 'node-test',
    '--out', path.join(tmpOut, 'gap-gate-failure'),
  ]);
}

async function missingRefRun() {
  const env = await fixtureEnv();
  return runOnce('missing-ref', [
    '--url', `${env.server.baseUrl}/passing-card.html`,
    '--ref', path.join(tmpOut, 'does-not-exist.png'),
    '--out', path.join(tmpOut, 'gap-missing-ref'),
  ]);
}

async function launchErrorRun() {
  return runOnce('launch-error', [
    '--url', 'http://127.0.0.1:54321/',
    '--out', path.join(tmpOut, 'gap-launch-error'),
  ]);
}

function assertSection6(run, { passed }) {
  assert.ok(run.json && typeof run.json === 'object', 'stdout must be one JSON object');
  for (const key of REQUIRED_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(run.json, key), true, `missing ${key}`);
  }
  assert.equal(run.json.schemaVersion, 1);
  assert.equal(typeof run.json.passed, 'boolean');
  assert.equal(run.json.passed, passed);
  assert.equal(run.json.exitCode, passed ? 0 : 1);
  assert.equal(run.code, run.json.exitCode);
  assert.equal(Number.isInteger(run.json.iteration), true);
  assert.equal(Number.isInteger(run.json.durationMs) && run.json.durationMs >= 0, true);
  assert.ok(Array.isArray(run.json.findings));
  for (const gate of ['gate1', 'gate2', 'gate3']) {
    assert.equal(typeof run.json.gates?.[gate], 'object', gate);
    assert.notEqual(run.json.gates[gate], null, gate);
  }
  if (passed) {
    assert.equal(run.json.error, null);
  } else {
    assert.equal(typeof run.json.error, 'object');
    assert.notEqual(run.json.error, null);
    assert.equal(typeof run.json.error.message, 'string');
    assert.ok(run.json.error.message.length > 0);
  }
}

serialTest('M1-AC-09: Stdout for a pass, a gate failure, a missing reference, and a thrown launch error all parse as the section 6 object with `schemaVersion` `1`.', async () => {
  const cases = [
    ['pass', await passRun(), true],
    ['gate failure', await gateFailureRun(), false],
    ['missing reference', await missingRefRun(), false],
    ['launch error', await launchErrorRun(), false],
  ];
  for (const [label, run, passed] of cases) {
    assert.equal(run.json?.schemaVersion, 1, label);
    assertSection6(run, { passed });
  }
});

serialTest('M1-AC-10: Each Gate 1 element finding includes `selector`, `box`, and short `text`.', async () => {
  const env = await fixtureEnv();
  const run = await runOnce('clipped', [
    '--url', `${env.server.baseUrl}/clipped-and-errors.html`,
    '--out', path.join(tmpOut, 'gap-clipped'),
  ]);
  assert.ok(Array.isArray(run.json?.findings));
  const elementFindings = run.json.findings.filter((finding) => finding.gate === 'gate1' && finding.selector);
  assert.ok(elementFindings.length >= 1);
  for (const finding of elementFindings) {
    assert.equal(typeof finding.selector, 'string');
    assert.notEqual(finding.selector, '');
    assert.ok(finding.box);
    for (const axis of ['x', 'y', 'width', 'height']) {
      assert.equal(Number.isInteger(finding.box[axis]), true, axis);
    }
    assert.equal(typeof finding.text, 'string');
    assert.ok(finding.text.length > 0 && finding.text.length <= 240);
  }
});

serialTest('M1-AC-11: Gate 2 includes `mismatchPct` and clustered `regions` with boxes, capped at 20, plus `regionCount`.', async () => {
  const dir = path.join(tmpOut, 'regions');
  fs.mkdirSync(dir, { recursive: true });
  const style = 'html,body{margin:0;background:#ccc;width:480px;height:280px;overflow:hidden;}';
  fs.writeFileSync(path.join(dir, 'blank.html'), `<!DOCTYPE html><html><head><style>${style}</style></head><body></body></html>`);
  const boxes = Array.from({ length: 21 }, (_, index) => `<i style="left:${index * 18}px;top:24px"></i>`).join('');
  fs.writeFileSync(
    path.join(dir, 'boxes.html'),
    `<!DOCTYPE html><html><head><style>${style} i{position:absolute;width:8px;height:8px;background:#f00;}</style></head><body>${boxes}</body></html>`
  );
  regionServer = await startStaticServer(dir);
  const refPath = path.join(dir, 'ref.png');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 280 }, deviceScaleFactor: 1 });
    await page.goto(`${regionServer.baseUrl}/blank.html`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: refPath });
    await page.close();
  } finally {
    await browser.close();
  }
  const run = await runCli([
    '--url', `${regionServer.baseUrl}/boxes.html`,
    '--ref', refPath,
    '--viewport', '480x280',
    '--out', path.join(tmpOut, 'gap-regions'),
  ]);
  const gate2 = run.json?.gates?.gate2;
  assert.equal(typeof gate2?.mismatchPct, 'number');
  assert.ok(Array.isArray(gate2?.regions));
  assert.equal(gate2.regions.length, 20);
  assert.equal(typeof gate2.regionCount, 'number');
  assert.ok(gate2.regionCount >= 21);
  for (const region of gate2.regions) {
    assert.match(region.id, /^gate2\.region\.\d+$/);
    for (const axis of ['x', 'y', 'width', 'height']) {
      assert.equal(Number.isInteger(region.box[axis]), true);
    }
    assert.equal(typeof region.mismatchPct, 'number');
  }
});

serialTest('M1-AC-12: Finding `id` values for the broken-layout fixture are identical across two runs.', async () => {
  const env = await fixtureEnv();
  const argsFor = (name) => [
    '--url', `${env.server.baseUrl}/broken-layout.html`,
    '--ref', env.refPath,
    '--out', path.join(tmpOut, name),
  ];
  const first = await runCli(argsFor('gap-stable-a'));
  const second = await runCli(argsFor('gap-stable-b'));
  const ids = (run) => (Array.isArray(run.json?.findings) ? run.json.findings.map((finding) => finding.id) : []);
  assert.ok(ids(first).length > 0);
  assert.deepEqual(ids(first), ids(second));
});

serialTest('M1-AC-13: Exit `0` on pass and exit `1` on fail, matching `exitCode`.', async () => {
  const pass = await passRun();
  const fail = await gateFailureRun();
  assert.equal(pass.code, 0);
  assert.equal(pass.json?.exitCode, 0);
  assert.equal(pass.json?.passed, true);
  assert.equal(fail.code, 1);
  assert.equal(fail.json?.exitCode, 1);
  assert.equal(fail.json?.passed, false);
});

serialTest('M1-AC-14: A fixture asserts the required keys.', async () => {
  const cases = [
    ['pass', await passRun(), true],
    ['gate 1 failure', await gateFailureRun(), false],
    ['gate 2 mismatch', await (async () => {
      const env = await fixtureEnv();
      return runOnce('gate2-mismatch', [
        '--url', `${env.server.baseUrl}/dynamic-masked-changed.html`,
        '--ref', env.refPath,
        '--out', path.join(tmpOut, 'gap-gate2'),
      ]);
    })(), false],
    ['missing file', await missingRefRun(), false],
  ];
  for (const [label, run, passed] of cases) {
    assert.ok(run.json, label);
    for (const key of REQUIRED_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(run.json, key), true, `${label} missing ${key}`);
    }
    assertSection6(run, { passed });
  }
});

serialTest('M1-AC-15: `.visual-eval/telemetry.jsonl` gains `schemaVersion` and the finding ids for that run, and keeps the PR #2 fields (`iteration`, `mismatchPct`, `durationMs`, `gate1Passed`, `gate2Passed`, `model`, `harness`).', async () => {
  const run = await gateFailureRun();
  assert.equal(typeof run.json?.telemetry, 'string');
  assert.equal(fs.existsSync(run.json.telemetry), true);
  const rows = fs.readFileSync(run.json.telemetry, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(rows.length >= 1);
  const row = rows.at(-1);
  assert.equal(row.schemaVersion, 1);
  assert.ok(Array.isArray(row.findingIds));
  assert.ok(row.findingIds.length > 0);
  assert.equal(row.iteration, 2);
  assert.equal(typeof row.mismatchPct === 'number' || row.mismatchPct === null, true);
  assert.equal(typeof row.durationMs, 'number');
  assert.equal(typeof row.gate1Passed, 'boolean');
  assert.equal(typeof row.gate2Passed, 'boolean');
  assert.equal(row.model, 'acceptance-gap');
  assert.equal(row.harness, 'node-test');
});
