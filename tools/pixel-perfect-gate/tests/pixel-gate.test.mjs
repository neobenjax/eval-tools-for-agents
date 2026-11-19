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
  assert.equal(json.gate1.passed, true);
  assert.equal(json.gate2.passed, true);
  assert.equal(json.gate2.mismatchPct, 0);
  assert.equal(fs.existsSync(json.gate2.artifacts.composite), true);
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
  assert.equal(json.gate1.passed, false);
  assert.equal(json.gate1.horizontalOverflow, true);
  assert.ok(json.gate1.networkErrors.length >= 1);
  assert.ok(json.gate1.brokenImages.length >= 1);
  assert.equal(json.gate1.overlappingSiblings.length, 0);
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
  assert.equal(json.gate2.dimensions, '960x560');
  assert.equal(json.gate2.mismatchPct, 0);
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
  assert.equal(json.gate2.mode, 'wireframe');
  assert.equal(fs.existsSync(json.gate2.artifacts.composite), true);
});

test('wireframe mode: passes color-only changes, fails on >4px landmark shift and blank page', async () => {
  const wireRef = path.join(fixturesDir, 'wireframe-base-1x.png');
  const wireLandmarks = path.join(fixturesDir, 'wireframe-base.landmarks.json');

  // 1. Color-only change with identical landmark boxes -> passes
  const passRun = await runCli([
    '--url', `${baseUrl}/wireframe-color-only.html`,
    '--ref', wireRef,
    '--ref-landmarks', wireLandmarks,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-color-only'),
  ]);
  assert.equal(passRun.code, 0);
  assert.equal(passRun.json.passed, true);
  assert.equal(passRun.json.gate2.passed, true);
  assert.equal(passRun.json.gate2.findings.length, 0);

  // 2. Shifted <main> landmark (>4px) -> fails
  const shiftRun = await runCli([
    '--url', `${baseUrl}/wireframe-shifted.html`,
    '--ref', wireRef,
    '--ref-landmarks', wireLandmarks,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-shifted'),
  ]);
  assert.equal(shiftRun.code, 1);
  assert.equal(shiftRun.json.passed, false);
  assert.equal(shiftRun.json.gate2.passed, false);
  assert.ok(shiftRun.json.gate2.findings.some((f) => f.id === 'gate2.landmark.main'));

  // 3. Blank page (0 landmarks) -> fails
  const blankRun = await runCli([
    '--url', `${baseUrl}/wireframe-blank.html`,
    '--ref', wireRef,
    '--ref-landmarks', wireLandmarks,
    '--mode', 'wireframe',
    '--out', path.join(tmpOut, 'run-wireframe-blank'),
  ]);
  assert.equal(blankRun.code, 1);
  assert.equal(blankRun.json.passed, false);
  assert.equal(blankRun.json.gate2.passed, false);
  assert.ok(blankRun.json.gate2.findings.some((f) => f.id === 'gate2.landmark.missing-page-landmarks'));
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
  assert.equal(json.gate2.passed, true);
  assert.equal(json.gate2.mismatchPct, 0);
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
  assert.equal(passRun.json.gate2.dimensions, '480x420');
  assert.equal(passRun.json.gate2.mismatchPct, 0);

  const failRun = await runCli([
    '--url', `${baseUrl}/fullpage-height-mismatch.html`,
    '--ref', fullRef,
    '--viewport', '480x280',
    '--full-page',
    '--out', path.join(tmpOut, 'run-fullpage-fail'),
  ]);
  assert.equal(failRun.code, 1);
  assert.equal(failRun.json.passed, false);
  assert.equal(failRun.json.gate2.passed, false);
  assert.match(failRun.json.gate2.error, /Dimension mismatch/);
});

