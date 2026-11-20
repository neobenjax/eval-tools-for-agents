import test from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const pkgRoot = path.resolve(import.meta.dirname, '..', '..');
export const repoRoot = path.resolve(pkgRoot, '..', '..');
export const fixturesDir = path.join(pkgRoot, 'tests', 'fixtures');
export const cliPath = path.join(pkgRoot, 'bin', 'pixel-gate.mjs');
export const tmpOut = path.join(pkgRoot, '.visual-eval-test', 'm1-acceptance');

let tail = Promise.resolve();

/** Register a node:test that runs after the previous serialTest in this process. */
export function serialTest(title, fn) {
  test(title, () => {
    const run = tail.then(fn, fn);
    tail = run.then(() => {}, () => {});
    return run;
  });
}

export async function runCli(args) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, json: JSON.parse(stdout), stdout };
  } catch (err) {
    const stdout = err.stdout || '';
    let json = null;
    try {
      json = JSON.parse(stdout);
    } catch {
      json = null;
    }
    return { code: typeof err.code === 'number' ? err.code : 1, json, stdout };
  }
}

export async function startStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    const cleanUrl = decodeURIComponent((req.url || '/').split('?')[0]);
    const filePath = path.resolve(root, `.${cleanUrl}`);
    const rel = path.relative(root, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(filePath).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
