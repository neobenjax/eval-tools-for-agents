/**
 * Process and HTTP helpers for the M3 viewer gap tests.
 * Spawn, fetch, and JSON parse failures are returned as data so a missing
 * `apps/dashboard` fails the caller with ERR_ASSERTION.
 * No network: the dashboard is only ever contacted on 127.0.0.1, and Linear
 * is a local Node stub the test writes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { repoRoot } from './harness.mjs';

export { repoRoot };

export const dashboardBin = path.join(repoRoot, 'apps', 'dashboard', 'bin', 'dashboard.mjs');
export const dashboardClient = path.join(repoRoot, 'apps', 'dashboard', 'client');
export const telemetryFixture = path.join(repoRoot, 'tools', 'pixel-perfect-gate', 'tests', 'fixtures', 'm3', 'telemetry.jsonl');

export const STAGES = ['Todo', 'In Progress', 'In Review', 'Approved', 'Rework'];

export function freshDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `m3-${name}-`));
}

export function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  if (!Object.prototype.hasOwnProperty.call(extra, 'LINEAR_API_KEY')) delete env.LINEAR_API_KEY;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') delete env[key];
  }
  return env;
}

function parseStdoutJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/** Run `apps/dashboard/bin/dashboard.mjs`. Never throws. */
export function runDashboard(args, { cwd = repoRoot, env = {}, timeoutMs = 15_000 } = {}) {
  return new Promise((resolve) => {
    let child;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      child = spawn(process.execPath, [dashboardBin, ...args], {
        cwd,
        env: childEnv(env),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      finish({ code: null, stdout: '', stderr: '', json: null, spawnError: err.message });
      return;
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ code: null, stdout, stderr, json: null, spawnError: 'timeout' });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      finish({ code: null, stdout, stderr, json: null, spawnError: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ code, stdout, stderr, json: parseStdoutJson(stdout), spawnError: null });
    });
  });
}

/**
 * Start `serve`. Resolves when the first stdout line is JSON with `url`,
 * or when the process exits / errors / times out. Never throws.
 */
export function startDashboard(args, { cwd = repoRoot, env = {}, timeoutMs = 8_000 } = {}) {
  return new Promise((resolve) => {
    let child;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      child = spawn(process.execPath, [dashboardBin, ...args], {
        cwd,
        env: childEnv(env),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      finish({ child: null, url: null, json: null, stdout: '', stderr: '', spawnError: err.message });
      return;
    }
    let stdout = '';
    let stderr = '';
    let spawnError = null;
    const timer = setTimeout(() => {
      finish({ child, url: null, json: null, stdout, stderr, spawnError: spawnError || 'timeout' });
    }, timeoutMs);
    const tryReady = () => {
      const line = stdout.split(/\r?\n/, 1)[0];
      if (!line || !line.trim().startsWith('{')) return;
      try {
        const json = JSON.parse(line);
        if (typeof json.url === 'string') {
          clearTimeout(timer);
          finish({ child, url: json.url, json, stdout, stderr, spawnError: null });
        }
      } catch {
        // Wait for a complete first line.
      }
    };
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      tryReady();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      spawnError = err.message;
      clearTimeout(timer);
      finish({ child: null, url: null, json: null, stdout, stderr, spawnError });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ child: null, url: null, json: null, code, stdout, stderr, spawnError });
    });
  });
}

export function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    }, 2_000);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

export async function getUrl(base, pathname) {
  if (!base) return { status: null, text: '', json: null, error: 'no base url' };
  let target;
  try {
    target = new URL(pathname, base.endsWith('/') ? base : `${base}/`);
  } catch (err) {
    return { status: null, text: '', json: null, error: err.message };
  }
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(5_000) });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, text, json, error: null };
  } catch (err) {
    return { status: null, text: '', json: null, error: err.message };
  }
}

/** Local Linear CLI. Records invocations. Does not echo the API key. */
export function writeLinearStub(dir, { issues = [], exitCode = 0, body = null } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const log = path.join(dir, 'linear-stub.log');
  const file = path.join(dir, 'linear-stub.mjs');
  const payload = body === null ? JSON.stringify({ issues }) : body;
  const code = Number.isInteger(exitCode) ? exitCode : 0;
  const source = [
    "import fs from 'node:fs';",
    `const log = ${JSON.stringify(log)};`,
    'fs.appendFileSync(log, JSON.stringify({ invoked: true, hasKey: Boolean(process.env.LINEAR_API_KEY) }) + "\\n");',
    `process.stdout.write(${JSON.stringify(payload)});`,
    `process.exit(${code});`,
    '',
  ].join('\n');
  fs.writeFileSync(file, source);
  return { file, log };
}

export function readStubLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = path.resolve(left);
  const b = path.resolve(right);
  if (process.platform === 'win32') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

export function parseJsonl(text) {
  const rows = [];
  for (const line of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (line.trim() === '') continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

/**
 * Acceptance oracle for benchmark grouping. String order is UTF-16 code units
 * (`<` / `>`), then numeric iteration. Not used by the product.
 */
export function expectedGroups(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const key = `${row.model}\0${row.harness}\0${row.iteration}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  const groups = [...buckets.values()].map((grouped) => ({
    model: grouped[0].model,
    harness: grouped[0].harness,
    iteration: grouped[0].iteration,
    count: grouped.length,
    rows: grouped,
  }));
  groups.sort((a, b) => {
    if (a.model < b.model) return -1;
    if (a.model > b.model) return 1;
    if (a.harness < b.harness) return -1;
    if (a.harness > b.harness) return 1;
    return a.iteration - b.iteration;
  });
  return groups;
}

export function writeJsonl(file, rows, { lineEnding = '\n', trailing = true, extraLines = [] } = {}) {
  const lines = [...rows.map((row) => JSON.stringify(row)), ...extraLines];
  const body = lines.join(lineEnding);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, trailing ? `${body}${lineEnding}` : body);
  return file;
}
