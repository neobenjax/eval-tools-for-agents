import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);
const pkgRoot = path.resolve(import.meta.dirname, '..');
const fixturesDir = path.join(pkgRoot, 'tests', 'fixtures');
const cliPath = path.join(pkgRoot, 'bin', 'pixel-gate.mjs');
const tmpOut = path.join(pkgRoot, '.visual-eval-test');

let server;
let baseUrl;
let ref1xPath;
let ref2xPath;

async function runCli(args) {
  try {
    const { stdout } = await execFileAsync('node', [cliPath, ...args], { encoding: 'utf8' });
    return { code: 0, json: JSON.parse(stdout) };
  } catch (err) {
    return { code: err.code ?? 1, json: JSON.parse(err.stdout || '{}') };
  }
}

test.before(async () => {
  fs.rmSync(tmpOut, { recursive: true, force: true });
  fs.mkdirSync(tmpOut, { recursive: true });
  server = http.createServer((req, res) => {
    const cleanUrl = (req.url || '/').split('?')[0];
    if (cleanUrl === '/slow-timeout') {
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body>Delayed</body></html>');
        }
      }, 4000);
      return;
    }
    const filePath = path.join(fixturesDir, cleanUrl.replace(/^\//, ''));
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;

  // Generate 1x and 2x ground-truth reference PNGs from passing-card.html
  ref1xPath = path.join(tmpOut, 'ref-1x.png');
  ref2xPath = path.join(tmpOut, 'ref-2x.png');

  const browser = await chromium.launch();
  try {
    const p1 = await browser.newPage({ viewport: { width: 480, height: 280 }, deviceScaleFactor: 1 });
    await p1.goto(`${baseUrl}/passing-card.html`, { waitUntil: 'networkidle' });
    await p1.screenshot({ path: ref1xPath });
    await p1.close();

    const p2 = await browser.newPage({ viewport: { width: 480, height: 280 }, deviceScaleFactor: 2 });
    await p2.goto(`${baseUrl}/passing-card.html`, { waitUntil: 'networkidle' });
    await p2.screenshot({ path: ref2xPath });
    await p2.close();
  } finally {
    await browser.close();
  }
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpOut, { recursive: true, force: true });
});

test('passes Gate 1 + Gate 2 on exact 1x match and logs telemetry', async () => {
  const outDir = path.join(tmpOut, 'run-1x');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/passing-card.html`,
    '--ref', ref1xPath,
    '--out', outDir,
    '--iteration', '1',
    '--model', 'test-model',
    '--harness', 'node-test',
  ]);
  assert.equal(code, 0);
  assert.equal(json.passed, true);
  assert.equal(json.gates.gate1.passed, true);
  assert.equal(json.gates.gate2.passed, true);
  assert.equal(json.gates.gate2.mismatchPct, 0);
  assert.equal(fs.existsSync(json.gates.gate2.artifacts.composite), true);
  assert.equal(fs.existsSync(json.telemetry), true);
});

test('flags horizontal overflow, 404 asset, broken image, and respects data-allow-overlap', async () => {
  const outDir = path.join(tmpOut, 'run-broken');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/broken-layout.html`,
    '--ref', ref1xPath,
    '--out', outDir,
  ]);
  assert.equal(code, 1);
  assert.equal(json.passed, false);
  assert.equal(json.gates.gate1.passed, false);
  assert.equal(json.gates.gate1.horizontalOverflow, true);
  assert.ok(json.gates.gate1.networkErrors.length >= 1);
  assert.ok(json.gates.gate1.brokenImages.length >= 1);
  assert.equal(json.gates.gate1.overlappingSiblings.length, 0);
});

test('supports @2x DPR Figma reference exports', async () => {
  const outDir = path.join(tmpOut, 'run-2x');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/passing-card.html`,
    '--ref', ref2xPath,
    '--dpr', '2',
    '--out', outDir,
  ]);
  assert.equal(code, 0);
  assert.equal(json.passed, true);
  assert.equal(json.gates.gate2.dimensions, '960x560');
  assert.equal(json.gates.gate2.mismatchPct, 0);
});

test('supports wireframe mode without failing on pixelmatch diffs', async () => {
  const outDir = path.join(tmpOut, 'run-wireframe');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/wireframe-variant.html`,
    '--ref', ref1xPath,
    '--mode', 'wireframe',
    '--landmarks', '.card',
    '--out', outDir,
  ]);
  assert.equal(code, 0);
  assert.equal(json.passed, true);
  assert.equal(json.gates.gate2.mode, 'wireframe');
  assert.equal(fs.existsSync(json.gates.gate2.artifacts.composite), true);
});

