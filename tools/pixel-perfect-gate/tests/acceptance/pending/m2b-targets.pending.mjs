/**
 * M2b.4 static and dev-server targets, plus PWA checks.
 * Gap tests fail with ERR_ASSERTION. Process-tree asserts run on every OS.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  compare,
  devServerPath,
  findingIds,
  findings,
  freePort,
  freshDir,
  hangServerPath,
  isAlive,
  makeWork,
  readJson,
  shellQuote,
  writeJson,
  writePng,
  solid,
} from '../m2b-helpers.mjs';

const VIEW = [{ name: 'desktop', width: 400, height: 300 }];

function commandFor(script, extraEnvNote) {
  return `${shellQuote(process.execPath)} ${shellQuote(script)}${extraEnvNote || ''}`;
}

serialTest('M2b-AC-20: `target.kind: "dev-server"` starts `target.command`, waits for `target.readyUrl`, and kills the whole process tree on exit, on both `windows-latest` and `ubuntu-latest` (no orphaned process after the run, asserted by the test).', async () => {
  const port = await freePort();
  const repo = freshDir('m2b', 'ac20');
  const pidFile = path.join(repo, 'pids.json');
  const readyUrl = `http://127.0.0.1:${port}/health`;
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', referenceRequired: false }],
    target: {
      kind: 'dev-server',
      command: commandFor(devServerPath),
      readyUrl,
      readyTimeoutMs: 5000,
    },
  });
  const result = await compare(repo, [], { M2B_PORT: String(port), M2B_PIDFILE: pidFile });
  const pids = readJson(pidFile);
  assert.ok(pids && Number.isInteger(pids.parent) && Number.isInteger(pids.child), 'target.command started and wrote both pids');
  assert.equal(result.code, 0, 'a ready dev server lets the run finish');
  assert.equal(isAlive(pids.parent), false, 'the command process is dead after exit');
  assert.equal(isAlive(pids.child), false, 'the grandchild process is dead after exit');
});

serialTest('M2b-AC-20 break-it: the ready check is an HTTP 200 on target.readyUrl before capture', async () => {
  const port = await freePort();
  const repo = freshDir('m2b', 'ac20-status');
  const pidFile = path.join(repo, 'pids.json');
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', referenceRequired: false }],
    target: {
      kind: 'dev-server',
      command: commandFor(devServerPath),
      readyUrl: `http://127.0.0.1:${port}/status`,
      readyTimeoutMs: 500,
    },
  });
  const result = await compare(repo, [], { M2B_PORT: String(port), M2B_PIDFILE: pidFile });
  assert.equal(result.json && result.json.loop && result.json.loop.stopReason, 'blocked');
  const pids = readJson(pidFile);
  assert.ok(pids && Number.isInteger(pids.parent), 'the command started');
  assert.equal(isAlive(pids.parent), false, 'a non-200 readyUrl still kills the tree');
});

serialTest('M2b-AC-21: A command that never becomes ready fails within `target.readyTimeoutMs` with a `blocked` stop reason and a structured `error`.', async () => {
  const repo = freshDir('m2b', 'ac21');
  const pidFile = path.join(repo, 'pids.json');
  const started = Date.now();
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', referenceRequired: false }],
    target: {
      kind: 'dev-server',
      command: commandFor(hangServerPath),
      readyUrl: 'http://127.0.0.1:9/health',
      readyTimeoutMs: 400,
    },
  });
  const result = await compare(repo, [], { M2B_PIDFILE: pidFile });
  const elapsed = Date.now() - started;
  assert.equal(result.code, 1);
  assert.equal(result.json && result.json.loop && result.json.loop.stopReason, 'blocked');
  assert.equal(typeof (result.json && result.json.error && result.json.error.message), 'string');
  assert.ok(elapsed < 5000, `readyTimeoutMs 400 must fail fast, took ${elapsed}ms`);
  const pids = readJson(pidFile);
  assert.ok(pids && Number.isInteger(pids.parent), 'the command was started');
  assert.equal(isAlive(pids.parent), false, 'the never-ready process is killed');
});

serialTest('M2b-AC-21 break-it: the never-ready process is not left running', async () => {
  const repo = freshDir('m2b', 'ac21-kill');
  const pidFile = path.join(repo, 'pids.json');
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', referenceRequired: false }],
    target: {
      kind: 'dev-server',
      command: commandFor(hangServerPath),
      readyUrl: 'http://127.0.0.1:9/never',
      readyTimeoutMs: 300,
    },
  });
  const result = await compare(repo, [], { M2B_PIDFILE: pidFile });
  assert.equal(result.json && result.json.error && typeof result.json.error.message, 'string');
  const pids = readJson(pidFile);
  assert.ok(pids, 'pid file exists because the command started');
  assert.equal(isAlive(pids.parent), false);
});

serialTest('M2b-AC-22: Visual capture uses `serviceWorkers: "block"`; a fixture whose service worker serves a stale asset does not change the Gate 2 result.', async () => {
  const repo = freshDir('m2b', 'ac22');
  const root = path.join(repo, 'site');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'sw.js'), "self.addEventListener('fetch', (event) => { event.respondWith(new Response('<!doctype html><title>STALE-ASSET</title><main>STALE-ASSET</main>', { headers: { 'content-type': 'text/html' } })); });");
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><head><title>FRESH-DOCUMENT</title><script>navigator.serviceWorker.register("/sw.js")</script></head><body><main>FRESH-DOCUMENT</main></body></html>');
  writePng(path.join(repo, 'references', 'home', 'desktop.png'), 400, 300, solid(255, 255, 255));
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    maxDiff: 100,
    references: 'references',
    routes: [{ id: 'home', path: '/', referenceRequired: true }],
    target: { kind: 'static', root },
  });
  const first = await compare(repo, ['--run-id', 'sw']);
  const second = await compare(repo, ['--run-id', 'sw', '--iteration', '2']);
  const html = first.json && first.json.artifacts && first.json.artifacts.captureHtml;
  assert.equal(typeof html, 'string');
  const body = fs.readFileSync(html, 'utf8');
  assert.equal(body.includes('FRESH-DOCUMENT'), true);
  assert.equal(body.includes('STALE-ASSET'), false);
  assert.equal(first.json.gates.gate2.capture.serviceWorkers, 'block');
  assert.equal(second.json.gates.gate2.checks[0].mismatchPct, first.json.gates.gate2.checks[0].mismatchPct);
});

serialTest('M2b-AC-23: With `pwa` enabled, a fixture missing its manifest icon fails with `gate1.pwa-installability.<error-id>` taken from `Page.getInstallabilityErrors`, and the fixed fixture passes.', async () => {
  const badIds = await probeErrors(pwaSite(false));
  const goodIds = await probeErrors(pwaSite(true));
  assert.ok(Array.isArray(badIds), 'pinned Chromium answered Page.getInstallabilityErrors');
  const bad = await runPwa(false);
  const good = await runPwa(true);
  const reported = findingIds(bad.json).filter((id) => id.startsWith('gate1.pwa-installability.'));
  assert.deepEqual(reported, badIds.map((id) => `gate1.pwa-installability.${id}`));
  assert.deepEqual(bad.json && bad.json.gates && bad.json.gates.gate1 && bad.json.gates.gate1.pwa, {
    source: 'Page.getInstallabilityErrors',
    installabilityErrors: badIds,
  });
  if (badIds.length > 0) {
    assert.equal(bad.code, 1);
    assert.equal(findings(bad.json).every((f) => !f.id.startsWith('gate1.pwa-installability.') || f.severity === 'fail'), true);
  }
  assert.equal(good.code, 0, 'the fixed installable fixture passes');
  assert.deepEqual(findingIds(good.json).filter((id) => id.startsWith('gate1.pwa-installability.')), goodIds.map((id) => `gate1.pwa-installability.${id}`));
});

serialTest('M2b-AC-23 break-it: the fixed installable fixture has no failing installability finding', async () => {
  const ids = await probeErrors(pwaSite(true));
  const result = await runPwa(true);
  assert.equal(result.code, 0);
  assert.deepEqual(result.json && result.json.gates && result.json.gates.gate1 && result.json.gates.gate1.pwa && result.json.gates.gate1.pwa.installabilityErrors, ids);
  assert.equal(findings(result.json).some((f) => f.id.startsWith('gate1.pwa-installability.') && f.severity === 'fail'), false);
});

serialTest('M2b-AC-24: `target.kind: "static"` serves a single HTML file and a directory without extra config.', async () => {
  const fileRepo = freshDir('m2b', 'ac24-file');
  const file = path.join(fileRepo, 'only.html');
  fs.writeFileSync(file, '<!doctype html><html><body><main id="one">file-target</main></body></html>');
  writeJson(path.join(fileRepo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', referenceRequired: false }],
    target: { kind: 'static', file },
  });
  const fileRun = await compare(fileRepo, []);
  assert.equal(fileRun.code, 0);
  assert.equal(fs.readFileSync(fileRun.json.artifacts.captureHtml, 'utf8').includes('file-target'), true);

  const dirRepo = freshDir('m2b', 'ac24-dir');
  const root = path.join(dirRepo, 'site');
  fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'nested', 'index.html'), '<!doctype html><html><body><main>dir-target</main></body></html>');
  writeJson(path.join(dirRepo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/nested/index.html', referenceRequired: false }],
    target: { kind: 'static', root },
  });
  const dirRun = await compare(dirRepo, []);
  assert.equal(dirRun.code, 0);
  assert.equal(fs.readFileSync(dirRun.json.artifacts.captureHtml, 'utf8').includes('dir-target'), true);
  assert.equal(JSON.stringify(fileRun.json.error), 'null');
  assert.equal('baseUrl' in JSON.parse(fs.readFileSync(path.join(fileRepo, 'pixel-gate.config.json'), 'utf8')), false);
});

serialTest('M2b-AC-24 break-it: static mode does not require target.command or baseUrl', async () => {
  const repo = freshDir('m2b', 'ac24-min');
  const file = path.join(repo, 'only.html');
  fs.writeFileSync(file, '<!doctype html><html><body><main>minimal</main></body></html>');
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', referenceRequired: false }],
    target: { kind: 'static', file },
  });
  const result = await compare(repo, []);
  assert.equal(result.code, 0);
  assert.equal(result.json && result.json.error, null);
  assert.equal(/baseUrl|target\.command/.test(JSON.stringify(result.json.error)), false);
});

function pwaSite(fixed) {
  const root = freshDir('m2b', fixed ? 'pwa-good' : 'pwa-bad');
  if (fixed) writePng(path.join(root, 'icon.png'), 192, 192, solid(10, 20, 200));
  const icons = fixed ? [{ src: '/icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' }] : [];
  fs.writeFileSync(path.join(root, 'manifest.webmanifest'), JSON.stringify({
    name: 'Demo', short_name: 'D', start_url: '/', display: 'standalone', icons,
  }));
  fs.writeFileSync(path.join(root, 'sw.js'), "self.addEventListener('install', (e) => self.skipWaiting()); self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));");
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><head><link rel="manifest" href="/manifest.webmanifest"><title>pwa</title></head><body><main>pwa</main><script>navigator.serviceWorker.register("/sw.js")</script></body></html>');
  return root;
}

async function probeErrors(root) {
  const server = http.createServer((req, res) => {
    const file = path.join(root, (req.url || '/').split('?')[0] === '/' ? 'index.html' : (req.url || '/').split('?')[0].slice(1));
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end('no'); return; }
    const type = file.endsWith('.webmanifest') ? 'application/manifest+json' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html';
    res.writeHead(200, { 'content-type': type });
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const session = await page.context().newCDPSession(page);
      await session.send('Page.enable');
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const result = await session.send('Page.getInstallabilityErrors');
      return (result.installabilityErrors || []).map((error) => error.errorId);
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runPwa(fixed) {
  const root = pwaSite(fixed);
  writeJson(path.join(root, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', referenceRequired: false }],
    target: { kind: 'static', root, pwa: true },
  });
  return compare(root, []);
}
