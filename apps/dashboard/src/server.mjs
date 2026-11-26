/**
 * HTTP server for Eval Benchmarks (primary) and Linear Delivery Board (secondary).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { readBenchmarks } from './benchmarks.mjs';
import { createBoardLoader } from './board.mjs';
import { DEFAULT_CLIENT_ROOT } from './check-client.mjs';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBenchmarksHtml(benchmarks) {
  const groupsHtml = benchmarks.groups
    .map((g) => {
      const key = `${g.model}|${g.harness}|${g.iteration}`;
      return `<section data-group="${escapeHtml(key)}"><h2>${escapeHtml(g.model)} / ${escapeHtml(g.harness)} / iter ${g.iteration} (${g.count})</h2></section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Eval Benchmarks</title></head>
<body>
  <main data-view="benchmarks" data-primary="true">
    <nav><a href="/board">Linear Delivery Board</a></nav>
    <h1>Eval Benchmarks</h1>
    ${groupsHtml}
  </main>
  <script src="/client.js"></script>
</body>
</html>`;
}

function renderBoardHtml(boardBody) {
  const emptyNotice = boardBody.empty
    ? '<p class="empty">Linear API key is not set</p>'
    : '';
  const stagesHtml = boardBody.stages
    .map((stage) => {
      const items = stage.issues
        .map(
          (issue) =>
            `<li data-issue="${escapeHtml(issue.id)}"><strong>${escapeHtml(issue.id)}</strong>: ${escapeHtml(issue.title)}</li>`
        )
        .join('');
      return `<section data-stage="${escapeHtml(stage.name)}"><h2>${escapeHtml(stage.name)}</h2><ul>${items}</ul></section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Linear Delivery Board</title></head>
<body>
  <main data-view="board" data-primary="false" data-empty="${boardBody.empty}">
    <nav><a href="/">Eval Benchmarks</a></nav>
    <h1>Linear Delivery Board</h1>
    ${emptyNotice}
    ${stagesHtml}
  </main>
  <script src="/client.js"></script>
</body>
</html>`;
}

export async function startDashboardServer({ telemetryPath, port = 0, linearCliPath = null }) {
  const getBoardState = createBoardLoader(linearCliPath);
  const clientJsPath = path.join(DEFAULT_CLIENT_ROOT, 'client.js');

  const server = http.createServer((req, res) => {
    const pathname = (req.url || '/').split('?')[0];

    if (pathname === '/client.js') {
      if (!fs.existsSync(clientJsPath)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(fs.readFileSync(clientJsPath));
      return;
    }

    if (pathname === '/api/benchmarks') {
      try {
        const data = readBenchmarks(telemetryPath);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ view: 'benchmarks', error: { message: err.message } }));
      }
      return;
    }

    if (pathname === '/') {
      try {
        const data = readBenchmarks(telemetryPath);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(renderBenchmarksHtml(data));
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ view: 'benchmarks', error: { message: err.message } }));
      }
      return;
    }

    if (pathname === '/api/board') {
      const board = getBoardState();
      res.writeHead(board.status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(board.body));
      return;
    }

    if (pathname === '/board') {
      const board = getBoardState();
      if (board.status !== 200) {
        res.writeHead(board.status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(board.body));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderBoardHtml(board.body));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(port) || 0, '127.0.0.1', resolve);
  });

  const addr = server.address();
  return {
    url: `http://127.0.0.1:${addr.port}`,
    server,
  };
}