test('wireframe mode: passes color-only changes, fails on >4px landmark shift and blank page', async () => {
  const wireRef = path.join(fixturesDir, 'wireframe-base-1x.png');
  const wireLandmarks = path.join(fixturesDir, 'wireframe-base-1x.landmarks.json');
  const missingCoordLandmarks = path.join(fixturesDir, 'wireframe-missing-coordinate.landmarks.json');

  // 1. Color-only change with explicit --ref-landmarks -> passes
  const passRun = await runCli([
    '--url', `${baseUrl}/wireframe-color-only.html`,
    '--ref', wireRef,
    '--ref-landmarks', wireLandmarks,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-color-only'),
  ]);
  assert.equal(passRun.code, 0);
  assert.equal(passRun.json.passed, true);
  assert.equal(passRun.json.gates.gate2.passed, true);
  assert.equal(passRun.json.gates.gate2.findings.length, 0);

  // 2. Discovery: color-only change WITHOUT --ref-landmarks discovers wireframe-base-1x.landmarks.json -> passes
  const passDiscovered = await runCli([
    '--url', `${baseUrl}/wireframe-color-only.html`,
    '--ref', wireRef,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-color-only-discovered'),
  ]);
  assert.equal(passDiscovered.code, 0);
  assert.equal(passDiscovered.json.passed, true);
  assert.equal(passDiscovered.json.gates.gate2.passed, true);
  assert.equal(passDiscovered.json.gates.gate2.findings.length, 0);

  // 3. Shifted <main> landmark (>4px) with explicit --ref-landmarks -> fails
  const shiftRun = await runCli([
    '--url', `${baseUrl}/wireframe-shifted.html`,
    '--ref', wireRef,
    '--ref-landmarks', wireLandmarks,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-shifted'),
  ]);
  assert.equal(shiftRun.code, 1);
  assert.equal(shiftRun.json.passed, false);
  assert.equal(shiftRun.json.gates.gate2.passed, false);
  assert.ok(shiftRun.json.gates.gate2.findings.some((f) => f.id === 'gate2.landmark.main'));

  // 4. Discovery: shifted <main> landmark WITHOUT --ref-landmarks discovers sidecar -> fails
  const shiftDiscovered = await runCli([
    '--url', `${baseUrl}/wireframe-shifted.html`,
    '--ref', wireRef,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-shifted-discovered'),
  ]);
  assert.equal(shiftDiscovered.code, 1);
  assert.equal(shiftDiscovered.json.passed, false);
  assert.equal(shiftDiscovered.json.gates.gate2.passed, false);
  assert.ok(shiftDiscovered.json.gates.gate2.findings.some((f) => f.id === 'gate2.landmark.main'));

  // 5. Boundary pin: exactly 4px shift on <main> (within <=4px tolerance) -> passes
  const shift4px = await runCli([
    '--url', `${baseUrl}/wireframe-shift-4px.html`,
    '--ref', wireRef,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-shift-4px'),
  ]);
  assert.equal(shift4px.code, 0);
  assert.equal(shift4px.json.passed, true);
  assert.equal(shift4px.json.gates.gate2.passed, true);
  assert.equal(shift4px.json.gates.gate2.findings.length, 0);

  // 6. Boundary pin: exactly 5px shift on <main> (> 4px tolerance) -> fails
  const shift5px = await runCli([
    '--url', `${baseUrl}/wireframe-shift-5px.html`,
    '--ref', wireRef,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-shift-5px'),
  ]);
  assert.equal(shift5px.code, 1);
  assert.equal(shift5px.json.passed, false);
  assert.equal(shift5px.json.gates.gate2.passed, false);
  assert.ok(shift5px.json.gates.gate2.findings.some((f) => f.id === 'gate2.landmark.main'));

  const nullCoordLandmarks = path.join(fixturesDir, 'wireframe-null-coordinate.landmarks.json');
  const emptyLandmarks = path.join(fixturesDir, 'wireframe-empty.landmarks.json');

  // 7. Fail-closed: missing coordinate (e.g. omitted 'x') in landmarks file fails closed
  const missingCoordRun = await runCli([
    '--url', `${baseUrl}/wireframe-base.html`,
    '--ref', wireRef,
    '--ref-landmarks', missingCoordLandmarks,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-missing-coord'),
  ]);
  assert.equal(missingCoordRun.code, 1);
  assert.equal(missingCoordRun.json.passed, false);
  assert.equal(missingCoordRun.json.gates.gate2.passed, false);
  assert.ok(missingCoordRun.json.gates.gate2.findings.some((f) => f.id === 'gate2.landmark.footer'));

  // 8. Fail-closed on null coordinate at x: 0 (proves operands checked before arithmetic without ToNumber(null) === 0 hole)
  const nullCoordRun = await runCli([
    '--url', `${baseUrl}/wireframe-zero-header.html`,
    '--ref', wireRef,
    '--landmarks', 'header',
    '--ref-landmarks', nullCoordLandmarks,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-null-coord'),
  ]);
  assert.equal(nullCoordRun.code, 1);
  assert.equal(nullCoordRun.json.passed, false);
  assert.equal(nullCoordRun.json.gates.gate2.passed, false);
  assert.ok(nullCoordRun.json.gates.gate2.findings.some((f) => f.id === 'gate2.landmark.header'));

  // 9. Sidecar present but empty array ([]) fails with invalid-sidecar finding
  const emptySidecarRun = await runCli([
    '--url', `${baseUrl}/wireframe-base.html`,
    '--ref', wireRef,
    '--ref-landmarks', emptyLandmarks,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-empty-sidecar'),
  ]);
  assert.equal(emptySidecarRun.code, 1);
  assert.equal(emptySidecarRun.json.passed, false);
  assert.equal(emptySidecarRun.json.gates.gate2.passed, false);
  assert.ok(emptySidecarRun.json.gates.gate2.findings.some((f) => f.id === 'gate2.landmark.invalid-sidecar'));

  // 10. Blank page (0 landmarks) -> fails
  const blankRun = await runCli([
    '--url', `${baseUrl}/wireframe-blank.html`,
    '--ref', wireRef,
    '--ref-landmarks', wireLandmarks,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-blank'),
  ]);
  assert.equal(blankRun.code, 1);
  assert.equal(blankRun.json.passed, false);
  assert.equal(blankRun.json.gates.gate2.passed, false);
  assert.ok(blankRun.json.gates.gate2.findings.some((f) => f.id === 'gate2.landmark.missing-page-landmarks'));
});

