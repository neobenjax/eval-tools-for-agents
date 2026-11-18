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
