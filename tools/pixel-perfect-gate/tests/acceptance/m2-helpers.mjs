/**
 * Shared helpers for the Milestone 2 acceptance suite.
 *
 * Everything here is black-box: tests drive the `pixel-gate` CLI, the installer,
 * and the harness-smoke checker as child processes and read the files they write.
 * Nothing here imports product code from `src/`.
 *
 * Helpers never throw on product gaps. A missing script, a missing flag, or
 * unparsable stdout is returned as data (`spawnError`, `json: null`) so the
 * calling test fails with `ERR_ASSERTION` and not with a crash.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pkgRoot, repoRoot, fixturesDir, cliPath } from './harness.mjs';

export { pkgRoot, repoRoot, fixturesDir, cliPath };

export const m2Fixtures = path.join(fixturesDir, 'm2');
export const siteRoot = fixturesDir; // pages live at /m2/site/*.html
export const m2Tmp = path.join(pkgRoot, '.visual-eval-test', 'm2');
export const skillDir = path.join(pkgRoot, 'skills', 'pixel-perfect-gate');
export const skillFile = path.join(skillDir, 'SKILL.md');
export const installerPath = path.join(pkgRoot, 'scripts', 'install.mjs');
export const smokePath = path.join(pkgRoot, 'scripts', 'harness-smoke.mjs');
export const smokePromptPath = path.join(pkgRoot, 'scripts', 'harness-smoke.prompt.txt');
export const ciWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const VIEWPORTS = [
  { name: 'desktop', width: 400, height: 300 },
  { name: 'mobile', width: 200, height: 300 },
];

export const HARNESSES = ['antigravity-desktop', 'antigravity-cli', 'cursor'];

/** Skill destinations relative to the home directory (SPEC section 8, SIDE-21). */
export const SKILL_DESTINATIONS = {
  'antigravity-desktop': ['.gemini', 'config', 'skills'],
  'antigravity-cli': ['.gemini', 'antigravity-cli', 'skills'],
  cursor: ['.cursor', 'skills'],
};

export function freshDir(...segments) {
  const dir = path.join(m2Tmp, ...segments);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

export function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function isPng(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    return buf.equals(PNG_SIGNATURE) && fs.statSync(file).size > 67;
  } catch {
    return false;
  }
}

