/**
 * M2b.8 style diff. Gap tests fail with ERR_ASSERTION.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  STYLE_PROPS,
  capture,
  compare,
  findingIds,
  findings,
  freshDir,
  writeJson,
} from '../m2b-helpers.mjs';

const VIEW = [{ name: 'desktop', width: 200, height: 120 }];

function styleRepo(name, { referenceHtml, targetHtml, kind = 'html-file', maxDiff = 0.5 }) {
  const repo = freshDir('m2b', name);
  const reference = path.join(repo, 'reference.html');
  const target = path.join(repo, 'target.html');
  fs.writeFileSync(reference, referenceHtml);
  fs.writeFileSync(target, targetHtml);
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    maxDiff,
    routes: [{
      id: 'home',
      path: '/',
      reference: { kind, source: reference, maxDiff: kind === 'html-file' ? undefined : maxDiff },
    }],
    target: { kind: 'static', file: target },
  });
  return repo;
}

const REF = '<!doctype html><html><body style="margin:0"><button id="save" style="color:#1a73e8;background:#fff;font-family:sans-serif;font-size:16px;font-weight:400;line-height:20px;padding:4px;margin:0;border-radius:2px">Save</button></body></html>';

serialTest('M2b-AC-49: For mapped elements, computed `color`, `background-color`, `font-family`, `font-size`, `font-weight`, `line-height`, `padding`, `margin`, `gap`, and `border-radius` are compared with the reference `.styles.json` or `.tokens.json`.', async () => {
  const repo = styleRepo('ac49', {
    referenceHtml: REF,
    targetHtml: REF.replace('#1a73e8', '#1a74e8'),
  });
  const captured = await capture(repo, []);
  assert.equal(captured.code, 0);
  const styles = JSON.parse(fs.readFileSync(path.join(repo, '.visual-eval', 'references', 'home', 'desktop', '.styles.json'), 'utf8'));
  const button = styles.elements.find((el) => el.selector === 'button' || el.selector === '#save');
  assert.ok(button, `styles.json lists the button, got ${JSON.stringify(styles.elements)}`);
  for (const prop of STYLE_PROPS) assert.equal(typeof button[prop], 'string', prop);
  const result = await compare(repo, []);
  const finding = findings(result.json).find((f) => f.id === 'gate2.style.button.color' || f.id === 'gate2.style.save.color');
  assert.ok(finding, `expected a color finding, got ${findingIds(result.json).join(', ')}`);
  assert.equal(finding.expected, 'rgb(26, 115, 232)');
  assert.equal(finding.actual, 'rgb(26, 116, 232)');
});

serialTest('M2b-AC-49 break-it: a property outside the compared list is not a finding', async () => {
  const repo = styleRepo('ac49-opacity', {
    referenceHtml: REF,
    targetHtml: REF.replace('<button', '<button style="opacity:0.4"').replace('style="opacity:0.4" style=', 'style="opacity:0.4;'),
  });
  const result = await compare(repo, []);
  assert.equal(findingIds(result.json).some((id) => id.includes('opacity')), false);
  const compared = result.json && result.json.gates && result.json.gates.gate2 && result.json.gates.gate2.style && result.json.gates.gate2.style.compared;
  assert.deepEqual(compared, STYLE_PROPS);
});

serialTest('M2b-AC-50: A one-step color change (e.g. `#1a73e8` → `#1a74e8`) that stays under `maxDiff` in Gate 2 still fails with `gate2.style.<selector-slug>.color` and `expected` / `actual` set.', async () => {
  const repo = styleRepo('ac50', {
    referenceHtml: REF,
    targetHtml: REF.replace('#1a73e8', '#1a74e8'),
  });
  const result = await compare(repo, []);
  const finding = findings(result.json).find((f) => f.id === 'gate2.style.button.color');
  assert.ok(finding, `a sub-pixel color change is still a style finding, got ${findingIds(result.json).join(', ')}`);
  assert.equal(finding.severity, 'fail');
  assert.equal(result.json.passed, false);
  const check = result.json.gates.gate2.checks[0];
  assert.ok(check && check.mismatchPct < 0.5, 'the pixel mismatch stays under the tier A threshold');
});

serialTest('M2b-AC-50 break-it: an identical computed color does not emit gate2.style.button.color', async () => {
  const repo = styleRepo('ac50-same', { referenceHtml: REF, targetHtml: REF });
  const result = await compare(repo, []);
  assert.equal(findingIds(result.json).includes('gate2.style.button.color'), false);
  assert.equal(result.code, 0);
  const compared = result.json && result.json.gates && result.json.gates.gate2 && result.json.gates.gate2.style && result.json.gates.gate2.style.compared;
  assert.ok(Array.isArray(compared) && compared.includes('color'));
});

serialTest('M2b-AC-51: An element missing on the target is one finding, not one per property.', async () => {
  const repo = styleRepo('ac51', {
    referenceHtml: REF,
    targetHtml: '<!doctype html><html><body style="margin:0"><p>no button</p></body></html>',
  });
  const result = await compare(repo, []);
  const missing = findings(result.json).filter((f) => f.id === 'gate2.style.button.missing' || f.id === 'gate2.style.save.missing');
  assert.equal(missing.length, 1);
  assert.equal(findingIds(result.json).filter((id) => id.startsWith('gate2.style.')).length, 1);
});

serialTest('M2b-AC-52: Style findings are `fail` against tier A references (`.styles.json` from `html-file` / `url`) and `info` against tier B tokens (`.tokens.json` from a design file).', async () => {
  const tierA = styleRepo('ac52-a', {
    referenceHtml: REF,
    targetHtml: REF.replace('#1a73e8', '#1a74e8'),
  });
  const a = await compare(tierA, []);
  const aFinding = findings(a.json).find((f) => f.id === 'gate2.style.button.color');
  assert.ok(aFinding);
  assert.equal(aFinding.severity, 'fail');
  assert.equal(a.json.passed, false);

  const { writePng, solid } = await import('../m2b-helpers.mjs');
  const repo = freshDir('m2b', 'ac52-b');
  const exportDir = path.join(repo, 'export');
  writePng(path.join(exportDir, 'home', 'desktop.png'), 200, 120, solid(255, 255, 255));
  const vars = path.join(repo, 'vars.json');
  writeJson(vars, { 'color/brand': '#1a73e8' });
  const page = path.join(repo, 'page.html');
  fs.writeFileSync(page, REF.replace('#1a73e8', '#1a74e8'));
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    routes: [{ id: 'home', path: '/', reference: { kind: 'design-file' } }],
    design: {
      fileKey: 'FILEKEY',
      frames: [{ nodeId: '1:2', route: 'home', viewport: 'desktop' }],
      exportDir,
      variableDefs: vars,
      apiBase: 'http://127.0.0.1:9',
    },
    target: { kind: 'static', file: page },
  });
  const b = await compare(repo, []);
  const bFinding = findings(b.json).find((f) => f.id === 'gate2.style.button.color');
  assert.ok(bFinding, 'tier B tokens still report the color');
  assert.equal(bFinding.severity, 'info');
  assert.equal(b.json.passed, true);
  assert.equal(b.json.gates.gate2.style.reference, 'tokens');
});
