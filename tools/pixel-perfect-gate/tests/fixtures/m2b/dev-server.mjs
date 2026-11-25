/**
 * Fixture dev server for M2b-AC-20. Listens on M2B_PORT, writes parent and child
 * pids to M2B_PIDFILE, and serves a stable page plus /health.
 */
import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const port = Number(process.env.M2B_PORT);
const pidFile = process.env.M2B_PIDFILE;
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
fs.writeFileSync(pidFile, JSON.stringify({ parent: process.pid, child: child.pid }));

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (url.pathname !== '/') {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('not-ready');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><head><title>dev</title></head><body><main>dev-server-ready</main></body></html>');
});
server.listen(port, '127.0.0.1');