test('passes against committed reference PNG generated outside the test run', async () => {
  const committedRef = path.join(fixturesDir, 'committed-card-1x.png');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/committed-card.html`,
    '--ref', committedRef,
    '--out', path.join(tmpOut, 'run-committed-1x'),
  ]);
  assert.equal(code, 0);
  assert.equal(json.passed, true);
  assert.equal(json.gates.gate2.passed, true);
  assert.equal(json.gates.gate2.mismatchPct, 0);
});

test('--full-page passes on exact committed full-page PNG and fails on height mismatch', async () => {
  const fullRef = path.join(fixturesDir, 'committed-fullpage-1x.png');
  const passRun = await runCli([
    '--url', `${baseUrl}/committed-fullpage.html`,
    '--ref', fullRef,
    '--viewport', '480x280',
    '--full-page',
    '--out', path.join(tmpOut, 'run-fullpage-pass'),
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
    '--out', path.join(tmpOut, 'run-fullpage-fail'),
  ]);
  assert.equal(failRun.code, 1);
  assert.equal(failRun.json.passed, false);
  assert.equal(failRun.json.gates.gate2.passed, false);
  assert.match(failRun.json.gates.gate2.error, /Dimension mismatch/);

  // Strict 1px boundary check using 480x421 committed PNG (1px taller than 480x420 actual page)
  const tallerRef = path.join(fixturesDir, 'committed-fullpage-1px-taller-1x.png');

  // 1. With --full-page: maxDrift is 0 -> hard fail on 1px height mismatch
  const fail1pxFull = await runCli([
    '--url', `${baseUrl}/committed-fullpage.html`,
    '--ref', tallerRef,
    '--viewport', '480x280',
    '--full-page',
    '--out', path.join(tmpOut, 'run-fullpage-1px-taller-fail'),
  ]);
  assert.equal(fail1pxFull.code, 1);
  assert.equal(fail1pxFull.json.passed, false);
  assert.equal(fail1pxFull.json.gates.gate2.passed, false);
  assert.match(fail1pxFull.json.gates.gate2.error, /Dimension mismatch/);

  // 2. Without --full-page: maxDrift is Math.ceil(dpr) = 1 -> cropped/padded within tolerance and passes (0% mismatch)
  const pass1pxCropped = await runCli([
    '--url', `${baseUrl}/committed-fullpage.html`,
    '--ref', tallerRef,
    '--viewport', '480x420',
    '--out', path.join(tmpOut, 'run-fullpage-1px-taller-cropped-pass'),
  ]);
  assert.equal(pass1pxCropped.code, 0);
  assert.equal(pass1pxCropped.json.passed, true);
  assert.equal(pass1pxCropped.json.gates.gate2.passed, true);
  assert.equal(pass1pxCropped.json.gates.gate2.mismatchPct, 0);
});

test('flags overlapping siblings when data-allow-overlap is absent', async () => {
  const outDir = path.join(tmpOut, 'run-overlap');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/overlapping-layout.html`,
    '--out', outDir,
  ]);
  assert.equal(code, 1);
  assert.equal(json.passed, false);
  assert.equal(json.gates.gate1.passed, false);
  assert.ok(json.gates.gate1.overlappingSiblings.length >= 1);
});

