/**
 * Shared helpers for the Milestone 2b acceptance suite.
 * Black-box only: child processes and files. A missing command or unparsable
 * stdout is data, so a gap test fails with ERR_ASSERTION.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { PNG } from 'pngjs';
import { freshDir, runGate, sha256, skillFile, snapshotTree, diffTrees } from './m2-helpers.mjs';

export { freshDir, runGate, sha256, skillFile, snapshotTree, diffTrees };

export const m2bFixtures = path.join(import.meta.dirname, '..', 'fixtures', 'm2b');
export const blueprintPath = path.join(m2bFixtures, 'blueprint.json');
export const devServerPath = path.join(m2bFixtures, 'dev-server.mjs');
export const hangServerPath = path.join(m2bFixtures, 'hang-server.mjs');
export const fontPath = path.join(path.dirname(m2bFixtures), 'm2', 'site', 'fonts', 'codicon.ttf');

export const pixelSourceOfTruth = process.platform !== 'win32';

export const STYLE_PROPS = [
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'padding',
  'margin',
  'gap',
  'border-radius',
];

export const COPYRIGHT_DISCLAIMER =
  "Copying a website's design, text, images, or code can infringe copyright, trademark, or the site's terms of service. A visual or functional copy does not give you any rights to the original. Only publish a copy you own, have a license for, or have permission to make. This tool does not check rights for you.";

export const TINY_JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda00080001000100003f00fbffd9',
  'hex'
);

export const TINY_WEBP = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');

export const BUILD_TYPES = ['block-theme', 'classic-theme', 'hybrid-theme', 'patterns', 'custom-blocks', 'page-builder', 'any'];

export function shellQuote(value) {
  const text = String(value);
  if (process.platform === 'win32') return `"${text.replace(/"/g, '""')}"`;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function makeWork(name, config, files = {}) {
  const repo = freshDir('m2b', name);
  writeJson(path.join(repo, 'pixel-gate.config.json'), config);
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(repo, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return repo;
}

export function baseRoute(overrides = {}) {
  return {
    id: 'home',
    path: '/',
    referenceRequired: true,
    ...overrides,
  };
}

export async function capture(repo, args = [], env = {}) {
  return runGate(repo, ['reference', 'capture', '--config', 'pixel-gate.config.json', ...args], env);
}

export async function compare(repo, args = [], env = {}) {
  return runGate(repo, ['--config', 'pixel-gate.config.json', ...args], env);
}

export function findingIds(report) {
  return Array.isArray(report?.findings) ? report.findings.map((f) => f.id) : [];
}

export function findings(report) {
  return Array.isArray(report?.findings) ? report.findings : [];
}

export function bundleDir(repo, route = 'home', viewport = 'desktop') {
  return path.join(repo, '.visual-eval', 'references', route, viewport);
}

export function readManifest(repo, route = 'home', viewport = 'desktop') {
  return readJson(path.join(bundleDir(repo, route, viewport), 'manifest.json'));
}

export function pngSize(file) {
  try {
    const buf = fs.readFileSync(file);
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: png.data };
  } catch {
    return null;
  }
}

export function writePng(file, width, height, paint) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * width + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = a;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
  return file;
}

export function solid(r, g, b) {
  return () => [r, g, b, 255];
}

export function skillText() {
  try {
    return fs.readFileSync(skillFile, 'utf8');
  } catch {
    return '';
  }
}

export function filesContaining(dir, needle) {
  const hits = [];
  if (!fs.existsSync(dir)) return hits;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const buf = fs.readFileSync(full);
        if (buf.includes(needle)) hits.push(full);
      }
    }
  };
  walk(dir);
  return hits;
}

export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function freePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/**
 * PATH stub for `npx`. Records every invocation. Serves a local WordPress-shaped
 * HTTP server when argv names @wp-playground/cli or @wordpress/env and includes --port.
 */
