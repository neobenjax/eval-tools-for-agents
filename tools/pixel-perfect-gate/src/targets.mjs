/**
 * Target adapters (SPEC.md §12.3, M2b.4 / SIDE-31).
 * Supports `url` (existing baseUrl), `static` (single file or directory), and `dev-server` (command + readyUrl + tree kill).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

export async function startStaticServer({ file = null, root = null }) {
  const resolvedFile = file ? path.resolve(file) : null;
  const resolvedRoot = root ? path.resolve(root) : (resolvedFile ? path.dirname(resolvedFile) : null);
  if (!resolvedRoot) {
    throw new Error('Static target requires either target.file or target.root');
  }
  if (resolvedFile && !fs.existsSync(resolvedFile)) {
    throw new Error(`Static target file not found: ${file}`);
  }
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`Static target root not found: ${root}`);
  }

  const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    let targetPath = null;
    if (resolvedFile && (reqPath === '/' || reqPath === `/${path.basename(resolvedFile)}`)) {
      targetPath = resolvedFile;
    } else {
      const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
      targetPath = path.resolve(resolvedRoot, rel);
      const inside = targetPath === resolvedRoot || targetPath.startsWith(resolvedRoot + path.sep);
      if (!inside) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
        targetPath = path.join(targetPath, 'index.html');
      }
    }
    if (!targetPath || !fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(targetPath).toLowerCase();
    res.writeHead(200, { 'content-type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(targetPath));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const addr = server.address();
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export function killProcessTree(pid) {
  if (!pid || !Number.isInteger(pid)) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {}
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }
}

function checkHttpReady(urlStr) {
  return new Promise((resolve) => {
    try {
      const req = http.get(urlStr, { timeout: 1000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

export async function startDevServer(target, cwd) {
  if (!target?.command || typeof target.command !== 'string') {
    throw new Error('dev-server target requires target.command');
  }
  if (!target?.readyUrl || typeof target.readyUrl !== 'string') {
    throw new Error('dev-server target requires target.readyUrl');
  }
  const timeoutMs = Number(target.readyTimeoutMs) > 0 ? Number(target.readyTimeoutMs) : 15000;

  const child = spawn(target.command, {
    cwd,
    shell: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let exitedEarly = false;
  let exitCode = null;
  child.once('exit', (code) => {
    exitedEarly = true;
    exitCode = code;
  });

  const close = async () => {
    killProcessTree(child.pid);
    try {
      child.kill('SIGKILL');
    } catch {}
    if (process.env.M2B_PIDFILE && fs.existsSync(process.env.M2B_PIDFILE)) {
      try {
        const pids = JSON.parse(fs.readFileSync(process.env.M2B_PIDFILE, 'utf8'));
        if (Number.isInteger(pids?.child)) killProcessTree(pids.child);
        if (Number.isInteger(pids?.parent)) killProcessTree(pids.parent);
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  };

  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      if (exitedEarly) {
        throw new Error(`dev-server command exited early with code ${exitCode} before readyUrl responded 200`);
      }
      const ok = await checkHttpReady(target.readyUrl);
      if (ok) {
        const origin = new URL(target.readyUrl).origin;
        return { baseUrl: origin, close };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`dev-server readyUrl ${target.readyUrl} did not return HTTP 200 within ${timeoutMs}ms`);
  } catch (err) {
    await close();
    throw err;
  }
}