test('flags clipped text and console errors in Gate 1', async () => {
  const outDir = path.join(tmpOut, 'run-clipped-console');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/clipped-and-errors.html`,
    '--out', outDir,
  ]);
  assert.equal(code, 1);
  assert.equal(json.passed, false);
  assert.equal(json.gates.gate1.passed, false);
  assert.ok(json.gates.gate1.clippedTextElements.length >= 1);
  assert.ok(json.gates.gate1.consoleErrors.length >= 1);
});

test('supports --selector with omitted --viewport using full-frame reference dimensions', async () => {
  const outDir = path.join(tmpOut, 'run-selector-omitted-viewport');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/passing-card.html`,
    '--ref', ref1xPath,
    '--selector', '.card',
    '--out', outDir,
  ]);
  assert.equal(code, 0);
  assert.equal(json.passed, true);
  assert.equal(json.gates.gate1.viewport, '480x280');
  assert.equal(json.gates.gate2.passed, true);
  assert.equal(json.gates.gate2.mismatchPct, 0);
});

test('supports --selector with element-sized reference without viewport overflow', async () => {
  const outDir = path.join(tmpOut, 'run-selector-elemref');
  const cardRefPath = path.join(tmpOut, 'card-elem-ref.png');

  // Generate element-sized reference cropped from full 1x reference
  const browser = await chromium.launch();
  let selBox;
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 280 } });
    await page.goto(`${baseUrl}/passing-card.html`, { waitUntil: 'networkidle' });
    selBox = await page.locator('.card').boundingBox();
  } finally {
    await browser.close();
  }

  const { PNG } = await import('pngjs');
  const { cropPng } = await import('../src/visual-diff.mjs');
  const fullRef = PNG.sync.read(fs.readFileSync(ref1xPath));
  const cardCrop = cropPng(fullRef, Math.round(selBox.x), Math.round(selBox.y), Math.round(selBox.width), Math.round(selBox.height));
  fs.writeFileSync(cardRefPath, PNG.sync.write(cardCrop));

  const { code, json } = await runCli([
    '--url', `${baseUrl}/passing-card.html`,
    '--ref', cardRefPath,
    '--selector', '.card',
    '--viewport', '480x280',
    '--out', outDir,
  ]);
  assert.equal(code, 0);
  assert.equal(json.passed, true);
  assert.equal(json.gates.gate1.passed, true);
  assert.equal(json.gates.gate1.horizontalOverflow, false);
  assert.equal(json.gates.gate2.passed, true);
  assert.equal(json.gates.gate2.mismatchPct, 0);
});