export function npxStub(dir) {
  const log = path.join(dir, 'npx-log.jsonl');
  const script = path.join(dir, 'npx-stub.mjs');
  fs.writeFileSync(log, '');
  fs.writeFileSync(
    script,
    [
      "import http from 'node:http';",
      "import fs from 'node:fs';",
      'const log = process.env.M2B_NPX_LOG;',
      'const args = process.argv.slice(2);',
      "fs.appendFileSync(log, JSON.stringify({ argv: args }) + '\\n');",
      "const pkg = args.find((a) => String(a).startsWith('@'));",
      "if (pkg !== '@wp-playground/cli' && pkg !== '@wordpress/env') process.exit(0);",
      "const portFlag = args.indexOf('--port');",
      'const port = portFlag === -1 ? 0 : Number(args[portFlag + 1]);',
      'if (!port) process.exit(0);',
      "const html = process.env.M2B_WP_HTML ? fs.readFileSync(process.env.M2B_WP_HTML) : Buffer.from('<!doctype html><main>wp</main>');",
      "const raw = process.env.M2B_WP_RAW || '';",
      'const server = http.createServer((req, res) => {',
      "  const u = new URL(req.url || '/', 'http://127.0.0.1');",
      "  fs.appendFileSync(log, JSON.stringify({ url: u.pathname + u.search, auth: req.headers.authorization || '' }) + '\\n');",
      "  if (u.pathname === '/wp-json' || u.pathname === '/wp-json/') {",
      "    res.writeHead(200, { 'content-type': 'application/json' });",
      "    res.end(JSON.stringify({ name: 'stub', namespaces: ['wp/v2'] }));",
      '    return;',
      '  }',
      "  if (u.pathname.startsWith('/wp-json/wp/v2/pages/')) {",
      "    res.writeHead(200, { 'content-type': 'application/json' });",
      "    res.end(JSON.stringify({ id: 1, content: { raw } }));",
      '    return;',
      '  }',
      "  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });",
      '  res.end(html);',
      '});',
      "server.listen(port, '127.0.0.1');",
      '',
    ].join('\n')
  );
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const node = process.execPath;
  fs.writeFileSync(path.join(bin, 'npx'), `#!/bin/sh\nexec ${shellQuote(node)} ${shellQuote(script)} "$@"\n`);
  fs.chmodSync(path.join(bin, 'npx'), 0o755);
  fs.writeFileSync(path.join(bin, 'npx.cmd'), `@echo off\r\n"${node}" "${script}" %*\r\n`);
  const pathEnv = `${bin}${path.delimiter}${process.env.PATH || process.env.Path || ''}`;
  return {
    log,
    env: { PATH: pathEnv, Path: pathEnv, M2B_NPX_LOG: log },
    entries() {
      return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
    },
  };
}

export function readSkillOrEmpty() {
  return skillText();
}

export async function runPrompted(repo, args, answer) {
  if (process.platform === 'win32') {
    return { code: null, stdout: '', stderr: '', json: null, spawnError: 'pty-skipped-on-windows' };
  }
  const { spawn } = await import('node:child_process');
  const py = [
    'import os, pty, subprocess, sys, threading, time',
    'master, slave = pty.openpty()',
    'proc = subprocess.Popen(sys.argv[1:], stdin=slave, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=os.environ["M2B_CWD"])',
    'os.close(slave)',
    'def send():',
    '    time.sleep(0.3)',
    '    os.write(master, os.environ.get("M2B_ANSWER", "").encode())',
    'threading.Thread(target=send, daemon=True).start()',
    'out, err = proc.communicate(timeout=60)',
    'sys.stdout.buffer.write(out)',
    'sys.stderr.buffer.write(err)',
    'sys.exit(proc.returncode if proc.returncode is not None else 1)',
  ].join('\n');
  const script = path.join(repo, 'pty-driver.py');
  fs.writeFileSync(script, py);
  const { cliPath } = await import('./harness.mjs');
  return new Promise((resolve) => {
    const child = spawn('python3', [script, process.execPath, cliPath, ...args], {
      cwd: repo,
      env: { ...process.env, M2B_CWD: repo, M2B_ANSWER: answer },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 70_000);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, json: null, spawnError: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let json = null;
      try { json = JSON.parse(stdout); } catch { json = null; }
      resolve({ code, stdout, stderr, json, spawnError: null });
    });
  });
}

export function telemetryRow(overrides) {
  return {
    schemaVersion: 1,
    runId: 'run-a',
    iteration: 1,
    mismatchPct: 0,
    failCount: 0,
    findingIds: [],
    gate1Passed: true,
    gate2Passed: true,
    durationMs: 1,
    model: 'unknown',
    harness: 'cli',
    ...overrides,
  };
}

export function seedTelemetry(repo, rows) {
  const dir = path.join(repo, '.visual-eval');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'telemetry.jsonl');
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  return file;
}

export function prototypeHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face { font-family: Codicon; src: url("fonts/codicon.ttf"); }
  html, body { margin: 0; width: 400px; height: 300px; font-family: Codicon; background: #fff; }
  header { height: 40px; background: #eee; }
  main { padding: 8px; }
  #banner { background: #111; color: #fff; }
  button { background: #1a73e8; color: #fff; font-family: Codicon; }
  #out { color: #111; }
</style>
</head>
<body>
  <header id="header">Header</header>
  <main>
    <div id="banner">cookies <button id="cookie-accept" type="button">Accept</button></div>
    <button id="go" type="button" class="go">Subscribe</button>
    <p id="out">idle</p>
  </main>
  <script>
    document.getElementById('cookie-accept').addEventListener('click', () => {
      document.getElementById('banner').remove();
    });
    document.getElementById('go').addEventListener('click', () => {
      document.getElementById('out').textContent = 'done';
      localStorage.setItem('pg', 'from-ref');
      fetch('/__clicked');
    });
    const seen = localStorage.getItem('pg');
    if (seen) document.body.dataset.storage = seen;
  </script>
</body>
</html>
`;
}

export function copyPrototype(repo, name = 'prototype.html') {
  fs.mkdirSync(path.join(repo, 'fonts'), { recursive: true });
  fs.copyFileSync(fontPath, path.join(repo, 'fonts', 'codicon.ttf'));
  const file = path.join(repo, name);
  fs.writeFileSync(file, prototypeHtml());
  return file;
}
