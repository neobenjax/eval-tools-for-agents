/**
 * Green suite for the milestone 1 engine criteria.
 * These asserts read the current stdout (`json.gates.gate1`, `json.gates.gate2`, `error` as a string).
 * Section 6 uses `gates.*`, `error: null` on a finished run, and a skipped-gate object.
 * When a gap test is promoted, update those paths in the same commit and keep the behavioral asserts
 * (exit code, landmark id, mismatchPct, dimension text).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { fixturesDir, repoRoot, runCli, serialTest, startStaticServer, tmpOut } from './harness.mjs';

let baseUrl;
let server;

test.before(async () => {
  fs.rmSync(tmpOut, { recursive: true, force: true });
  fs.mkdirSync(tmpOut, { recursive: true });
  server = await startStaticServer(fixturesDir);
  baseUrl = server.baseUrl;
});

test.after(async () => {
  if (server) await server.close();
});

function tracked(rel) {
  const listed = execFileSync('git', ['ls-files', '--error-unmatch', rel], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim().split('\\').join('/');
  assert.equal(listed, rel);
  return path.join(repoRoot, rel);
}

const cliCache = new Map();
async function cachedCli(args) {
  const key = JSON.stringify(args);
  if (!cliCache.has(key)) cliCache.set(key, await runCli(args));
  return cliCache.get(key);
}

serialTest('M1-AC-01: Wireframe mode fails when a landmark box (`header`, `nav`, `main`, `footer`, or a selector listed in config) moves more than `4` CSS pixels on `x` or `y`, or changes width or height by more than `4` CSS pixels.', async () => {
  const run = await runCli([
    '--url', `${baseUrl}/wireframe-shift-5px.html`,
    '--ref', path.join(fixturesDir, 'wireframe-base-1x.png'),
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'ac01-shift-5px'),
  ]);
  assert.equal(run.code, 1);
  assert.equal(run.json.passed, false);
  assert.equal(run.json.gates.gate2.passed, false);
  assert.equal(run.json.gates.gate2.mode, 'wireframe');
  assert.ok(run.json.gates.gate2.findings.some((finding) => finding.id === 'gate2.landmark.main'));
});

function sidecarWithMainDelta(axis, delta) {
  const landmarks = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'wireframe-base-1x.landmarks.json'), 'utf8'));
  const main = landmarks.find((landmark) => landmark.selector === 'main');
  main[axis] += delta;
  const file = path.join(tmpOut, `ac01-main-${axis}-${delta}.landmarks.json`);
  fs.writeFileSync(file, JSON.stringify(landmarks));
  return file;
}

async function mainDeltaRun(axis) {
  return runCli([
    '--url', `${baseUrl}/wireframe-base.html`,
    '--ref', path.join(fixturesDir, 'wireframe-base-1x.png'),
    '--ref-landmarks', sidecarWithMainDelta(axis, 5),
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, `ac01-main-${axis}-5`),
  ]);
}

serialTest('M1-AC-01 break-it: a sidecar whose only delta is width 5 CSS px fails', async () => {
  const run = await mainDeltaRun('width');
  assert.equal(run.code, 1);
  assert.equal(run.json.passed, false);
  const finding = run.json.gates.gate2.findings.find((item) => item.id === 'gate2.landmark.main');
  assert.ok(finding);
  assert.ok(finding.text.includes('dx=0, dy=0, dw=5, dh=0'), finding.text);
});

serialTest('M1-AC-01 break-it: a sidecar whose only delta is height 5 CSS px fails', async () => {
  const run = await mainDeltaRun('height');
  assert.equal(run.code, 1);
  assert.equal(run.json.passed, false);
  const finding = run.json.gates.gate2.findings.find((item) => item.id === 'gate2.landmark.main');
  assert.ok(finding);
  assert.ok(finding.text.includes('dx=0, dy=0, dw=0, dh=5'), finding.text);
});

serialTest('M1-AC-01 break-it: shift of exactly 4 CSS px stays within tolerance', async () => {
  const run = await runCli([
    '--url', `${baseUrl}/wireframe-shift-4px.html`,
    '--ref', path.join(fixturesDir, 'wireframe-base-1x.png'),
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'ac01-shift-4px'),
  ]);
  assert.equal(run.code, 0);
  assert.equal(run.json.passed, true);
  assert.equal(run.json.gates.gate2.passed, true);
  assert.equal(run.json.gates.gate2.findings.length, 0);
});

serialTest('M1-AC-01 break-it: null coordinate in the landmarks sidecar fails closed', async () => {
  const run = await runCli([
    '--url', `${baseUrl}/wireframe-zero-header.html`,
    '--ref', path.join(fixturesDir, 'wireframe-base-1x.png'),
    '--landmarks', 'header',
    '--ref-landmarks', path.join(fixturesDir, 'wireframe-null-coordinate.landmarks.json'),
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'ac01-null-coord'),
  ]);
  assert.equal(run.code, 1);
  assert.equal(run.json.passed, false);
  assert.equal(run.json.gates.gate2.passed, false);
  assert.ok(run.json.gates.gate2.findings.some((finding) => finding.id === 'gate2.landmark.header'));
});

serialTest('M1-AC-01 break-it: empty landmarks sidecar fails closed', async () => {
  const run = await runCli([
    '--url', `${baseUrl}/wireframe-base.html`,
    '--ref', path.join(fixturesDir, 'wireframe-base-1x.png'),
    '--ref-landmarks', path.join(fixturesDir, 'wireframe-empty.landmarks.json'),
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'ac01-empty-sidecar'),
  ]);
  assert.equal(run.code, 1);
  assert.equal(run.json.passed, false);
  assert.equal(run.json.gates.gate2.passed, false);
  assert.ok(run.json.gates.gate2.findings.some((finding) => finding.id === 'gate2.landmark.invalid-sidecar'));
});

serialTest('M1-AC-01 break-it: missing landmarks sidecar fails closed', async () => {
  const missing = path.join(tmpOut, 'ac01-missing.landmarks.json');
  const run = await runCli([
    '--url', `${baseUrl}/wireframe-base.html`,
    '--ref', path.join(fixturesDir, 'wireframe-base-1x.png'),
    '--ref-landmarks', missing,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'ac01-missing-sidecar'),
  ]);
  assert.equal(run.code, 1);
  assert.equal(run.json.passed, false);
  assert.match(run.json.error?.message, /Reference landmarks file not found/);
  assert.match(run.json.error?.message, /ac01-missing\.landmarks\.json/);
});

serialTest('M1-AC-01 break-it: landmark missing from the page fails closed', async () => {
  const sidecar = path.join(tmpOut, 'ac01-aside.landmarks.json');
  fs.writeFileSync(sidecar, JSON.stringify([
    { selector: 'aside', index: 0, x: 0, y: 0, width: 40, height: 40 },
  ]));
  const run = await runCli([
    '--url', `${baseUrl}/wireframe-base.html`,
    '--ref', path.join(fixturesDir, 'wireframe-base-1x.png'),
    '--ref-landmarks', sidecar,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'ac01-wrong-landmark'),
  ]);
  assert.equal(run.code, 1);
  assert.equal(run.json.passed, false);
  assert.equal(run.json.gates.gate2.passed, false);
  assert.ok(run.json.gates.gate2.findings.some((finding) => finding.id === 'gate2.landmark.aside'));
});

serialTest('M1-AC-02: A color-only change (same boxes, different paint) stays passing in wireframe mode.', async () => {
  const wireRef = path.join(fixturesDir, 'wireframe-base-1x.png');
  const wireLandmarks = path.join(fixturesDir, 'wireframe-base-1x.landmarks.json');
  const passRun = await runCli([
    '--url', `${baseUrl}/wireframe-color-only.html`,
    '--ref', wireRef,
    '--ref-landmarks', wireLandmarks,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'ac02-color'),
  ]);
  assert.equal(passRun.code, 0);
  assert.equal(passRun.json.passed, true);
  assert.equal(passRun.json.gates.gate2.mode, 'wireframe');
  assert.equal(passRun.json.gates.gate2.findings.length, 0);

  const shifted = JSON.parse(fs.readFileSync(wireLandmarks, 'utf8'));
  const main = shifted.find((landmark) => landmark.selector === 'main');
  main.x += 5;
  const mutated = path.join(tmpOut, 'ac02-mutated.landmarks.json');
  fs.writeFileSync(mutated, JSON.stringify(shifted));
  const failRun = await runCli([
    '--url', `${baseUrl}/wireframe-color-only.html`,
    '--ref', wireRef,
    '--ref-landmarks', mutated,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'ac02-mutated'),
  ]);
  assert.equal(failRun.code, 1);
  assert.equal(failRun.json.gates.gate2.passed, false);
  assert.ok(failRun.json.gates.gate2.findings.some((finding) => finding.id === 'gate2.landmark.main'));
});

serialTest('M1-AC-03: At least one test compares against a PNG committed under `tools/pixel-perfect-gate/tests/fixtures/`, not a screenshot captured in that test.', async () => {
  const ref = tracked('tools/pixel-perfect-gate/tests/fixtures/committed-card-1x.png');
  const run = await runCli([
    '--url', `${baseUrl}/committed-card.html`,
    '--ref', ref,
    '--out', path.join(tmpOut, 'ac03-committed'),
  ]);
  assert.equal(run.code, 0);
  assert.equal(run.json.passed, true);
  assert.equal(run.json.gates.gate2.mismatchPct, 0);
  assert.equal(path.resolve(run.json.gates.gate2.artifacts.reference), path.resolve(ref));
});

serialTest('M1-AC-04: A mask fixture shows a changing region under the mask stays inside `--max-diff`, and the same change outside the mask fails. *(Covered in PR #2)*', async () => {
  const refPath = path.join(tmpOut, 'ac04-ref.png');
  const browser = await chromium.launch();
  let dynBox;
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 280 } });
    await page.goto(`${baseUrl}/dynamic-masked.html`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: refPath });
    dynBox = await page.locator('#dyn').boundingBox();
    await page.close();
  } finally {
    await browser.close();
  }
  assert.ok(dynBox, 'mask fixture must expose #dyn');

  const masked = await runCli([
    '--url', `${baseUrl}/dynamic-masked-changed.html`,
    '--ref', refPath,
    '--mask', '#dyn',
    '--out', path.join(tmpOut, 'ac04-masked'),
  ]);
  assert.equal(masked.code, 0);
  assert.equal(masked.json.gates.gate2.mismatchPct, 0);

  const actual = PNG.sync.read(fs.readFileSync(masked.json.gates.gate2.artifacts.actual));
  const diff = PNG.sync.read(fs.readFileSync(masked.json.gates.gate2.artifacts.diff));
  const composite = PNG.sync.read(fs.readFileSync(masked.json.gates.gate2.artifacts.composite));
  const x = Math.min(actual.width - 1, Math.max(0, Math.round(dynBox.x + dynBox.width / 2)));
  const y = Math.min(actual.height - 1, Math.max(0, Math.round(dynBox.y + dynBox.height / 2)));
  const actualPx = actual.data.slice((y * actual.width + x) * 4, (y * actual.width + x) * 4 + 4);
  assert.deepEqual(Array.from(actualPx), [20, 20, 20, 255]);
  assert.notEqual(diff.data[(y * diff.width + x) * 4], 255);
  const gap = 8;
  const diffPanelX = actual.width * 2 + gap * 2 + x;
  assert.notEqual(composite.data[(y * composite.width + diffPanelX) * 4], 255);

  const unmasked = await runCli([
    '--url', `${baseUrl}/dynamic-masked-changed.html`,
    '--ref', refPath,
    '--out', path.join(tmpOut, 'ac04-unmasked'),
  ]);
  assert.equal(unmasked.code, 1);
  assert.ok(unmasked.json.gates.gate2.mismatchPct > 0);

  const outside = await runCli([
    '--url', `${baseUrl}/dynamic-masked-outside.html`,
    '--ref', refPath,
    '--mask', '#dyn',
    '--out', path.join(tmpOut, 'ac04-outside'),
  ]);
  assert.equal(outside.code, 1);
  assert.equal(outside.json.passed, false);
  assert.ok(outside.json.gates.gate2.mismatchPct > 0);
});

serialTest('M1-AC-05: A `--full-page` fixture uses a committed full-page reference and fails on a height mismatch.', async () => {
  const fullRef = tracked('tools/pixel-perfect-gate/tests/fixtures/committed-fullpage-1x.png');
  const passRun = await runCli([
    '--url', `${baseUrl}/committed-fullpage.html`,
    '--ref', fullRef,
    '--viewport', '480x280',
    '--full-page',
    '--out', path.join(tmpOut, 'ac05-pass'),
  ]);
  assert.equal(passRun.code, 0);
  assert.equal(passRun.json.passed, true);
  assert.equal(passRun.json.gates.gate2.dimensions, '480x420');
  assert.equal(passRun.json.gates.gate2.mismatchPct, 0);

  const failRun = await runCli([
    '--url', `${baseUrl}/fullpage-height-mismatch.html`,
    '--ref', fullRef,
    '--viewport', '480x280',
    '--full-page',
    '--out', path.join(tmpOut, 'ac05-mismatch'),
  ]);
  assert.equal(failRun.code, 1);
  assert.equal(failRun.json.passed, false);
  assert.equal(failRun.json.gates.gate2.passed, false);
  assert.match(failRun.json.gates.gate2.error, /Dimension mismatch/);

  const tallerRef = tracked('tools/pixel-perfect-gate/tests/fixtures/committed-fullpage-1px-taller-1x.png');
  const onePx = await runCli([
    '--url', `${baseUrl}/committed-fullpage.html`,
    '--ref', tallerRef,
    '--viewport', '480x280',
    '--full-page',
    '--out', path.join(tmpOut, 'ac05-one-px'),
  ]);
  assert.equal(onePx.code, 1);
  assert.equal(onePx.json.gates.gate2.passed, false);
  assert.match(onePx.json.gates.gate2.error, /Dimension mismatch/);
});

serialTest('M1-AC-06: A fixture covers clipped text. *(Covered in PR #2)*', async () => {
  const run = await cachedCli([
    '--url', `${baseUrl}/clipped-and-errors.html`,
    '--out', path.join(tmpOut, 'ac06-clipped'),
  ]);
  assert.equal(run.code, 1);
  assert.equal(run.json.passed, false);
  assert.equal(run.json.gates.gate1.passed, false);
  assert.ok(run.json.gates.gate1.clippedTextElements.length >= 1);
});

serialTest('M1-AC-07: A fixture covers a `console.error`. *(Covered in PR #2)*', async () => {
  const run = await cachedCli([
    '--url', `${baseUrl}/clipped-and-errors.html`,
    '--out', path.join(tmpOut, 'ac06-clipped'),
  ]);
  assert.equal(run.code, 1);
  assert.equal(run.json.gates.gate1.passed, false);
  assert.ok(run.json.gates.gate1.consoleErrors.length >= 1);
  assert.ok(run.json.gates.gate1.consoleErrors.some((entry) => entry.type === 'console.error' || entry.type === 'pageerror'));
});

serialTest('M1-AC-08: Reference dimensions not divisible by `--dpr` fail with a dimension finding and do not round the viewport.', async () => {
  const oddRef = path.join(tmpOut, 'ac08-odd-101x51.png');
  fs.writeFileSync(oddRef, PNG.sync.write(new PNG({ width: 101, height: 51, fill: true })));
  const odd = await runCli([
    '--url', `${baseUrl}/odd-card.html`,
    '--ref', oddRef,
    '--dpr', '2',
    '--out', path.join(tmpOut, 'ac08-odd'),
  ]);
  assert.equal(odd.code, 1);
  assert.equal(odd.json.passed, false);
  assert.equal(odd.json.gates.gate1.skipped, true);
  assert.equal(odd.json.gates.gate2.passed, false);
  assert.match(odd.json.error?.message, /101x51/);
  assert.match(odd.json.error?.message, /not divisible by --dpr 2/);
  assert.match(odd.json.gates.gate2.error, /not divisible by --dpr 2/);

  const divisible = await runCli([
    '--url', `${baseUrl}/committed-card.html`,
    '--ref', path.join(fixturesDir, 'committed-card-1x.png'),
    '--dpr', '1',
    '--out', path.join(tmpOut, 'ac08-divisible'),
  ]);
  assert.equal(divisible.code, 0);
  assert.equal(divisible.json.passed, true);
  assert.equal(divisible.json.gates.gate2.mismatchPct, 0);
  assert.equal(typeof divisible.json.gates.gate1, 'object');
  assert.notEqual(divisible.json.gates.gate1, null);
  assert.equal(divisible.json.error, null);
});