test('supports --mask: ignores change inside mask, fails without mask, and fails on outside change', async () => {
  const refMaskPath = path.join(tmpOut, 'ref-mask.png');

  // Capture baseline reference of dynamic-masked.html and #dyn bounding box
  const browser = await chromium.launch();
  let dynBox;
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 280 } });
    await page.goto(`${baseUrl}/dynamic-masked.html`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: refMaskPath });
    dynBox = await page.locator('#dyn').boundingBox();
  } finally {
    await browser.close();
  }

  // 1. Target page has changes inside #dyn, with --mask #dyn -> passes (0% mismatch)
  const run1 = await runCli([
    '--url', `${baseUrl}/dynamic-masked-changed.html`,
    '--ref', refMaskPath,
    '--mask', '#dyn',
    '--out', path.join(tmpOut, 'run-mask-inside-pass'),
  ]);
  assert.equal(run1.code, 0);
  assert.equal(run1.json.passed, true);
  assert.equal(run1.json.gates.gate2.mismatchPct, 0);

  // Verify saved artifacts: scan the ENTIRE masked bounding box in actual.png, diff.png, and composite-diff.png
  const { PNG } = await import('pngjs');
  const actualPng = PNG.sync.read(fs.readFileSync(run1.json.gates.gate2.artifacts.actual));
  const diffPng = PNG.sync.read(fs.readFileSync(run1.json.gates.gate2.artifacts.diff));
  const compositePng = PNG.sync.read(fs.readFileSync(run1.json.gates.gate2.artifacts.composite));
  const startX = Math.max(0, Math.floor(dynBox.x));
  const startY = Math.max(0, Math.floor(dynBox.y));
  const endX = Math.min(actualPng.width, Math.ceil(dynBox.x + dynBox.width));
  const endY = Math.min(actualPng.height, Math.ceil(dynBox.y + dynBox.height));
  const gap = 8;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const actIdx = (y * actualPng.width + x) * 4;
      assert.deepEqual(Array.from(actualPng.data.slice(actIdx, actIdx + 4)), [20, 20, 20, 255]);

      const diffIdx = (y * diffPng.width + x) * 4;
      // No red diff pixel (255,0,0) inside the masked box in diff.png
      assert.notEqual(diffPng.data[diffIdx], 255);

      const refPanelIdx = (y * compositePng.width + x) * 4;
      const actPanelIdx = (y * compositePng.width + (actualPng.width + gap + x)) * 4;
      const diffPanelIdx = (y * compositePng.width + (actualPng.width * 2 + gap * 2 + x)) * 4;
      assert.deepEqual(Array.from(compositePng.data.slice(refPanelIdx, refPanelIdx + 4)), [20, 20, 20, 255]);
      assert.deepEqual(Array.from(compositePng.data.slice(actPanelIdx, actPanelIdx + 4)), [20, 20, 20, 255]);
      assert.notEqual(compositePng.data[diffPanelIdx], 255);
    }
  }

  // 2. Target page has changes inside #dyn, WITHOUT --mask -> fails with diff
  const run2 = await runCli([
    '--url', `${baseUrl}/dynamic-masked-changed.html`,
    '--ref', refMaskPath,
    '--out', path.join(tmpOut, 'run-mask-inside-fail'),
  ]);
  assert.equal(run2.code, 1);
  assert.equal(run2.json.passed, false);
  assert.ok(run2.json.gates.gate2.mismatchPct > 0);

  // 3. Target page has changes outside #dyn, with --mask #dyn -> fails (diff outside mask detected)
  const run3 = await runCli([
    '--url', `${baseUrl}/dynamic-masked-outside.html`,
    '--ref', refMaskPath,
    '--mask', '#dyn',
    '--out', path.join(tmpOut, 'run-mask-outside-fail'),
  ]);
  assert.equal(run3.code, 1);
  assert.equal(run3.json.passed, false);
  assert.ok(run3.json.gates.gate2.mismatchPct > 0);
});

