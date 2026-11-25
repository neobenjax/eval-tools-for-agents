/**
 * M2b.7 design-file reference. Figma REST is pointed at a local stub via design.apiBase.
 * Gap tests fail with ERR_ASSERTION. No network.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  capture,
  compare,
  filesContaining,
  findingIds,
  findings,
  freshDir,
  pixelSourceOfTruth,
  readJson,
  solid,
  writeJson,
  writePng,
} from '../m2b-helpers.mjs';

const VIEW = [{ name: 'desktop', width: 400, height: 300 }];
const TOKEN = 'figma-token-sentinel';

function nodes(width) {
  return {
    nodes: {
      '1:2': {
        document: {
          id: '1:2',
          name: 'Desktop',
          absoluteBoundingBox: { x: 0, y: 0, width, height: 300 },
          children: [
            { id: '1:3', name: 'header', absoluteBoundingBox: { x: 0, y: 0, width, height: 40 } },
          ],
          interactions: [
            { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation: 'NAVIGATE', destinationId: '9:9' }] },
          ],
        },
      },
    },
  };
}

function designRepo(name, { width = 400, token, variableDefs, exportPng = true } = {}) {
  const repo = freshDir('m2b', name);
  const nodesFile = path.join(repo, 'nodes.json');
  writeJson(nodesFile, nodes(width));
  const exportDir = path.join(repo, 'export');
  if (exportPng) writePng(path.join(exportDir, 'home', 'desktop.png'), width, 300, solid(255, 255, 255));
  const page = path.join(repo, 'page.html');
  const shift = width === 400 ? 0 : 0;
  fs.writeFileSync(page, `<!doctype html><html><body style="margin:0"><header id="header" style="margin-top:${shift}px;height:40px">Header</header><main>Body</main></body></html>`);
  const design = {
    fileKey: 'FILEKEY',
    frames: [{ nodeId: '1:2', route: 'home', viewport: 'desktop' }],
    exportDir,
    nodesFile,
    apiBase: 'http://127.0.0.1:9',
  };
  if (variableDefs) design.variableDefs = variableDefs;
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', reference: { kind: 'design-file' } }],
    design,
    target: { kind: 'static', file: page },
  });
  return { repo, page };
}

serialTest('M2b-AC-42: `design.frames[]` maps a frame to route + viewport; a frame whose width differs from the viewport fails with `gate2.frame-viewport-mismatch.<nodeId>`.', async () => {
  const { repo } = designRepo('ac42', { width: 360 });
  const result = await compare(repo, []);
  assert.equal(result.code, 1);
  const finding = findings(result.json).find((f) => f.id === 'gate2.frame-viewport-mismatch.1:2');
  assert.ok(finding, `expected gate2.frame-viewport-mismatch.1:2, got ${findingIds(result.json).join(', ')}`);
  assert.equal(finding.severity, 'fail');
  assert.equal(result.json && result.json.loop && result.json.loop.stopReason, 'blocked');
});

serialTest('M2b-AC-42 break-it: a frame whose width equals the viewport is not a frame-viewport mismatch', async () => {
  const { repo } = designRepo('ac42-ok', { width: 400 });
  const result = await compare(repo, []);
  assert.equal(findingIds(result.json).includes('gate2.frame-viewport-mismatch.1:2'), false);
  const manifest = readJson(path.join(repo, '.visual-eval', 'references', 'home', 'desktop', 'manifest.json'));
  assert.equal(manifest && manifest.kind, 'design-file');
  assert.equal(manifest.tier, 'B');
});

serialTest('M2b-AC-43: With a Figma token in the environment, capture exports each frame through REST `/v1/images` at `scale = dpr`. Without a token, a manually exported PNG with the same name produces the same bundle shape. CI uses only the committed manual export, with no network.', async () => {
  const hits = [];
  const png = writePng(path.join(freshDir('m2b', 'ac43-png'), 'frame.png'), 400, 300, solid(240, 240, 240));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    hits.push({ path: url.pathname, search: url.search, token: req.headers['x-figma-token'] || '' });
    if (url.pathname === '/v1/images/FILEKEY') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ images: { '1:2': `http://127.0.0.1:${server.address().port}/frame.png` } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(fs.readFileSync(png));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const manual = designRepo('ac43-manual', { width: 400 });
    const without = await capture(manual.repo, []);
    assert.equal(hits.length, 0, 'no token means no REST call');
    const manualManifest = readJson(path.join(manual.repo, '.visual-eval', 'references', 'home', 'desktop', 'manifest.json'));
    assert.equal(without.code, 0);
    assert.equal(manualManifest && manualManifest.kind, 'design-file');

    const remote = designRepo('ac43-remote', { width: 400, exportPng: false });
    const config = readJson(path.join(remote.repo, 'pixel-gate.config.json'));
    config.design.apiBase = `http://127.0.0.1:${server.address().port}`;
    writeJson(path.join(remote.repo, 'pixel-gate.config.json'), config);
    const withToken = await capture(remote.repo, [], { FIGMA_TOKEN: TOKEN });
    assert.equal(withToken.code, 0);
    assert.ok(hits.some((hit) => hit.path === '/v1/images/FILEKEY' && hit.search.includes('scale=1') && hit.search.includes('format=png') && hit.search.includes('ids=1%3A2')));
    assert.equal(hits.some((hit) => hit.token === TOKEN), true);
    const remoteManifest = readJson(path.join(remote.repo, '.visual-eval', 'references', 'home', 'desktop', 'manifest.json'));
    assert.deepEqual(Object.keys(manualManifest).sort(), Object.keys(remoteManifest).sort());
    assert.equal(withToken.stdout.includes(TOKEN), false);
    assert.deepEqual(filesContaining(path.join(remote.repo, '.visual-eval'), TOKEN), []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

serialTest('M2b-AC-43 break-it: with no token the figma stub receives no request', async () => {
  const hits = [];
  const server = http.createServer((req, res) => { hits.push(req.url); res.writeHead(500); res.end(); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { repo } = designRepo('ac43-none', {});
    const config = readJson(path.join(repo, 'pixel-gate.config.json'));
    config.design.apiBase = `http://127.0.0.1:${server.address().port}`;
    writeJson(path.join(repo, 'pixel-gate.config.json'), config);
    const result = await capture(repo, []);
    assert.equal(hits.length, 0);
    assert.equal(result.code, 0, 'the manual export still captures');
    assert.equal(fs.existsSync(path.join(repo, '.visual-eval', 'references', 'home', 'desktop', 'manifest.json')), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

serialTest('M2b-AC-44: Layer geometry produces a `.landmarks.json` for layers named after configured landmarks; wireframe mode then reports an `info` finding (advisory, tier B) for a target whose `header` moves `> 4` CSS px.', async () => {
  const { repo, page } = designRepo('ac44', { width: 400 });
  fs.writeFileSync(page, '<!doctype html><html><body style="margin:0"><header id="header" style="margin-top:8px;height:40px">Header</header><main>Body</main></body></html>');
  const config = readJson(path.join(repo, 'pixel-gate.config.json'));
  config.mode = 'wireframe';
  writeJson(path.join(repo, 'pixel-gate.config.json'), config);
  const captured = await capture(repo, []);
  assert.equal(captured.code, 0);
  const landmarks = readJson(path.join(repo, '.visual-eval', 'references', 'home', 'desktop', '.landmarks.json'));
  assert.equal(landmarks && landmarks.header && landmarks.header.y, 0);
  const result = await compare(repo, ['--mode', 'wireframe']);
  const finding = findings(result.json).find((f) => f.id === 'gate2.landmark.header');
  assert.ok(finding, `expected gate2.landmark.header, got ${findingIds(result.json).join(', ')}`);
  assert.equal(finding.severity, 'info');
  assert.equal(result.json.passed, true);
});

serialTest('M2b-AC-44 break-it: a header shift of exactly 4 CSS px does not emit the landmark info finding', async () => {
  const { repo, page } = designRepo('ac44-4', { width: 400 });
  fs.writeFileSync(page, '<!doctype html><html><body style="margin:0"><header id="header" style="margin-top:4px;height:40px">Header</header><main>Body</main></body></html>');
  const result = await compare(repo, ['--mode', 'wireframe']);
  assert.equal(findingIds(result.json).includes('gate2.landmark.header'), false);
  const landmarks = readJson(path.join(repo, '.visual-eval', 'references', 'home', 'desktop', '.landmarks.json'));
  assert.ok(landmarks && landmarks.header, 'landmarks were still produced');
});

serialTest('M2b-AC-44 break-it: a header shift of 5 CSS px emits an info finding and passed stays true', async () => {
  const { repo, page } = designRepo('ac44-5', { width: 400 });
  fs.writeFileSync(page, '<!doctype html><html><body style="margin:0"><header id="header" style="margin-top:5px;height:40px">Header</header><main>Body</main></body></html>');
  const result = await compare(repo, ['--mode', 'wireframe']);
  const finding = findings(result.json).find((f) => f.id === 'gate2.landmark.header');
  assert.ok(finding);
  assert.equal(finding.severity, 'info');
  assert.equal(result.json.passed, true);
  if (pixelSourceOfTruth) assert.equal(result.code, 0);
});

serialTest('M2b-AC-45: Tokens (from the Variables REST API or a saved `get_variable_defs` output) produce `.tokens.json`, consumed by SIDE-35.', async () => {
  const { repo } = designRepo('ac45', { variableDefs: path.join(freshDir('m2b', 'ac45-vars'), 'vars.json') });
  writeJson(readJson(path.join(repo, 'pixel-gate.config.json')).design.variableDefs, { 'color/brand': '#1a73e8' });
  const page = readJson(path.join(repo, 'pixel-gate.config.json')).target.file;
  fs.writeFileSync(page, '<!doctype html><html><body style="margin:0"><button style="color:#1a74e8">Save</button></body></html>');
  const captured = await capture(repo, []);
  assert.equal(captured.code, 0);
  const tokens = readJson(path.join(repo, '.visual-eval', 'references', 'home', 'desktop', '.tokens.json'));
  assert.equal(tokens && tokens.tokens && tokens.tokens['color/brand'], '#1a73e8');
  const result = await compare(repo, []);
  const finding = findings(result.json).find((f) => f.id === 'gate2.style.button.color');
  assert.ok(finding, `token mismatch is a style finding, got ${findingIds(result.json).join(', ')}`);
  assert.equal(finding.severity, 'info');
});

serialTest('M2b-AC-45 break-it: a token mismatch becomes a style finding and a matching token does not', async () => {
  const vars = path.join(freshDir('m2b', 'ac45-match'), 'vars.json');
  writeJson(vars, { 'color/brand': '#1a73e8' });
  const { repo } = designRepo('ac45-match-repo', { variableDefs: vars });
  const page = readJson(path.join(repo, 'pixel-gate.config.json')).target.file;
  fs.writeFileSync(page, '<!doctype html><html><body style="margin:0"><button style="color:#1a73e8">Save</button></body></html>');
  const result = await compare(repo, []);
  assert.equal(findingIds(result.json).includes('gate2.style.button.color'), false);
  const tokens = readJson(path.join(repo, '.visual-eval', 'references', 'home', 'desktop', '.tokens.json'));
  assert.ok(tokens && tokens.tokens, 'tokens were loaded');
});

serialTest('M2b-AC-46: Prototype `interactions` (`ON_CLICK` → `NODE`/`NAVIGATE`) produce `scenarios.draft.json`. Drafts are never executed as gating scenarios until a human moves them into the scenario file (owner decision 13).', async () => {
  const { repo } = designRepo('ac46', {});
  const captured = await capture(repo, []);
  assert.equal(captured.code, 0);
  const draftPath = path.join(repo, '.visual-eval', 'references', 'home', 'scenarios.draft.json');
  const draft = readJson(draftPath);
  assert.ok(draft && Array.isArray(draft.scenarios) && draft.scenarios.length === 1);
  assert.equal(JSON.stringify(draft).includes('9:9'), true);
  const result = await compare(repo, []);
  assert.equal(result.json.passed, true, 'a draft is not a gating scenario');
  assert.equal(findingIds(result.json).some((id) => id.startsWith('gate3.scenario.')), false);
  fs.writeFileSync(path.join(repo, 'scenarios.json'), JSON.stringify({ scenarios: draft.scenarios }));
  const config = readJson(path.join(repo, 'pixel-gate.config.json'));
  config.scenarios = 'scenarios.json';
  config.target.file = path.join(repo, 'broken.html');
  fs.writeFileSync(config.target.file, '<!doctype html><html><body><main>no button</main></body></html>');
  writeJson(path.join(repo, 'pixel-gate.config.json'), config);
  const promoted = await compare(repo, []);
  assert.equal(promoted.code, 1, 'the same steps gate the run once a human copies them into the scenario file');
});

serialTest('M2b-AC-47: Tier B is advisory with the same default and override as SIDE-33 (`reference.maxDiff` default `20`): pixel, landmark, and token findings against a design file are `info` and never change `passed`.', async () => {
  const { repo, page } = designRepo('ac47', { width: 400 });
  fs.writeFileSync(page, '<!doctype html><html><body style="margin:0;background:#00f"><header id="header" style="margin-top:8px;height:40px">Header</header></body></html>');
  const result = await compare(repo, ['--mode', 'wireframe']);
  assert.equal(result.json && result.json.passed, true);
  assert.equal(result.code, 0);
  const infos = findings(result.json).filter((f) => f.gate === 'gate2');
  assert.ok(infos.length >= 1, 'tier B still reports findings');
  assert.ok(infos.every((f) => f.severity === 'info'));
  const advisory = result.json.gates.gate2.advisory;
  assert.equal(advisory && advisory.thresholdPct, 80);
});

serialTest('M2b-AC-47 break-it: reference.maxDiff 5 on a design-file route sets thresholdPct to 95 and passed stays true', async () => {
  const { repo } = designRepo('ac47-tight', {});
  const config = readJson(path.join(repo, 'pixel-gate.config.json'));
  config.routes[0].reference.maxDiff = 5;
  writeJson(path.join(repo, 'pixel-gate.config.json'), config);
  const result = await compare(repo, []);
  const advisory = result.json && result.json.gates && result.json.gates.gate2 && result.json.gates.gate2.advisory;
  assert.equal(advisory && advisory.thresholdPct, 95);
  assert.equal(result.json.passed, true);
});

serialTest('M2b-AC-48: Figma access follows owner decision 9: manual export in CI; REST export only when `FIGMA_TOKEN` is set (never printed or written to artifacts); Figma/Penpot/Sketch MCP output is never read by the gate except a saved `get_variable_defs` file named in config.', async () => {
  const { repo } = designRepo('ac48', {});
  const ignored = path.join(repo, 'mcp-variables.json');
  writeJson(ignored, { 'color/ignored': '#ff00ff' });
  const named = path.join(repo, 'named-variables.json');
  writeJson(named, { 'color/brand': '#1a73e8' });
  const before = fs.statSync(ignored).mtimeMs;
  const config = readJson(path.join(repo, 'pixel-gate.config.json'));
  config.design.variableDefs = named;
  writeJson(path.join(repo, 'pixel-gate.config.json'), config);
  const result = await capture(repo, []);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.includes(TOKEN), false);
  const tokens = readJson(path.join(repo, '.visual-eval', 'references', 'home', 'desktop', '.tokens.json'));
  assert.equal(tokens && tokens.tokens && tokens.tokens['color/brand'], '#1a73e8');
  assert.equal(tokens.tokens['color/ignored'], undefined);
  assert.equal(fs.statSync(ignored).mtimeMs, before, 'the unnamed MCP file is not read or rewritten');
});

serialTest('M2b-AC-48 break-it: an unnamed MCP variable file is not read', async () => {
  const { repo } = designRepo('ac48-ignore', {});
  const ignored = path.join(repo, 'ignored.json');
  writeJson(ignored, { 'color/secret': '#abcdef' });
  const result = await capture(repo, []);
  assert.equal(result.code, 0);
  const tokens = readJson(path.join(repo, '.visual-eval', 'references', 'home', 'desktop', '.tokens.json'));
  assert.equal(JSON.stringify(tokens || {}).includes('#abcdef'), false);
  assert.equal(JSON.stringify(tokens || {}).includes('color/secret'), false);
});