/** Copy committed reference PNGs (`route/viewport`) from fixtures/m2/refs into `<repo>/<refsDir>`. */
export function copyRefs(repo, keys, refsDir = 'references') {
  for (const key of keys) {
    const [route, viewport] = key.split('/');
    const from = path.join(m2Fixtures, 'refs', route, `${viewport}.png`);
    const to = path.join(repo, refsDir, route, `${viewport}.png`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

/**
 * Static fixture server with an event log.
 * Requests to `/__<name>?...` are recorded in `events` and answered `204`, so a fixture page can
 * prove which actions really ran (a form submit, a click order) without trusting the CLI report.
 * `delays` maps a request path to a response delay in ms (used to prove the font wait).
 */
export async function startFixtureServer(root = siteRoot, { delays = {} } = {}) {
  const base = path.resolve(root);
  const events = [];
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    requests.push(url.pathname);
    if (url.pathname.startsWith('/__')) {
      events.push({ name: url.pathname.slice(3), query: Object.fromEntries(url.searchParams) });
      res.writeHead(204);
      res.end();
      return;
    }
    const filePath = path.resolve(base, `.${decodeURIComponent(url.pathname)}`);
    const rel = path.relative(base, filePath);
    const send = () => {
      if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    };
    const delay = delays[url.pathname];
    if (delay) setTimeout(send, delay);
    else send();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    events,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** A second origin that serves a red PNG and counts every request that reaches it. */
export async function startSink() {
  const red = fs.readFileSync(path.join(m2Fixtures, 'red-40.png'));
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' });
    res.end(red);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Run a node script. Never throws. `json` is the whole of stdout parsed as one JSON value, else null. */
export function runNode(args, { cwd = pkgRoot, env = {}, input, timeoutMs = 90_000 } = {}) {
  return new Promise((resolve) => {
    const cleanEnv = { ...process.env, ...env };
    delete cleanEnv.NODE_TEST_CONTEXT;
    let child;
    try {
      child = spawn(process.execPath, args, { cwd, env: cleanEnv, windowsHide: true });
    } catch (err) {
      resolve({ code: null, stdout: '', stderr: '', json: null, spawnError: err.message });
      return;
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, json: null, spawnError: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        json = null;
      }
      resolve({ code, stdout, stderr, json, spawnError: null });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

export function runGate(cwd, args, env = {}) {
  return runNode([cliPath, ...args], { cwd, env });
}

export function runInstaller(args, opts = {}) {
  return runNode([installerPath, ...args], opts);
}

export function runSmoke(args, opts = {}) {
  return runNode([smokePath, ...args], opts);
}

export function baseConfig(baseUrl, overrides = {}) {
  return {
    baseUrl,
    viewports: VIEWPORTS,
    dpr: 1,
    maxDiff: 0.5,
    threshold: 0.1,
    masks: ['#clock'],
    routes: [{ id: 'home', path: '/m2/site/home.html', referenceRequired: true }],
    references: 'references',
    ...overrides,
  };
}

export function writeConfig(repo, config, name = 'pixel-gate.config.json') {
  const file = path.join(repo, name);
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return file;
}

/** Map of relative posix path to sha256 for every file under `dir`. */
export function snapshotTree(dir) {
  const out = new Map();
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full).split(path.sep).join('/');
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.set(rel, sha256(full));
      else out.set(rel, `non-file:${entry.isSymbolicLink() ? 'link' : 'other'}`);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

export function diffTrees(before, after) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const [file, hash] of after) {
    if (!before.has(file)) added.push(file);
    else if (before.get(file) !== hash) changed.push(file);
  }
  for (const file of before.keys()) if (!after.has(file)) removed.push(file);
  return { added, removed, changed };
}

export const ENVELOPE_KEYS = [
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

/** Returns a list of problems with a section 6 envelope. Empty list means well formed. */
export function envelopeProblems(report) {
  if (!report || typeof report !== 'object') return ['stdout is not one JSON object'];
  const problems = [];
  for (const key of ENVELOPE_KEYS) if (!(key in report)) problems.push(`missing key ${key}`);
  if (report.schemaVersion !== 1) problems.push('schemaVersion is not 1');
  if (typeof report.passed !== 'boolean') problems.push('passed is not boolean');
  if (report.exitCode !== (report.passed ? 0 : 1)) problems.push('exitCode does not follow passed');
  if (!Array.isArray(report.findings)) problems.push('findings is not an array');
  if (!report.gates || typeof report.gates !== 'object') problems.push('gates is not an object');
  else for (const gate of ['gate1', 'gate2', 'gate3']) if (!(gate in report.gates)) problems.push(`gates.${gate} missing`);
  return problems;
}

export function findingsOf(report) {
  return Array.isArray(report?.findings) ? report.findings : [];
}

export function findingIds(report) {
  return findingsOf(report).map((f) => f.id);
}

export function gate3Findings(report) {
  return findingsOf(report).filter((f) => f.gate === 'gate3');
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve CSS selectors from findings on a live page. Returns one row per selector with how many
 * elements it matches and the `id` attribute of the match, so a test can tie a finding to the exact
 * fixture element and not to a vague count.
 */
export async function resolveSelectors(url, selectors) {
  if (selectors.length === 0) return [];
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(url);
    const rows = [];
    for (const selector of selectors) {
      try {
        const loc = page.locator(selector);
        const count = await loc.count();
        rows.push({ selector, count, id: count === 1 ? await loc.first().getAttribute('id') : null });
      } catch {
        rows.push({ selector, count: -1, id: null });
      }
    }
    return rows;
  } finally {
    await browser.close();
  }
}

/** Element ids that a set of findings points at, via their `selector`. */
export async function elementIdsFor(url, findings) {
  const rows = await resolveSelectors(url, findings.map((f) => f.selector));
  return rows.map((r) => r.id);
}

/** Start a fixture server for the duration of `fn`, then close it. */
export async function withServer(fn, opts) {
  const server = await startFixtureServer(siteRoot, opts);
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

/**
 * Build a throwaway "second repo": a target app with its own manifest and lockfile, a
 * `pixel-gate.config.json`, and committed reference PNGs copied from fixtures/m2/refs.
 * `config` overrides baseConfig keys (set a key to `undefined` to drop it). `files` maps a repo
 * relative path to its text content.
 */
export function makeRepo(name, baseUrl, { config = {}, refs = ['home/desktop', 'home/mobile'], files = {}, configName } = {}) {
  const repo = freshDir(name);
  fs.writeFileSync(
    path.join(repo, 'package.json'),
    `${JSON.stringify({ name: 'target-app', version: '1.0.0', private: true, dependencies: {} }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(repo, 'package-lock.json'),
    `${JSON.stringify({ name: 'target-app', version: '1.0.0', lockfileVersion: 3, requires: true, packages: {} }, null, 2)}\n`
  );
  copyRefs(repo, refs);
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(repo, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const configPath = writeConfig(repo, baseConfig(baseUrl, config), configName);
  return { repo, configPath };
}

/**
 * A preload that records every connection or DNS lookup to a non-loopback host made by the CLI
 * process. Used to prove the CLI never opens a connection to a model service.
 */
export function netSpy(dir) {
  const log = path.join(dir, 'net-spy.log');
  const script = path.join(dir, 'net-spy.cjs');
  fs.writeFileSync(
    script,
    [
      "const net = require('node:net');",
      "const dns = require('node:dns');",
      "const fs = require('node:fs');",
      'const log = process.env.NET_SPY_LOG;',
      "const loop = (h) => !h || h === 'localhost' || /^127\\./.test(h) || h === '::1';",
      'const connect = net.Socket.prototype.connect;',
      'net.Socket.prototype.connect = function (...args) {',
      '  try {',
      '    const o = args[0];',
      "    const host = o && typeof o === 'object' ? o.host : typeof args[1] === 'string' ? args[1] : undefined;",
      "    const sock = o && typeof o === 'object' ? o.path : undefined;",
      "    if (!sock && !loop(host)) fs.appendFileSync(log, 'connect:' + host + '\\n');",
      '  } catch {}',
      '  return connect.apply(this, args);',
      '};',
      'const lookup = dns.lookup;',
      'dns.lookup = function (host, ...rest) {',
      "  if (!loop(host)) { try { fs.appendFileSync(log, 'dns:' + host + '\\n'); } catch {} }",
      '  return lookup.call(this, host, ...rest);',
      '};',
      '',
    ].join('\n')
  );
  fs.writeFileSync(log, '');
  const preload = script.split(path.sep).join('/');
  return {
    env: { NODE_OPTIONS: `--require "${preload}"`, NET_SPY_LOG: log },
    lines: () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean),
  };
}

export function onPathEnv(binDir) {
  return { PATH: `${binDir}${path.delimiter}${process.env.PATH || process.env.Path || ''}` };
}

/** First hit for `name` on the PATH in `env`, or null. Uses `where` on Windows and `command -v` elsewhere. */
export function whichOnPath(name, env) {
  const merged = { ...process.env, ...env };
  if (process.platform === 'win32') {
    const r = spawnSync('where', [name], { env: merged, encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) return null;
    return r.stdout.split(/\r?\n/).find(Boolean) || null;
  }
  const r = spawnSync('sh', ['-c', `command -v ${name}`], { env: merged, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

/** Run `pixel-gate` as a shell would resolve it from the PATH in `env`. */
export function runOnPath(command, args, env, cwd = os.tmpdir()) {
  const merged = { ...process.env, ...env };
  delete merged.NODE_TEST_CONTEXT;
  const r = spawnSync(command, args, {
    env: merged,
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
    timeout: 60_000,
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error ? r.error.message : null };
}

/** Link kind for a path: 'junction' | 'symlink' | 'directory' | 'file' | 'missing'. */
export function linkKind(target) {
  let st;
  try {
    st = fs.lstatSync(target);
  } catch {
    return 'missing';
  }
  if (st.isSymbolicLink()) {
    if (process.platform === 'win32') {
      const r = spawnSync(
        'powershell',
        ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${target.replace(/'/g, "''")}' -Force).LinkType`],
        { encoding: 'utf8', windowsHide: true }
      );
      return r.stdout.trim() === 'Junction' ? 'junction' : 'symlink';
    }
    return 'symlink';
  }
  return st.isDirectory() ? 'directory' : 'file';
}

export function realOrNull(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

/** Install into a throwaway home and bin dir. Returns the run result plus the dirs. */
export async function installToTemp(name, extraArgs = ['--skip-chromium'], opts = {}) {
  const home = opts.home || freshDir(name, 'home');
  const binDir = opts.binDir || freshDir(name, 'bin');
  const run = await runInstaller(['--home', home, '--bin-dir', binDir, ...extraArgs], opts.run || {});
  return { run, home, binDir };
}

/** Skill directory a harness reads, for a given fake home. */
export function skillDestination(home, harness) {
  return path.join(home, ...SKILL_DESTINATIONS[harness], 'pixel-perfect-gate');
}

/** Pinned playwright version from the package manifest (string, may be a range if not pinned). */
export function playwrightSpec() {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
  return pkg.dependencies?.playwright ?? null;
}