test('flags overlapping siblings when data-allow-overlap is absent', async () => {
  const outDir = path.join(tmpOut, 'run-overlap');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/overlapping-layout.html`,
    '--out', outDir,
  ]);
  assert.equal(code, 1);
  assert.equal(json.passed, false);
  assert.equal(json.gate1.passed, false);
  assert.ok(json.gate1.overlappingSiblings.length >= 1);
});

test('flags clipped text and console errors in Gate 1', async () => {
  const outDir = path.join(tmpOut, 'run-clipped-console');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/clipped-and-errors.html`,
    '--out', outDir,
  ]);
  assert.equal(code, 1);
  assert.equal(json.passed, false);
  assert.equal(json.gate1.passed, false);
  assert.ok(json.gate1.clippedTextElements.length >= 1);
  assert.ok(json.gate1.consoleErrors.length >= 1);
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
  assert.equal(json.gate1.viewport, '480x280');
  assert.equal(json.gate2.passed, true);
  assert.equal(json.gate2.mismatchPct, 0);
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
  assert.equal(json.gate1.passed, true);
  assert.equal(json.gate1.horizontalOverflow, false);
  assert.equal(json.gate2.passed, true);
  assert.equal(json.gate2.mismatchPct, 0);
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
  assert.equal(run1.json.gate2.mismatchPct, 0);

  // Verify saved artifacts: scan the ENTIRE masked bounding box in actual.png, diff.png, and composite-diff.png
  const { PNG } = await import('pngjs');
  const actualPng = PNG.sync.read(fs.readFileSync(run1.json.gate2.artifacts.actual));
  const diffPng = PNG.sync.read(fs.readFileSync(run1.json.gate2.artifacts.diff));
  const compositePng = PNG.sync.read(fs.readFileSync(run1.json.gate2.artifacts.composite));
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
      const actPanelIdx = (y * compositePng.width + (480 + gap + x)) * 4;
      const diffPanelIdx = (y * compositePng.width + (480 * 2 + gap * 2 + x)) * 4;
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
  assert.ok(run2.json.gate2.mismatchPct > 0);

  // 3. Target page has changes outside #dyn, with --mask #dyn -> fails (diff outside mask detected)
  const run3 = await runCli([
    '--url', `${baseUrl}/dynamic-masked-outside.html`,
    '--ref', refMaskPath,
    '--mask', '#dyn',
    '--out', path.join(tmpOut, 'run-mask-outside-fail'),
  ]);
  assert.equal(run3.code, 1);
  assert.equal(run3.json.passed, false);
  assert.ok(run3.json.gate2.mismatchPct > 0);
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
  assert.match(json.error, /not divisible by --dpr 2/);
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
    assert.match(json.error, /--iteration/);
  }
});

test('emits valid JSON and writes telemetry.jsonl on fatal exits (conn refused, timeout, missing selector, missing ref)', async () => {
  const cases = [
    {
      name: 'conn-refused',
      args: ['--url', 'http://127.0.0.1:1/'],
    },
    {
      name: 'timeout',
      args: ['--url', `${baseUrl}/slow-timeout`, '--timeout', '300'],
    },
    {
      name: 'missing-selector',
      args: ['--url', `${baseUrl}/passing-card.html`, '--ref', ref1xPath, '--selector', '#does-not-exist'],
    },
    {
      name: 'missing-ref',
      args: ['--url', `${baseUrl}/passing-card.html`, '--ref', path.join(tmpOut, 'non-existent-ref.png')],
    },
  ];

  for (const c of cases) {
    const outDir = path.join(tmpOut, `run-fatal-${c.name}`);
    const { code, json } = await runCli([...c.args, '--out', outDir]);
    assert.equal(code, 1, `${c.name} should exit 1`);
    assert.equal(json.passed, false, `${c.name} should report passed: false`);
    assert.ok(typeof json.error === 'string' && json.error.length > 0, `${c.name} should include error`);
    assert.ok(json.telemetry && fs.existsSync(json.telemetry), `${c.name} should write telemetry.jsonl`);
    const lines = fs.readFileSync(json.telemetry, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, 1, `${c.name} should have 1 telemetry entry`);
    assert.equal(lines[0].passed, false);
    assert.ok(typeof lines[0].error === 'string');
  }
});
