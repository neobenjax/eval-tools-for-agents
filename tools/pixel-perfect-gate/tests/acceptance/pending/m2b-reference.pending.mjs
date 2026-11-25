/**
 * M2b.1 reference bundle and capture. Gap suite: every test fails with ERR_ASSERTION
 * until the product meets it (SPEC.md section 13). M2b-AC-01 through M2b-AC-59 are gaps.
 * Promote a passing criterion into tests/acceptance/m2b/*.test.mjs, check the section 8
 * box, and set manifest suite to "pass" together. npm test must not run this file.
 * Pixel mismatchPct blocks on ubuntu-latest only (process.platform !== "win32").
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import { copyRefs, diffTrees, siteRoot, snapshotTree, startFixtureServer } from '../m2-helpers.mjs';
import {
  COPYRIGHT_DISCLAIMER,
  bundleDir,
  capture,
  compare,
  copyPrototype,
  findingIds,
  findings,
  freshDir,
  makeWork,
  pixelSourceOfTruth,
  readManifest,
  runPrompted,
  sha256,
  writeJson,
} from '../m2b-helpers.mjs';

const VIEW = [{ name: 'desktop', width: 400, height: 300 }];

function htmlConfig(repo, reference) {
  return {
    baseUrl: 'http://127.0.0.1:9',
    viewports: VIEW,
    dpr: 1,
    maxDiff: 0.5,
    routes: [{ id: 'home', path: '/', referenceRequired: true, reference }],
    references: 'references',
  };
}

serialTest("M2b-AC-01: A route with no `reference` behaves exactly as today (`kind: \"png\"`); the existing test suite passes unchanged.", async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'package.json'), 'utf8'));
  for (const file of [
    'tests/acceptance/m1-landmarks.acceptance.test.mjs',
    'tests/acceptance/m1-engine.acceptance.test.mjs',
    'tests/acceptance/m1-report.acceptance.test.mjs',
  ]) {
    assert.ok(pkg.scripts.test.includes(file), `existing suite still runs ${file}`);
  }
  const server = await startFixtureServer(siteRoot);
  try {
    const repo = makeWork('ac01', {
      baseUrl: server.baseUrl,
      viewports: VIEW,
      dpr: 1,
      maxDiff: 0.5,
      masks: ['#clock'],
      routes: [{ id: 'home', path: '/m2/site/home.html', referenceRequired: true }],
      references: 'references',
    });
    copyRefs(repo, ['home/desktop']);
    const result = await compare(repo, []);
    const checks = result.json && result.json.gates && result.json.gates.gate2 && result.json.gates.gate2.checks;
    assert.ok(Array.isArray(checks) && checks.length === 1, 'a route with no reference object still reports one png check');
    assert.equal(checks[0].referenceKind, 'png');
    assert.ok(String(checks[0].reference || '').endsWith(path.join('references', 'home', 'desktop.png')), checks[0].reference);
    if (pixelSourceOfTruth) assert.equal(result.code, 0, 'the omitted reference kind keeps today\'s png compare');
  } finally {
    await server.close();
  }
});

serialTest("M2b-AC-01 break-it: an explicit reference.kind of url is not compared as a committed png", async () => {
  const repo = makeWork('ac01-url', {
    baseUrl: 'http://127.0.0.1:9',
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', referenceRequired: true, reference: { kind: 'url', source: 'http://127.0.0.1:9/' } }],
    references: 'references',
  });
  copyRefs(repo, ['home/desktop']);
  const result = await compare(repo, []);
  const checks = result.json?.gates?.gate2?.checks;
  assert.ok(Array.isArray(checks) && checks[0], 'the url route still reports a check');
  assert.notEqual(checks[0].referenceKind, 'png');
  assert.equal(findingIds(result.json).includes('gate2.reference-copy-unacknowledged.home'), true);
});

serialTest("M2b-AC-02: `pixel-gate reference capture` on an `html-file` fixture (inline CSS + JS, committed font) writes PNG, `.landmarks.json`, `.styles.json`, and `manifest.json` under `.visual-eval/references/<route-id>/<viewport-name>/`, and nothing outside `.visual-eval/`.", async () => {
  const repo = freshDir('m2b', 'ac02');
  const source = copyPrototype(repo);
  writeJson(path.join(repo, 'pixel-gate.config.json'), htmlConfig(repo, { kind: 'html-file', source }));
  const before = snapshotTree(repo);
  const result = await capture(repo, []);
  assert.equal(result.code, 0, 'html-file capture exits 0');
  const dir = bundleDir(repo);
  for (const name of ['desktop.png', '.landmarks.json', '.styles.json', 'manifest.json']) {
    assert.equal(fs.existsSync(path.join(dir, name)), true, `bundle contains ${name}`);
  }
  const landmarks = JSON.parse(fs.readFileSync(path.join(dir, '.landmarks.json'), 'utf8'));
  assert.equal(typeof landmarks.header.width, 'number');
  assert.equal(typeof landmarks.main.width, 'number');
  const styles = JSON.parse(fs.readFileSync(path.join(dir, '.styles.json'), 'utf8'));
  assert.ok(Array.isArray(styles.elements) && styles.elements.some((el) => el.selector === 'button'));
  const manifest = readManifest(repo);
  assert.equal(manifest.kind, 'html-file');
  assert.equal(manifest.tier, 'A');
  assert.equal(manifest.playwright, '1.65.1');
  assert.equal(typeof manifest.sha256.png, 'string');
  assert.equal(manifest.sha256.png, sha256(path.join(dir, 'desktop.png')));
  const diff = diffTrees(before, snapshotTree(repo));
  assert.ok(diff.added.some((file) => file.startsWith('.visual-eval/references/home/desktop/')));
  for (const file of [...diff.added, ...diff.changed]) {
    assert.ok(file.startsWith('.visual-eval/') || file === 'pixel-gate.config.json', `wrote ${file}`);
  }
});

serialTest("M2b-AC-02 break-it: a missing html-file source fails and writes no reference bundle", async () => {
  const repo = makeWork('ac02-missing', htmlConfig(null, { kind: 'html-file', source: 'missing-prototype.html' }));
  const result = await capture(repo, []);
  assert.equal(result.code, 1);
  assert.equal(fs.existsSync(bundleDir(repo)), false, 'a missing source writes no bundle');
  assert.ok(result.json && result.json.error && /missing-prototype\.html/.test(result.json.error.message));
});

serialTest("M2b-AC-03: Capturing the same `html-file` twice on `ubuntu-latest` produces byte-identical PNGs (same `sha256` in both manifests).", async () => {
  const repo = freshDir('m2b', 'ac03');
  const source = copyPrototype(repo);
  writeJson(path.join(repo, 'pixel-gate.config.json'), htmlConfig(repo, { kind: 'html-file', source }));
  const first = await capture(repo, []);
  assert.equal(first.code, 0, 'first capture exits 0');
  const png = path.join(bundleDir(repo), 'desktop.png');
  const bytes = fs.readFileSync(png);
  const hash = readManifest(repo).sha256.png;
  fs.copyFileSync(png, path.join(repo, 'first.png'));
  const second = await capture(repo, []);
  assert.equal(second.code, 0, 'second capture exits 0');
  assert.equal(typeof hash, 'string');
  assert.equal(readManifest(repo).sha256.png, hash, 'manifest sha256.png is stable');
  if (pixelSourceOfTruth) {
    assert.ok(fs.readFileSync(png).equals(bytes), 'png bytes are identical on the pixel source of truth');
  }
});

serialTest("M2b-AC-03 break-it: a changed source sha256 does not reuse the previous PNG", async () => {
  const repo = freshDir('m2b', 'ac03-change');
  const source = copyPrototype(repo);
  writeJson(path.join(repo, 'pixel-gate.config.json'), htmlConfig(repo, { kind: 'html-file', source }));
  const first = await capture(repo, []);
  assert.equal(first.code, 0);
  const before = readManifest(repo);
  assert.ok(before && before.sha256 && before.sha256.png && before.sha256.source);
  fs.appendFileSync(source, '\n<!-- changed -->\n');
  const second = await capture(repo, []);
  assert.equal(second.code, 0);
  const after = readManifest(repo);
  assert.ok(after && after.sha256);
  assert.notEqual(after.sha256.source, before.sha256.source);
  assert.notEqual(after.sha256.png, before.sha256.png, 'a changed source rebuilds the png hash');
});

serialTest("M2b-AC-04: Gate 2 run against that bundle and against the same prototype served as the target exits `0` with `mismatchPct` `0`.", async () => {
  const repo = freshDir('m2b', 'ac04');
  const source = copyPrototype(repo);
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    maxDiff: 0,
    routes: [{ id: 'home', path: '/', referenceRequired: true, reference: { kind: 'html-file', source }, selector: 'body' }],
    target: { kind: 'static', file: source, selector: 'body' },
  });
  const captured = await capture(repo, []);
  assert.equal(captured.code, 0, 'capture exits 0 before the compare');
  const result = await compare(repo, []);
  const check = result.json?.gates?.gate2?.checks?.[0];
  assert.ok(check, 'compare reports a gate2 check against the bundle');
  assert.equal(check.tier, 'A');
  if (pixelSourceOfTruth) {
    assert.equal(result.code, 0);
    assert.equal(check.mismatchPct, 0);
    assert.equal(result.json.passed, true);
  } else {
    assert.equal(typeof check.mismatchPct, 'number');
  }
});

serialTest("M2b-AC-04 break-it: a one-pixel change in the target fails Gate 2 on the pixel source of truth", async () => {
  const repo = freshDir('m2b', 'ac04-diff');
  const source = copyPrototype(repo);
  const target = path.join(repo, 'target.html');
  fs.copyFileSync(source, target);
  fs.appendFileSync(target, '<style>main{outline:1px solid #f00}</style>\n');
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    maxDiff: 0,
    routes: [{ id: 'home', path: '/', referenceRequired: true, reference: { kind: 'html-file', source } }],
    target: { kind: 'static', file: target },
  });
  const captured = await capture(repo, []);
  assert.equal(captured.code, 0);
  const result = await compare(repo, []);
  const check = result.json?.gates?.gate2?.checks?.[0];
  assert.ok(check, 'compare reports a check');
  if (pixelSourceOfTruth) {
    assert.equal(result.code, 1);
    assert.ok(check.mismatchPct > 0);
    assert.equal(result.json.passed, false);
  }
});

serialTest("M2b-AC-05: Editing one PNG without updating `manifest.json` fails with `gate2.reference-tampered.<route>.<viewport>`.", async () => {
  const repo = freshDir('m2b', 'ac05');
  const source = copyPrototype(repo);
  writeJson(path.join(repo, 'pixel-gate.config.json'), htmlConfig(repo, { kind: 'html-file', source }));
  const captured = await capture(repo, []);
  assert.equal(captured.code, 0);
  const png = path.join(bundleDir(repo), 'desktop.png');
  const buf = fs.readFileSync(png);
  buf[buf.length - 20] ^= 0xff;
  fs.writeFileSync(png, buf);
  const result = await compare(repo, []);
  assert.equal(result.code, 1);
  const finding = findings(result.json).find((f) => f.id === 'gate2.reference-tampered.home.desktop');
  assert.ok(finding, `expected gate2.reference-tampered.home.desktop, got ${findingIds(result.json).join(', ')}`);
  assert.equal(finding.severity, 'fail');
  assert.equal(finding.gate, 'gate2');
});

serialTest("M2b-AC-05 break-it: updating manifest sha256.png to the edited bytes clears the tamper finding", async () => {
  const repo = freshDir('m2b', 'ac05-fix');
  const source = copyPrototype(repo);
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    maxDiff: 100,
    routes: [{ id: 'home', path: '/', referenceRequired: true, reference: { kind: 'html-file', source } }],
    target: { kind: 'static', file: source },
  });
  const captured = await capture(repo, []);
  assert.equal(captured.code, 0);
  const png = path.join(bundleDir(repo), 'desktop.png');
  const buf = fs.readFileSync(png);
  buf[buf.length - 20] ^= 0xff;
  fs.writeFileSync(png, buf);
  const manifestPath = path.join(bundleDir(repo), 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.sha256.png = sha256(png);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = await compare(repo, []);
  assert.equal(findingIds(result.json).includes('gate2.reference-tampered.home.desktop'), false);
});

serialTest("M2b-AC-06: A `url` capture of a local fixture server applies `reference.prepare` (a fixture cookie banner is dismissed before capture), and records a `.har`.", async () => {
  const { startFixtureServer } = await import('../m2-helpers.mjs');
  const root = freshDir('m2b', 'ac06-site');
  copyPrototype(root, 'index.html');
  const server = await startFixtureServer(root);
  try {
    const repo = freshDir('m2b', 'ac06');
    writeJson(path.join(repo, 'pixel-gate.config.json'), {
      viewports: VIEW,
      dpr: 1,
      routes: [{
        id: 'home',
        path: '/',
        reference: {
          kind: 'url',
          source: `${server.baseUrl}/index.html`,
          acknowledgeCopyright: true,
          prepare: [{ action: 'click', selector: '#cookie-accept' }],
        },
      }],
    });
    const result = await capture(repo, []);
    assert.equal(result.code, 0, 'acknowledged url capture exits 0');
    const html = fs.readFileSync(result.json.artifacts.captureHtml, 'utf8');
    assert.equal(html.includes('cookies'), false, 'prepare removed the cookie banner before capture');
    const har = JSON.parse(fs.readFileSync(path.join(bundleDir(repo), '.har'), 'utf8'));
    assert.equal(har.log.version, '1.2');
    assert.ok(Array.isArray(har.log.entries));
  } finally {
    await server.close();
  }
});

serialTest("M2b-AC-06 break-it: without reference.prepare the cookie banner remains in the capture", async () => {
  const { startFixtureServer } = await import('../m2-helpers.mjs');
  const root = freshDir('m2b', 'ac06-banner-site');
  copyPrototype(root, 'index.html');
  const server = await startFixtureServer(root);
  try {
    const repo = freshDir('m2b', 'ac06-banner');
    writeJson(path.join(repo, 'pixel-gate.config.json'), {
      viewports: VIEW,
      dpr: 1,
      routes: [{
        id: 'home',
        path: '/',
        reference: { kind: 'url', source: `${server.baseUrl}/index.html`, acknowledgeCopyright: true },
      }],
    });
    const result = await capture(repo, []);
    assert.equal(result.code, 0);
    const html = fs.readFileSync(result.json.artifacts.captureHtml, 'utf8');
    assert.equal(html.includes('id="banner"'), true, 'without prepare the banner is still in the capture');
  } finally {
    await server.close();
  }
});

serialTest("M2b-AC-07: A `url` capture prints the section 12.8 copyright disclaimer and refuses to capture until the user acknowledges it (`reference.acknowledgeCopyright: true` in config, `--acknowledge-copyright`, or answering `yes` at the interactive prompt). Without it, it exits `1` with `gate2.reference-copy-unacknowledged.<route>` and a `blocked` stop reason. With it, `manifest.json` records `copyAcknowledgedAt`. There is no rights field and no origin allowlist.", async () => {
  const { startFixtureServer } = await import('../m2-helpers.mjs');
  const root = freshDir('m2b', 'ac07-site');
  copyPrototype(root, 'index.html');
  const server = await startFixtureServer(root);
  try {
    const source = `${server.baseUrl}/index.html`;
    const bare = makeWork('ac07-bare', {
      viewports: VIEW,
      dpr: 1,
      routes: [{ id: 'home', path: '/', reference: { kind: 'url', source } }],
    });
    const refused = await capture(bare, []);
    assert.equal(refused.code, 1);
    assert.ok(refused.stderr.includes(COPYRIGHT_DISCLAIMER), 'disclaimer is printed to stderr');
    assert.equal(refused.json && refused.json.loop && refused.json.loop.stopReason, 'blocked');
    assert.ok(findingIds(refused.json).includes('gate2.reference-copy-unacknowledged.home'));
    assert.equal(fs.existsSync(bundleDir(bare)), false);

    const flagged = makeWork('ac07-flag', {
      viewports: VIEW,
      dpr: 1,
      routes: [{ id: 'home', path: '/', reference: { kind: 'url', source } }],
    });
    const byFlag = await capture(flagged, ['--acknowledge-copyright']);
    assert.equal(byFlag.code, 0);
    assert.match(readManifest(flagged).copyAcknowledgedAt, /^\d{4}-\d{2}-\d{2}T/);

    const configured = makeWork('ac07-cfg', {
      viewports: VIEW,
      dpr: 1,
      routes: [{ id: 'home', path: '/', reference: { kind: 'url', source, acknowledgeCopyright: true } }],
    });
    const byConfig = await capture(configured, []);
    assert.equal(byConfig.code, 0);
    assert.match(readManifest(configured).copyAcknowledgedAt, /^\d{4}-\d{2}-\d{2}T/);

    if (process.platform !== 'win32') {
      const prompted = makeWork('ac07-pty', {
        viewports: VIEW,
        dpr: 1,
        routes: [{ id: 'home', path: '/', reference: { kind: 'url', source } }],
      });
      const byPrompt = await runPrompted(prompted, ['reference', 'capture', '--config', 'pixel-gate.config.json'], 'yes\n');
      assert.equal(byPrompt.spawnError, null, byPrompt.spawnError || '');
      assert.equal(byPrompt.code, 0, 'answering yes at the TTY prompt captures');
      assert.match(readManifest(prompted).copyAcknowledgedAt, /^\d{4}-\d{2}-\d{2}T/);
    }
  } finally {
    await server.close();
  }
});

serialTest("M2b-AC-07 break-it: a rights field does not authorize a url capture", async () => {
  const repo = makeWork('ac07-rights', {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', reference: { kind: 'url', source: 'http://127.0.0.1:9/', rights: 'owned' } }],
  });
  const result = await capture(repo, []);
  assert.equal(result.code, 1);
  assert.ok(findingIds(result.json).includes('gate2.reference-copy-unacknowledged.home'));
  assert.equal(result.json && result.json.loop && result.json.loop.stopReason, 'blocked');
});

serialTest("M2b-AC-07 break-it: an origin allowlist does not authorize a url capture", async () => {
  const repo = makeWork('ac07-origins', {
    viewports: VIEW,
    dpr: 1,
    allowNetwork: ['http://127.0.0.1:9'],
    routes: [{ id: 'home', path: '/', reference: { kind: 'url', source: 'http://127.0.0.1:9/', origins: ['http://127.0.0.1:9'] } }],
  });
  const result = await capture(repo, []);
  assert.equal(result.code, 1);
  assert.ok(findingIds(result.json).includes('gate2.reference-copy-unacknowledged.home'));
});

serialTest("M2b-AC-07 break-it: answering no at the prompt does not authorize a url capture", async () => {
  if (process.platform === 'win32') {
    const repo = makeWork('ac07-no-win', {
      viewports: VIEW,
      dpr: 1,
      routes: [{ id: 'home', path: '/', reference: { kind: 'url', source: 'http://127.0.0.1:9/' } }],
    });
    const result = await capture(repo, []);
    assert.ok(findingIds(result.json).includes('gate2.reference-copy-unacknowledged.home'));
    return;
  }
  const repo = makeWork('ac07-no', {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', reference: { kind: 'url', source: 'http://127.0.0.1:9/' } }],
  });
  const result = await runPrompted(repo, ['reference', 'capture', '--config', 'pixel-gate.config.json'], 'no\n');
  assert.equal(result.code, 1);
  assert.ok(findingIds(result.json).includes('gate2.reference-copy-unacknowledged.home'));
  assert.equal(fs.existsSync(bundleDir(repo)), false);
});

serialTest("M2b-AC-08: A loop run never re-reads a `url` source: stopping the fixture server after capture does not change the Gate 2 result. `--refresh` re-captures and writes a new `capturedAt`.", async () => {
  const { startFixtureServer } = await import('../m2-helpers.mjs');
  const root = freshDir('m2b', 'ac08-site');
  copyPrototype(root, 'index.html');
  const server = await startFixtureServer(root);
  const repo = freshDir('m2b', 'ac08');
  const source = copyPrototype(repo, 'target.html');
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    maxDiff: 0.5,
    routes: [{
      id: 'home',
      path: '/',
      reference: { kind: 'url', source: `${server.baseUrl}/index.html`, acknowledgeCopyright: true, prepare: [{ action: 'click', selector: '#cookie-accept' }] },
    }],
    target: { kind: 'static', file: source },
  });
  try {
    const captured = await capture(repo, []);
    assert.equal(captured.code, 0);
    const capturedAt = readManifest(repo) && readManifest(repo).capturedAt;
    assert.equal(typeof capturedAt, 'string');
    const live = await compare(repo, ['--run-id', 'frozen']);
    const liveCheck = live.json && live.json.gates && live.json.gates.gate2 && live.json.gates.gate2.checks && live.json.gates.gate2.checks[0];
    assert.ok(liveCheck, 'compare against the frozen bundle reports a check');
    const refreshed = await capture(repo, ['--refresh']);
    assert.equal(refreshed.code, 0, '--refresh re-captures while the source is up');
    const refreshedAt = readManifest(repo) && readManifest(repo).capturedAt;
    assert.notEqual(refreshedAt, capturedAt, '--refresh writes a new capturedAt');
    await server.close();
    const frozen = await compare(repo, ['--run-id', 'frozen']);
    const frozenCheck = frozen.json && frozen.json.gates && frozen.json.gates.gate2 && frozen.json.gates.gate2.checks && frozen.json.gates.gate2.checks[0];
    assert.ok(frozenCheck, 'compare after the server stops still reports a check');
    assert.equal(frozenCheck.mismatchPct, liveCheck.mismatchPct);
    assert.equal(frozen.code, live.code);
    assert.equal(readManifest(repo).capturedAt, refreshedAt, 'a loop compare does not re-capture');
  } finally {
    await server.close();
  }
});

serialTest("M2b-AC-08 break-it: --refresh is what changes capturedAt", async () => {
  const repo = freshDir('m2b', 'ac08-refresh');
  const source = copyPrototype(repo);
  writeJson(path.join(repo, 'pixel-gate.config.json'), htmlConfig(repo, { kind: 'html-file', source }));
  const first = await capture(repo, []);
  assert.equal(first.code, 0);
  const capturedAt = readManifest(repo).capturedAt;
  const second = await capture(repo, []);
  assert.equal(second.code, 0);
  assert.equal(readManifest(repo).capturedAt, capturedAt, 'a second capture without --refresh keeps capturedAt');
  const third = await capture(repo, ['--refresh']);
  assert.equal(third.code, 0);
  assert.notEqual(readManifest(repo).capturedAt, capturedAt);
});