test('fails with a dimension finding when reference dimensions are not divisible by --dpr', async () => {
  const outDir = path.join(tmpOut, 'run-odd-2x');
  const oddRefPath = path.join(tmpOut, 'ref-odd-101x51.png');

  // Generate 101x51 reference image (not divisible by dpr=2)
  const { PNG } = await import('pngjs');
  const odd101x51 = new PNG({ width: 101, height: 51, fill: true });
  fs.writeFileSync(oddRefPath, PNG.sync.write(odd101x51));

  const { code, json } = await runCli([
    '--url', `${baseUrl}/odd-card.html`,
    '--ref', oddRefPath,
    '--dpr', '2',
    '--out', outDir,
  ]);
  assert.equal(code, 1);
  assert.equal(json.passed, false);
  assert.match(json.error?.message, /not divisible by --dpr 2/);
  assert.ok(json.gates.gate2);
  assert.equal(json.gates.gate2.passed, false);
  assert.match(json.gates.gate2.error, /not divisible by --dpr 2/);
  assert.ok(fs.existsSync(json.telemetry));
});

test('rejects --iteration outside 1-5 with JSON on stdout and exit 1', async () => {
  for (const badIter of ['0', '6', '-1', 'abc']) {
    const outDir = path.join(tmpOut, `run-bad-iter-${badIter}`);
    const { code, json } = await runCli([
      '--url', `${baseUrl}/passing-card.html`,
      '--iteration', badIter,
      '--out', outDir,
    ]);
    assert.equal(code, 1);
    assert.equal(json.passed, false);
    assert.match(json.error?.message, /--iteration/);
  }
});

test('emits valid JSON and writes telemetry.jsonl on fatal exits (conn refused, timeout, missing selector, missing ref)', async () => {
  const cases = [
    {
      name: 'conn-refused',
      args: ['--url', 'http://127.0.0.1:54321/'],
      expectedError: /ERR_CONNECTION_REFUSED/,
    },
    {
      name: 'timeout',
      args: ['--url', `${baseUrl}/slow-timeout`, '--timeout', '300'],
      expectedError: /Timeout|timed out/i,
    },
    {
      name: 'missing-selector',
      args: ['--url', `${baseUrl}/passing-card.html`, '--ref', ref1xPath, '--selector', '#does-not-exist'],
      expectedError: /locator.*#does-not-exist|Timeout/i,
    },
    {
      name: 'missing-ref',
      args: ['--url', `${baseUrl}/passing-card.html`, '--ref', path.join(tmpOut, 'non-existent-ref.png')],
      expectedError: /Reference image not found/i,
    },
  ];

  for (const c of cases) {
    const outDir = path.join(tmpOut, `run-fatal-${c.name}`);
    fs.rmSync(outDir, { recursive: true, force: true });
    const { code, json } = await runCli([...c.args, '--out', outDir]);
    assert.equal(code, 1, `${c.name} should exit 1`);
    assert.equal(json.passed, false, `${c.name} should report passed: false`);
    assert.ok(typeof json.error?.message === 'string' && json.error.message.length > 0, `${c.name} should include error`);
    assert.match(json.error?.message, c.expectedError, `${c.name} should match expected error substring`);
    assert.ok(json.telemetry && fs.existsSync(json.telemetry), `${c.name} should write telemetry.jsonl`);
    const lines = fs.readFileSync(json.telemetry, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, 1, `${c.name} should have 1 telemetry entry`);
    assert.equal(lines[0].passed, false);
    assert.ok(typeof lines[0].error === 'string');
    assert.match(lines[0].error, c.expectedError, `${c.name} telemetry error should match expected error substring`);
  }
});

test('pixel-gate --version exits 0 and outputs 0.1.0', async () => {
  const { stdout } = await execFileAsync('node', [cliPath, '--version'], { encoding: 'utf8' });
  assert.equal(stdout.trim(), '0.1.0');
});

