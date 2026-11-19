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
    '--out', outDir,
  ]);
  assert.equal(code, 0);
  assert.equal(json.passed, true);
  assert.equal(json.gate2.mode, 'wireframe');
  assert.equal(fs.existsSync(json.gate2.artifacts.composite), true);
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

test('supports --selector cropping with full-frame reference', async () => {
  const outDir = path.join(tmpOut, 'run-selector-fullref');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/passing-card.html`,
    '--ref', ref1xPath,
    '--selector', '.card',
    '--viewport', '480x280',
    '--out', outDir,
  ]);
  assert.equal(code, 0);
  assert.equal(json.passed, true);
  assert.equal(json.gate1.passed, true);
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

  // Verify saved artifacts: masked region uses the same opaque fill in Reference, Actual, and composite
  const { PNG } = await import('pngjs');
  const actualPng = PNG.sync.read(fs.readFileSync(run1.json.gate2.artifacts.actual));
  const compositePng = PNG.sync.read(fs.readFileSync(run1.json.gate2.artifacts.composite));
  const cx = Math.round(dynBox.x + dynBox.width / 2);
  const cy = Math.round(dynBox.y + dynBox.height / 2);
  const actIdx = (cy * actualPng.width + cx) * 4;
  assert.deepEqual(Array.from(actualPng.data.slice(actIdx, actIdx + 4)), [20, 20, 20, 255]);

  const gap = 8;
  const refPanelIdx = (cy * compositePng.width + cx) * 4;
  const actPanelIdx = (cy * compositePng.width + (480 + gap + cx)) * 4;
  const diffPanelIdx = (cy * compositePng.width + (480 * 2 + gap * 2 + cx)) * 4;
  assert.deepEqual(Array.from(compositePng.data.slice(refPanelIdx, refPanelIdx + 4)), [20, 20, 20, 255]);
  assert.deepEqual(Array.from(compositePng.data.slice(actPanelIdx, actPanelIdx + 4)), [20, 20, 20, 255]);
  // Diff panel should not be a solid white slab (alpha-0 artifact) or red diff
  assert.notEqual(compositePng.data[diffPanelIdx], 255);

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

test('handles odd reference dimensions at @2x DPR with 0% mismatch on self-crop', async () => {
  const outDir = path.join(tmpOut, 'run-odd-2x');
  const oddRefPath = path.join(tmpOut, 'ref-odd-101x51.png');

  // Generate 101x51 reference image from odd-card.html
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 51, height: 26 }, deviceScaleFactor: 2 });
    await page.goto(`${baseUrl}/odd-card.html`, { waitUntil: 'networkidle' });
    const rawOdd = path.join(tmpOut, 'odd-raw-102x52.png');
    await page.screenshot({ path: rawOdd });
    const { PNG } = await import('pngjs');
    const { cropPng } = await import('../src/visual-diff.mjs');
    const oddRawPng = PNG.sync.read(fs.readFileSync(rawOdd));
    const odd101x51 = cropPng(oddRawPng, 0, 0, 101, 51);
    fs.writeFileSync(oddRefPath, PNG.sync.write(odd101x51));
  } finally {
    await browser.close();
  }

  const { code, json } = await runCli([
    '--url', `${baseUrl}/odd-card.html`,
    '--ref', oddRefPath,
    '--dpr', '2',
    '--out', outDir,
  ]);
  assert.equal(code, 0);
  assert.equal(json.passed, true);
  assert.equal(json.gate2.dimensions, '101x51');
  assert.equal(json.gate2.mismatchPct, 0);
});

test('emits valid JSON on stdout and exits 1 on fatal connection errors', async () => {
  const outDir = path.join(tmpOut, 'run-fatal-conn');
  const { code, json } = await runCli([
    '--url', 'http://127.0.0.1:1/',
    '--out', outDir,
  ]);
  assert.equal(code, 1);
  assert.equal(json.passed, false);
  assert.ok(typeof json.error === 'string');
});

test('emits valid JSON on stdout and exits 1 when reference file is missing', async () => {
  const outDir = path.join(tmpOut, 'run-missing-ref');
  const { code, json } = await runCli([
    '--url', `${baseUrl}/passing-card.html`,
    '--ref', path.join(tmpOut, 'non-existent-ref.png'),
    '--out', outDir,
  ]);
  assert.equal(code, 1);
  assert.equal(json.passed, false);
  assert.ok(typeof json.error === 'string');
});
