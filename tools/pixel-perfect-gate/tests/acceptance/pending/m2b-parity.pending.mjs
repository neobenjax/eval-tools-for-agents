/**
 * M2b.2 dual-run functional parity. Gap tests fail with ERR_ASSERTION until the product
 * meets them. Pixel asserts are guarded with process.platform !== "win32".
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import { startFixtureServer } from '../m2-helpers.mjs';
import {
  compare,
  copyPrototype,
  findingIds,
  findings,
  freshDir,
  makeWork,
  pixelSourceOfTruth,
  writeJson,
} from '../m2b-helpers.mjs';

const VIEW = [{ name: 'desktop', width: 400, height: 300 }];

function scenario(steps) {
  return { scenarios: [{ id: 'subscribe', steps }] };
}

const ROLE_CLICK = { action: 'click', locator: { method: 'getByRole', role: 'button', name: 'Subscribe' } };

function parityRepo(name, { referenceHtml, targetHtml, steps, referenceKind = 'html-file' }) {
  const repo = freshDir('m2b', name);
  fs.writeFileSync(path.join(repo, 'reference.html'), referenceHtml);
  fs.writeFileSync(path.join(repo, 'target.html'), targetHtml);
  fs.mkdirSync(path.join(repo, 'fonts'), { recursive: true });
  writeJson(path.join(repo, 'scenarios.json'), scenario(steps));
  const reference = referenceKind === 'html-file'
    ? { kind: 'html-file', source: path.join(repo, 'reference.html') }
    : { kind: 'screenshot', source: path.join(repo, 'shot.png') };
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    maxDiff: 0.5,
    scenarios: 'scenarios.json',
    routes: [{ id: 'home', path: '/', referenceRequired: true, reference }],
    target: { kind: 'static', file: path.join(repo, 'target.html') },
  });
  return repo;
}

serialTest("M2b-AC-09: The SIDE-19 scenario fixture runs against an `html-file` reference and a target that matches it, and exits `0` with no `gate3.parity*` findings.", async () => {
  const html = copyPrototype(freshDir('m2b', 'ac09-src'));
  const text = fs.readFileSync(html, 'utf8');
  const repo = parityRepo('ac09', {
    referenceHtml: text,
    targetHtml: text,
    steps: [
      { action: 'goto', url: '/' },
      ROLE_CLICK,
    ],
  });
  const result = await compare(repo, []);
  assert.equal(result.code, 0, `matching target exits 0 (findings: ${findingIds(result.json).join(', ')})`);
  assert.equal(findingIds(result.json).some((id) => id.startsWith('gate3.parity')), false);
  const ran = result.json && result.json.gates && result.json.gates.gate3 && result.json.gates.gate3.scenarios;
  assert.ok(Array.isArray(ran) && ran.some((s) => s.id === 'subscribe' && s.passed === true));
});

serialTest("M2b-AC-10: A target whose button renders but does nothing (handler removed) fails with `gate3.parity.<scenario-id>.<step>`, even though Gate 2 on the first screen passes.", async () => {
  const html = fs.readFileSync(copyPrototype(freshDir('m2b', 'ac10-src')), 'utf8');
  const dead = html.replace("document.getElementById('out').textContent = 'done';", '');
  const repo = parityRepo('ac10', { referenceHtml: html, targetHtml: dead, steps: [{ action: 'goto', url: '/' }, ROLE_CLICK] });
  const result = await compare(repo, []);
  assert.equal(result.code, 1);
  const finding = findings(result.json).find((f) => f.id === 'gate3.parity.subscribe.2');
  assert.ok(finding, `expected gate3.parity.subscribe.2, got ${findingIds(result.json).join(', ')}`);
  assert.equal(finding.severity, 'fail');
  const checks = result.json && result.json.gates && result.json.gates.gate2 && result.json.gates.gate2.checks;
  assert.ok(Array.isArray(checks) && checks[0], 'Gate 2 still reports the first screen');
  if (pixelSourceOfTruth) assert.equal(checks[0].passed, true, 'the first screen matches; only the click outcome differs');
});

serialTest("M2b-AC-11: A target whose post-click state differs visually fails with `gate3.parity-state.<scenario-id>.<step>`, and the report lists both state screenshot paths.", async () => {
  const html = fs.readFileSync(copyPrototype(freshDir('m2b', 'ac11-src')), 'utf8');
  const shifted = html.replace("textContent = 'done'", "textContent = 'done'; document.body.style.background = '#0f0'");
  const repo = parityRepo('ac11', { referenceHtml: html, targetHtml: shifted, steps: [{ action: 'goto', url: '/' }, ROLE_CLICK] });
  const result = await compare(repo, []);
  const finding = findings(result.json).find((f) => f.id === 'gate3.parity-state.subscribe.2');
  assert.ok(finding, `expected gate3.parity-state.subscribe.2, got ${findingIds(result.json).join(', ')}`);
  assert.equal(finding.severity, 'fail');
  for (const key of ['referenceScreenshot', 'targetScreenshot']) {
    assert.equal(typeof finding[key], 'string', key);
    assert.ok(finding[key].includes(`${path.join('.visual-eval')}`) || finding[key].includes('.visual-eval/'), `${key} stays under .visual-eval`);
    assert.equal(fs.existsSync(path.resolve(repo, finding[key])), true, `${key} exists`);
  }
});

serialTest("M2b-AC-11 break-it: a matching post-click state does not emit gate3.parity-state", async () => {
  const html = fs.readFileSync(copyPrototype(freshDir('m2b', 'ac11-ok-src')), 'utf8');
  const repo = parityRepo('ac11-ok', { referenceHtml: html, targetHtml: html, steps: [{ action: 'goto', url: '/' }, ROLE_CLICK] });
  const result = await compare(repo, []);
  assert.equal(result.code, 0);
  assert.equal(findingIds(result.json).some((id) => id.startsWith('gate3.parity-state.')), false);
  const ran = result.json && result.json.gates && result.json.gates.gate3 && result.json.gates.gate3.scenarios;
  assert.ok(Array.isArray(ran) && ran[0] && ran[0].passed === true, 'the scenario ran');
});

serialTest("M2b-AC-12: A step with a CSS selector that resolves only on the reference fails with `gate3.parity-unportable-locator.<scenario-id>.<step>`. The same step written with `getByRole` passes after a class rename on the target.", async () => {
  const html = fs.readFileSync(copyPrototype(freshDir('m2b', 'ac12-src')), 'utf8');
  const renamed = html.replace('class="go"', 'class="renamed"');
  const cssRepo = parityRepo('ac12-css', {
    referenceHtml: html,
    targetHtml: renamed,
    steps: [{ action: 'goto', url: '/' }, { action: 'click', selector: 'button.go' }],
  });
  const css = await compare(cssRepo, []);
  const finding = findings(css.json).find((f) => f.id === 'gate3.parity-unportable-locator.subscribe.2');
  assert.ok(finding, `expected unportable locator, got ${findingIds(css.json).join(', ')}`);
  assert.equal(css.code, 1);

  const roleRepo = parityRepo('ac12-role', {
    referenceHtml: html,
    targetHtml: renamed,
    steps: [{ action: 'goto', url: '/' }, ROLE_CLICK],
  });
  const role = await compare(roleRepo, []);
  assert.equal(role.code, 0, 'getByRole survives a class rename');
  assert.equal(findingIds(role.json).some((id) => id.startsWith('gate3.parity-unportable-locator.')), false);
});

serialTest("M2b-AC-12 break-it: a CSS selector that resolves on both sides is not an unportable locator", async () => {
  const html = fs.readFileSync(copyPrototype(freshDir('m2b', 'ac12-both-src')), 'utf8');
  const repo = parityRepo('ac12-both', {
    referenceHtml: html,
    targetHtml: html,
    steps: [{ action: 'goto', url: '/' }, { action: 'click', selector: 'button.go' }],
  });
  const result = await compare(repo, []);
  assert.equal(result.code, 0);
  assert.equal(findingIds(result.json).includes('gate3.parity-unportable-locator.subscribe.2'), false);
  const ran = result.json && result.json.gates && result.json.gates.gate3 && result.json.gates.gate3.scenarios;
  assert.ok(Array.isArray(ran) && ran[0] && ran[0].passed === true);
});

serialTest("M2b-AC-13: A `screenshot` reference reports `gates.gate3.parity` as `{ \"skipped\": true, \"reason\": \"reference has no behavior\" }` and never `passed: true` on parity alone.", async () => {
  const { writePng, solid } = await import('../m2b-helpers.mjs');
  const repo = freshDir('m2b', 'ac13');
  writePng(path.join(repo, 'shot.png'), 400, 300, solid(255, 255, 255));
  fs.writeFileSync(path.join(repo, 'target.html'), '<!doctype html><html><body style="margin:0;background:#fff"></body></html>');
  writeJson(path.join(repo, 'scenarios.json'), scenario([{ action: 'goto', url: '/' }]));
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    scenarios: 'scenarios.json',
    routes: [{ id: 'home', path: '/', reference: { kind: 'screenshot', source: path.join(repo, 'shot.png') } }],
    target: { kind: 'static', file: path.join(repo, 'target.html') },
  });
  const result = await compare(repo, []);
  const parity = result.json && result.json.gates && result.json.gates.gate3 && result.json.gates.gate3.parity;
  assert.deepEqual(parity, { skipped: true, reason: 'reference has no behavior' });
  assert.equal(Object.hasOwn(parity, 'passed'), false);
});

serialTest("M2b-AC-13 break-it: a skipped parity object does not set passed true when Gate 2 fails", async () => {
  const { writePng, solid } = await import('../m2b-helpers.mjs');
  const repo = freshDir('m2b', 'ac13-fail');
  writePng(path.join(repo, 'shot.png'), 400, 300, solid(255, 255, 255));
  fs.writeFileSync(path.join(repo, 'target.html'), '<!doctype html><html><body style="margin:0"><div id="spill" style="width:900px">spill</div></body></html>');
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', reference: { kind: 'screenshot', source: path.join(repo, 'shot.png') } }],
    target: { kind: 'static', file: path.join(repo, 'target.html') },
  });
  const result = await compare(repo, []);
  const parity = result.json && result.json.gates && result.json.gates.gate3 && result.json.gates.gate3.parity;
  assert.deepEqual(parity, { skipped: true, reason: 'reference has no behavior' });
  assert.equal(result.json && result.json.passed, false, 'a Gate 1 overflow still fails the run');
  assert.equal(result.code, 1);
});

serialTest("M2b-AC-14: Reference and target run in separate fresh contexts; a test proves that state set on the reference (e.g. `localStorage`) is not visible to the target.", async () => {
  const root = freshDir('m2b', 'ac14-site');
  const html = fs.readFileSync(copyPrototype(root), 'utf8').replace(
    '</body>',
    '<script>fetch("/__storage?v=" + encodeURIComponent(localStorage.getItem("pg") || "none"))</script></body>'
  );
  fs.writeFileSync(path.join(root, 'page.html'), html);
  const server = await startFixtureServer(root);
  try {
    const repo = makeWork('ac14', {
      viewports: VIEW,
      dpr: 1,
      scenarios: 'scenarios.json',
      routes: [{ id: 'home', path: '/page.html', reference: { kind: 'url', source: `${server.baseUrl}/page.html`, acknowledgeCopyright: true } }],
      target: { kind: 'static', root },
    }, { 'scenarios.json': JSON.stringify(scenario([
      { action: 'goto', url: '/page.html' },
      ROLE_CLICK,
    ])) });
    const result = await compare(repo, []);
    const parity = result.json && result.json.gates && result.json.gates.gate3 && result.json.gates.gate3.parity;
    assert.equal(parity && parity.referenceSaw, 'from-ref');
    assert.equal(parity && parity.targetSaw, 'none');
  } finally {
    await server.close();
  }
});

serialTest("M2b-AC-14 break-it: the reference context still observes the localStorage value it set", async () => {
  const root = freshDir('m2b', 'ac14b-site');
  const html = fs.readFileSync(copyPrototype(root), 'utf8');
  fs.writeFileSync(path.join(root, 'page.html'), html);
  const server = await startFixtureServer(root);
  try {
    const repo = makeWork('ac14b', {
      viewports: VIEW,
      dpr: 1,
      scenarios: 'scenarios.json',
      routes: [{ id: 'home', path: '/page.html', reference: { kind: 'html-file', source: path.join(root, 'page.html') } }],
      target: { kind: 'static', file: path.join(root, 'page.html') },
    }, { 'scenarios.json': JSON.stringify(scenario([
      { action: 'goto', url: '/page.html' },
      ROLE_CLICK,
      { action: 'goto', url: '/__storage?side=reference' },
    ])) });
    const result = await compare(repo, []);
    const parity = result.json && result.json.gates && result.json.gates.gate3 && result.json.gates.gate3.parity;
    assert.equal(parity && parity.referenceSaw, 'from-ref', 'the reference context keeps the value it wrote');
    assert.equal(result.code, 0);
  } finally {
    await server.close();
  }
});