test('fails with gate2.landmark.invalid-sidecar and gate2Passed: false when sidecar is malformed JSON', async () => {
  const wireRef = path.join(fixturesDir, 'wireframe-base-1x.png');
  const malformedSidecar = path.join(tmpOut, 'malformed.landmarks.json');
  fs.writeFileSync(malformedSidecar, '{');
  const outDir = path.join(tmpOut, 'run-wireframe-malformed-sidecar');

  const { code, json } = await runCli([
    '--url', `${baseUrl}/wireframe-base.html`,
    '--ref', wireRef,
    '--ref-landmarks', malformedSidecar,
    '--mode', 'wireframe',
    '--out', outDir,
  ]);
  assert.equal(code, 1);
  assert.equal(json.passed, false);
  assert.equal(json.gates.gate2.passed, false);
  assert.ok(json.gates.gate2.findings.some((f) => f.id === 'gate2.landmark.invalid-sidecar'));
  assert.ok(json.findings.some((f) => f.id === 'gate2.landmark.invalid-sidecar'));

  assert.ok(json.telemetry && fs.existsSync(json.telemetry));
  const lines = fs.readFileSync(json.telemetry, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].gate2Passed, false);
  assert.ok(lines[0].findingIds.includes('gate2.landmark.invalid-sidecar'));
});

test('8px Chebyshev clustering boundary merges at distance 8 and splits at distance 9', async () => {
  const { clusterDiffRegions } = await import('../src/visual-diff.mjs');

  // Width 20, Height 1, DPR 1, 8px gap.
  // Case A: Diff at x=0 and x=8 (Chebyshev distance = 8) -> merges into 1 region
  const diffA = new Uint8Array(20 * 1 * 4);
  diffA[0] = 255; diffA[1] = 0; diffA[2] = 0; diffA[3] = 255;
  const idx8 = 8 * 4;
  diffA[idx8] = 255; diffA[idx8 + 1] = 0; diffA[idx8 + 2] = 0; diffA[idx8 + 3] = 255;

  const resA = clusterDiffRegions(diffA, 20, 1, 1, 8);
  assert.equal(resA.regionCount, 1);
  assert.equal(resA.regions.length, 1);
  assert.deepEqual(resA.regions[0].box, { x: 0, y: 0, width: 9, height: 1 });

  // Case B: Diff at x=0 and x=9 (Chebyshev distance = 9) -> stays 2 separate regions
  const diffB = new Uint8Array(20 * 1 * 4);
  diffB[0] = 255; diffB[1] = 0; diffB[2] = 0; diffB[3] = 255;
  const idx9 = 9 * 4;
  diffB[idx9] = 255; diffB[idx9 + 1] = 0; diffB[idx9 + 2] = 0; diffB[idx9 + 3] = 255;

  const resB = clusterDiffRegions(diffB, 20, 1, 1, 8);
  assert.equal(resB.regionCount, 2);
  assert.equal(resB.regions.length, 2);
  assert.deepEqual(resB.regions[0].box, { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual(resB.regions[1].box, { x: 9, y: 0, width: 1, height: 1 });
});

test('Commander parse error records provided --iteration in the report', async () => {
  const { code, json } = await runCli([
    '--iteration', '3',
  ]);
  assert.equal(code, 1);
  assert.equal(json.passed, false);
  assert.equal(json.iteration, 3);
  assert.match(json.error?.message, /--url/);
});

test('landmark finding id suffix 1-based indexing: index 0 omits suffix, index 1 uses .2', async () => {
  const { compareWireframeLandmarks } = await import('../src/visual-diff.mjs');
  const exp0 = { selector: 'header', index: 0, x: 0, y: 0, width: 100, height: 50 };
  const exp1 = { selector: 'header', index: 1, x: 0, y: 60, width: 100, height: 50 };
  const act0 = { selector: 'header', index: 0, x: 10, y: 0, width: 100, height: 50 };
  const act1 = { selector: 'header', index: 1, x: 10, y: 60, width: 100, height: 50 };

  const result = compareWireframeLandmarks([act0, act1], [exp0, exp1], 4, true);
  assert.equal(result.passed, false);
  assert.equal(result.findings.length, 2);
  assert.equal(result.findings[0].id, 'gate2.landmark.header');
  assert.equal(result.findings[1].id, 'gate2.landmark.header.2');
});
