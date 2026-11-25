/**
 * M2b.6 screenshot intake and tiers B/C. Pixel numbers are guarded with
 * process.platform !== "win32". Gap tests fail with ERR_ASSERTION.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  TINY_JPEG,
  TINY_WEBP,
  compare,
  findingIds,
  findings,
  freshDir,
  pixelSourceOfTruth,
  pngSize,
  sha256,
  solid,
  writeJson,
  writePng,
} from '../m2b-helpers.mjs';

const VIEW = [{ name: 'desktop', width: 100, height: 100 }];

function shotRepo(name, { file, kind = 'screenshot', extra = {}, html, maxDiff }) {
  const repo = freshDir('m2b', name);
  const page = path.join(repo, 'page.html');
  fs.writeFileSync(page, html || '<!doctype html><html><body style="margin:0;width:100px;height:100px;background:#fff"></body></html>');
  const reference = { kind, source: file, ...extra };
  if (maxDiff !== undefined) reference.maxDiff = maxDiff;
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    maxDiff: 0.5,
    routes: [{ id: 'home', path: '/', reference }],
    target: { kind: 'static', file: page },
  });
  return repo;
}

serialTest('M2b-AC-34: A screenshot whose `width / dpr` does not equal a declared viewport width fails with `gate2.reference-scale-unknown.<route>` and is not resized.', async () => {
  const repo = freshDir('m2b', 'ac34');
  const shot = path.join(repo, 'shot.png');
  writePng(shot, 80, 40, solid(1, 2, 3));
  const before = fs.readFileSync(shot);
  const work = shotRepo('ac34-run', { file: shot });
  const result = await compare(work, []);
  assert.equal(result.code, 1);
  assert.ok(findingIds(result.json).includes('gate2.reference-scale-unknown.home'));
  assert.equal(result.json && result.json.loop && result.json.loop.stopReason, 'blocked');
  assert.ok(fs.readFileSync(shot).equals(before), 'the source image is not resized');
  const size = pngSize(shot);
  assert.equal(size.width, 80);
});

serialTest('M2b-AC-34 break-it: a screenshot whose width divided by dpr equals the viewport is not scale-unknown', async () => {
  const repo = freshDir('m2b', 'ac34-ok');
  const shot = path.join(repo, 'shot.png');
  writePng(shot, 100, 100, solid(255, 255, 255));
  const work = shotRepo('ac34-fit', { file: shot });
  const result = await compare(work, []);
  assert.equal(findingIds(result.json).includes('gate2.reference-scale-unknown.home'), false);
  assert.notEqual(result.json && result.json.loop && result.json.loop.stopReason, 'blocked');
  const check = result.json && result.json.gates && result.json.gates.gate2 && result.json.gates.gate2.checks && result.json.gates.gate2.checks[0];
  assert.ok(check, 'a matching scale is compared');
});

serialTest('M2b-AC-35: `reference.crop` removes a fixture browser bar; the cropped PNG is what `manifest.json` hashes.', async () => {
  const repo = freshDir('m2b', 'ac35');
  const shot = path.join(repo, 'shot.png');
  writePng(shot, 100, 120, (x, y) => (y < 20 ? [10, 10, 10, 255] : [255, 255, 255, 255]));
  const work = shotRepo('ac35-run', { file: shot, extra: { crop: { top: 20 } } });
  const captured = await (await import('../m2b-helpers.mjs')).capture(work, []);
  assert.equal(captured.code, 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(work, '.visual-eval', 'references', 'home', 'desktop', 'manifest.json'), 'utf8'));
  const cropped = path.join(work, '.visual-eval', 'references', 'home', 'desktop', 'desktop.png');
  const size = pngSize(cropped);
  assert.equal(size && size.width, 100);
  assert.equal(size && size.height, 100);
  assert.equal(size.data[1], 255, 'the dark browser bar is gone');
  assert.equal(manifest.sha256.png, sha256(cropped));
});

serialTest('M2b-AC-35 break-it: without crop the manifest hash covers the uncropped PNG including the bar', async () => {
  const repo = freshDir('m2b', 'ac35-full');
  const shot = path.join(repo, 'shot.png');
  writePng(shot, 100, 100, (x, y) => (y < 20 ? [10, 10, 10, 255] : [255, 255, 255, 255]));
  const work = shotRepo('ac35-nocrop', { file: shot });
  const captured = await (await import('../m2b-helpers.mjs')).capture(work, []);
  assert.equal(captured.code, 0);
  const cropped = path.join(work, '.visual-eval', 'references', 'home', 'desktop', 'desktop.png');
  const size = pngSize(cropped);
  assert.equal(size && size.height, 100);
  assert.equal(size.data[1], 10, 'the bar remains when crop is omitted');
});

serialTest('M2b-AC-36: `reference.region: "viewport"` compares only the top `height / dpr` CSS px of a taller target; `"full"` keeps the section 5 exact-height failure.', async () => {
  const shot = path.join(freshDir('m2b', 'ac36-shot'), 'shot.png');
  writePng(shot, 100, 100, solid(255, 255, 255));
  const tall = '<!doctype html><html><body style="margin:0;background:#fff"><div style="height:100px"></div><div style="height:80px;background:#f00"></div></body></html>';
  const viewport = shotRepo('ac36-view', { file: shot, extra: { region: 'viewport' }, html: tall });
  const full = shotRepo('ac36-full', { file: shot, extra: { region: 'full' }, html: tall });
  const viewRun = await compare(viewport, []);
  const fullRun = await compare(full, []);
  const viewCheck = viewRun.json && viewRun.json.gates && viewRun.json.gates.gate2 && viewRun.json.gates.gate2.checks && viewRun.json.gates.gate2.checks[0];
  assert.ok(viewCheck, 'viewport region reports a check');
  if (pixelSourceOfTruth) {
    assert.equal(viewRun.code, 0, 'the fold below the viewport is ignored');
    assert.equal(viewCheck.mismatchPct, 0);
    assert.equal(fullRun.code, 1, 'full region keeps the exact-height failure');
  }
  assert.equal(fullRun.json && fullRun.json.loop && fullRun.json.loop.stopReason === 'passed', false);
});

serialTest('M2b-AC-36 break-it: omitting reference.region does not crop to the viewport', async () => {
  const shot = path.join(freshDir('m2b', 'ac36-omit'), 'shot.png');
  writePng(shot, 100, 100, solid(255, 255, 255));
  const tall = '<!doctype html><html><body style="margin:0;background:#fff"><div style="height:180px"></div></body></html>';
  const work = shotRepo('ac36-omit-run', { file: shot, html: tall });
  const result = await compare(work, []);
  assert.equal(result.code, 1, 'with no region declared a taller target fails the height rule');
  assert.equal(findingIds(result.json).some((id) => /height|dimension|region/.test(id)), true);
});

serialTest('M2b-AC-37: A JPEG input is accepted only for `kind: "screenshot"` and is marked tier C.', async () => {
  const repo = freshDir('m2b', 'ac37');
  const jpeg = path.join(repo, 'shot.jpg');
  fs.writeFileSync(jpeg, TINY_JPEG);
  const work = shotRepo('ac37-ok', { file: jpeg });
  const result = await compare(work, []);
  const manifestPath = path.join(work, '.visual-eval', 'references', 'home', 'desktop', 'manifest.json');
  assert.equal(fs.existsSync(manifestPath), true, 'screenshot intake writes manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.tier, 'C');
  assert.equal(manifest.sourceFormat, 'jpeg');
  assert.notEqual(result.json && result.json.loop && result.json.loop.stopReason, 'blocked');
});

serialTest('M2b-AC-37 break-it: a JPEG reference with kind png is rejected', async () => {
  const repo = freshDir('m2b', 'ac37-png');
  const jpeg = path.join(repo, 'shot.jpg');
  fs.writeFileSync(jpeg, TINY_JPEG);
  const work = shotRepo('ac37-bad', { file: jpeg, kind: 'png' });
  const result = await compare(work, []);
  assert.equal(result.code, 1);
  assert.equal(result.json && result.json.loop && result.json.loop.stopReason, 'blocked');
});

serialTest('M2b-AC-37 break-it: a WebP screenshot is accepted and marked tier C', async () => {
  const repo = freshDir('m2b', 'ac37-webp');
  const webp = path.join(repo, 'shot.webp');
  fs.writeFileSync(webp, TINY_WEBP);
  const work = shotRepo('ac37-webp-run', { file: webp });
  const result = await compare(work, []);
  const manifestPath = path.join(work, '.visual-eval', 'references', 'home', 'desktop', 'manifest.json');
  assert.equal(fs.existsSync(manifestPath), true, 'webp intake writes manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.tier, 'C');
  assert.equal(manifest.sourceFormat, 'webp');
  assert.notEqual(result.json && result.json.loop && result.json.loop.stopReason, 'blocked');
});

serialTest('M2b-AC-38: Tier C comparison is advisory: a target with `mismatchPct` `35` against its screenshot exits `0` (when Gates 1/3 pass), reports `info` findings, and `gates.gate2.advisory` is `{ "similarityPct": 65, "thresholdPct": 80, "met": false }`.', async () => {
  const shot = path.join(freshDir('m2b', 'ac38-shot'), 'shot.png');
  writePng(shot, 100, 100, solid(255, 0, 0));
  const html = '<!doctype html><html><body style="margin:0;background:#f00"><div style="width:35px;height:100px;background:#0f0"></div></body></html>';
  const work = shotRepo('ac38', { file: shot, html });
  const result = await compare(work, []);
  const advisory = result.json && result.json.gates && result.json.gates.gate2 && result.json.gates.gate2.advisory;
  assert.ok(advisory, 'tier C sets gates.gate2.advisory');
  assert.equal(result.code, 0);
  assert.equal(result.json.passed, true);
  assert.ok(findings(result.json).some((f) => f.severity === 'info'));
  assert.equal(findings(result.json).some((f) => f.severity === 'fail' && f.gate === 'gate2'), false);
  if (pixelSourceOfTruth) {
    assert.equal(result.json.gates.gate2.checks[0].mismatchPct, 35);
    assert.deepEqual(advisory, { similarityPct: 65, thresholdPct: 80, met: false });
  }
});

serialTest('M2b-AC-38 break-it: the same 35 percent mismatch against a tier A html-file reference does not exit 0', async () => {
  const repo = freshDir('m2b', 'ac38-tier-a');
  const reference = path.join(repo, 'reference.html');
  const target = path.join(repo, 'target.html');
  fs.writeFileSync(reference, '<!doctype html><html><body style="margin:0;width:100px;height:100px;background:#f00"></body></html>');
  fs.writeFileSync(target, '<!doctype html><html><body style="margin:0;background:#f00"><div style="width:35px;height:100px;background:#0f0"></div></body></html>');
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    maxDiff: 0.5,
    routes: [{ id: 'home', path: '/', reference: { kind: 'html-file', source: reference } }],
    target: { kind: 'static', file: target },
  });
  const { capture, compare: run } = await import('../m2b-helpers.mjs');
  const captured = await capture(repo, []);
  assert.equal(captured.code, 0);
  const result = await run(repo, []);
  if (pixelSourceOfTruth) {
    assert.equal(result.code, 1);
    assert.equal(result.json.passed, false);
    assert.ok(result.json.gates.gate2.checks[0].mismatchPct > 0.5);
  } else {
    assert.ok(result.json && result.json.gates && result.json.gates.gate2);
  }
});

serialTest('M2b-AC-39: Default threshold: `reference.maxDiff` defaults to `20` for tier B/C (similarity `>= 80%`). Setting `reference.maxDiff: 5` on one route changes only that route\'s `thresholdPct` to `95`.', async () => {
  const repo = freshDir('m2b', 'ac39');
  writePng(path.join(repo, 'a.png'), 100, 100, solid(255, 0, 0));
  writePng(path.join(repo, 'b.png'), 100, 100, solid(0, 0, 255));
  const page = path.join(repo, 'page.html');
  fs.writeFileSync(page, '<!doctype html><html><body style="margin:0;background:#fff"></body></html>');
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [
      { id: 'home', path: '/', reference: { kind: 'screenshot', source: path.join(repo, 'a.png') } },
      { id: 'about', path: '/page.html', reference: { kind: 'screenshot', source: path.join(repo, 'b.png'), maxDiff: 5 } },
    ],
    target: { kind: 'static', file: page },
  });
  const result = await compare(repo, []);
  const advisory = result.json && result.json.gates && result.json.gates.gate2 && result.json.gates.gate2.checks;
  assert.ok(Array.isArray(advisory) && advisory.length === 2, 'both routes are compared');
  const home = advisory.find((check) => check.route === 'home');
  const about = advisory.find((check) => check.route === 'about');
  assert.equal(home.thresholdPct, 80);
  assert.equal(about.thresholdPct, 95);
});

serialTest('M2b-AC-39 break-it: a tier A route keeps maxDiff 0.5 when a sibling screenshot route sets maxDiff 5', async () => {
  const repo = freshDir('m2b', 'ac39-tier-a');
  const reference = path.join(repo, 'reference.html');
  fs.writeFileSync(reference, '<!doctype html><html><body style="margin:0;background:#fff"></body></html>');
  writePng(path.join(repo, 'shot.png'), 100, 100, solid(0, 0, 0));
  const page = path.join(repo, 'page.html');
  fs.writeFileSync(page, '<!doctype html><html><body style="margin:0;background:#fff"></body></html>');
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [
      { id: 'home', path: '/', reference: { kind: 'html-file', source: reference } },
      { id: 'about', path: '/page.html', reference: { kind: 'screenshot', source: path.join(repo, 'shot.png'), maxDiff: 5 } },
    ],
    target: { kind: 'static', file: page },
  });
  const result = await compare(repo, []);
  const checks = result.json && result.json.gates && result.json.gates.gate2 && result.json.gates.gate2.checks;
  assert.ok(Array.isArray(checks) && checks.length === 2, 'both routes report checks');
  assert.equal(checks.find((check) => check.route === 'home').thresholdPct, 99.5);
  assert.equal(checks.find((check) => check.route === 'about').thresholdPct, 95);
});

serialTest('M2b-AC-40: With `advisory.met` false and no other stop rule firing, `loop.continue` is `true` and `stopReason` is `null`. With `passed` true and every advisory target met, `stopReason` is `passed`.', async () => {
  const unmetShot = path.join(freshDir('m2b', 'ac40-shot'), 'shot.png');
  writePng(unmetShot, 100, 100, solid(255, 0, 0));
  const unmet = shotRepo('ac40-unmet', {
    file: unmetShot,
    html: '<!doctype html><html><body style="margin:0;background:#fff"></body></html>',
  });
  const unmetRun = await compare(unmet, ['--run-id', 'advisory']);
  assert.equal(unmetRun.json && unmetRun.json.passed, true);
  assert.equal(unmetRun.json.loop.continue, true);
  assert.equal(unmetRun.json.loop.stopReason, null);
  assert.equal(unmetRun.json.loop.advisory && unmetRun.json.loop.advisory.met, false);

  const metShot = path.join(freshDir('m2b', 'ac40-met-shot'), 'shot.png');
  writePng(metShot, 100, 100, solid(255, 255, 255));
  const met = shotRepo('ac40-met', { file: metShot });
  const metRun = await compare(met, ['--run-id', 'advisory-met']);
  assert.equal(metRun.json && metRun.json.passed, true);
  if (pixelSourceOfTruth) {
    assert.equal(metRun.json.loop.advisory.met, true);
    assert.equal(metRun.json.loop.stopReason, 'passed');
    assert.equal(metRun.json.loop.continue, false);
  }
});

serialTest('M2b-AC-40 break-it: a blocked intake error stops the loop even when advisory.met is false', async () => {
  const repo = freshDir('m2b', 'ac40-block');
  const shot = path.join(repo, 'shot.png');
  writePng(shot, 50, 50, solid(0, 0, 0));
  const work = shotRepo('ac40-block-run', { file: shot });
  const result = await compare(work, []);
  assert.equal(result.json && result.json.loop && result.json.loop.stopReason, 'blocked');
  assert.equal(result.json.loop.continue, false);
  assert.equal(result.code, 1);
});

serialTest('M2b-AC-41: Intake errors (`gate2.reference-scale-unknown.*`, unreadable image) still fail with `blocked`. They are setup problems, not comparison results.', async () => {
  const badSize = path.join(freshDir('m2b', 'ac41-size'), 'shot.png');
  writePng(badSize, 30, 30, solid(9, 9, 9));
  const scale = await compare(shotRepo('ac41-scale', { file: badSize }), []);
  assert.equal(scale.json && scale.json.loop && scale.json.loop.stopReason, 'blocked');
  assert.ok(findingIds(scale.json).includes('gate2.reference-scale-unknown.home'));

  const junk = path.join(freshDir('m2b', 'ac41-junk'), 'shot.png');
  fs.writeFileSync(junk, Buffer.from('not an image'));
  const unreadable = await compare(shotRepo('ac41-bad', { file: junk }), []);
  assert.equal(unreadable.code, 1);
  assert.equal(unreadable.json && unreadable.json.loop && unreadable.json.loop.stopReason, 'blocked');
  assert.equal(unreadable.json.gates && unreadable.json.gates.gate2 && unreadable.json.gates.gate2.advisory, undefined);
});

serialTest('M2b-AC-41 break-it: an unreadable image is blocked and a high mismatch is not blocked', async () => {
  const junk = path.join(freshDir('m2b', 'ac41-high-junk'), 'shot.png');
  fs.writeFileSync(junk, 'nope');
  const blocked = await compare(shotRepo('ac41-high-block', { file: junk }), []);
  assert.equal(blocked.json && blocked.json.loop && blocked.json.loop.stopReason, 'blocked');
  const shot = path.join(freshDir('m2b', 'ac41-high-shot'), 'shot.png');
  writePng(shot, 100, 100, solid(0, 255, 0));
  const compared = await compare(shotRepo('ac41-high', {
    file: shot,
    html: '<!doctype html><html><body style="margin:0;background:#00f"></body></html>',
  }), []);
  assert.notEqual(compared.json && compared.json.loop && compared.json.loop.stopReason, 'blocked');
  assert.equal(compared.code, 0);
});
