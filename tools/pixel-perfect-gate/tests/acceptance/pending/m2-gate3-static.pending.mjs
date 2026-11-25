/**
 * M2.1 Gate 3 static-audit gap tests. Every test fails with ERR_ASSERTION until the product meets it.
 * M1-AC-01 through M1-AC-15 are green. M2-AC-01 through M2-AC-37 are gaps. ENFORCED_MILESTONES is M1 and M2.
 * Promote this file to tests/acceptance/m2/*.test.mjs with the section 8 box and manifest suite "pass"
 * in the same change (SPEC.md section 13). Section 6: schemaVersion 1; gates.gate1/gate2/gate3;
 * findings[].id is the stable branch key; error is null or { message }; a skipped gate is
 * { passed: true, skipped: true, reason }; --help and --version are the only non-JSON exits.
 * Playwright is pinned to 1.65.1. mismatchPct blocks on ubuntu-latest; Windows and macOS report it
 * (guard process.platform !== "win32"). Editing this file requires "Acceptance-test change rationale:".
 * `pixel-gate --url <page> --gate3-static` scans one page.
 * Rule tokens are fixed: no-accessible-name, dead-href, covered-target, no-label.
 * Findings are tied to the exact fixture element by resolving each finding's selector on the live page.
 */
import assert from 'node:assert/strict';
import { serialTest } from '../harness.mjs';
import {
  elementIdsFor,
  envelopeProblems,
  findingIds,
  freshDir,
  gate3Findings,
  resolveSelectors,
  runGate,
  startFixtureServer,
} from '../m2-helpers.mjs';

async function scan(page, body) {
  const server = await startFixtureServer();
  try {
    const cwd = freshDir('gate3-static', page.replace('.html', ''));
    const url = `${server.baseUrl}/m2/site/${page}`;
    const run = await runGate(cwd, ['--url', url, '--gate3-static']);
    const rule = async (name) => {
      const findings = gate3Findings(run.json).filter((f) => f.id.startsWith(`gate3.${name}.`));
      const ids = (await elementIdsFor(url, findings)).sort();
      return { findings, ids };
    };
    return await body({ run, url, cwd, rule });
  } finally {
    await server.close();
  }
}

function assertRan(run) {
  assert.deepEqual(envelopeProblems(run.json), [], 'the run prints one section 6 object');
  assert.equal(run.json.gates.gate3.skipped === true, false, 'gate3 runs when --gate3-static is given');
}

serialTest('M2-AC-10: Flags a button or link-role control with no accessible name.', async () => {
  await scan('static-bad.html', async ({ run, rule }) => {
    assertRan(run);
    const { ids } = await rule('no-accessible-name');
    assert.deepEqual(
      ids,
      ['b-icon', 'l-empty', 'r-btn', 'r-link'],
      'exactly the unnamed button, link, role=button and role=link are flagged; Save, aria-label and About are not'
    );
  });
});

serialTest('M2-AC-11: Flags `href="#"` and `href=""`.', async () => {
  await scan('static-bad.html', async ({ run, rule }) => {
    assertRan(run);
    const { ids } = await rule('dead-href');
    assert.deepEqual(ids, ['d-empty', 'd-hash'], 'href="#" and href="" are flagged; href="#main" and real paths are not');
  });
});

serialTest('M2-AC-12: Flags a click target whose center is covered by another element.', async () => {
  await scan('static-bad.html', async ({ run, rule }) => {
    assertRan(run);
    const { ids } = await rule('covered-target');
    assert.deepEqual(
      ids,
      ['covered'],
      'only the control whose center is under an overlay is flagged; an edge-only overlay and a pointer-events:none overlay are not covers'
    );
  });
});

serialTest('M2-AC-13: Flags an input, select, or textarea with no associated label.', async () => {
  await scan('static-bad.html', async ({ run, rule }) => {
    assertRan(run);
    const { ids } = await rule('no-label');
    assert.deepEqual(
      ids,
      ['in-bad', 'in-placeholder', 'sel-bad', 'ta-bad'],
      'unlabelled input, select, textarea and a placeholder-only input are flagged; for=, wrapping label, aria-label, aria-labelledby, hidden and submit inputs are not'
    );
  });
});

serialTest('M2-AC-14: Each static hit is a `findings` entry with `id`, `selector`, `box`, and `text`.', async () => {
  const server = await startFixtureServer();
  try {
    const url = `${server.baseUrl}/m2/site/static-bad.html`;
    const first = await runGate(freshDir('gate3-shape', 'one'), ['--url', url, '--gate3-static']);
    const second = await runGate(freshDir('gate3-shape', 'two'), ['--url', url, '--gate3-static']);
    assertRan(first);
    const findings = gate3Findings(first.json);
    assert.equal(findings.length, 11, `static-bad.html has 4+2+1+4 problems and no more (got ${findingIds(first.json).join(', ')})`);
    assert.equal(new Set(findings.map((f) => f.id)).size, findings.length, 'finding ids are unique');
    assert.equal(first.json.passed, false, 'gate3 findings fail the run');
    assert.equal(first.json.exitCode, 1);
    assert.equal(first.code, 1, 'the process exit code equals exitCode');
    assert.equal(first.json.gates.gate3.passed, false);
    const rows = await resolveSelectors(url, findings.map((f) => f.selector));
    findings.forEach((f, index) => {
      assert.match(f.id, /^gate3\.(no-accessible-name|dead-href|covered-target|no-label)\.\S+$/, `fixed rule token in ${f.id}`);
      assert.equal(f.gate, 'gate3');
      assert.equal(f.severity, 'fail');
      assert.equal(typeof f.selector, 'string');
      assert.equal(rows[index].count, 1, `selector ${f.selector} of ${f.id} must match exactly one element`);
      assert.ok(f.box && typeof f.box === 'object', `${f.id} has a box`);
      for (const key of ['x', 'y', 'width', 'height']) {
        assert.ok(Number.isInteger(f.box[key]), `${f.id} box.${key} is an integer CSS pixel value`);
      }
      assert.ok(f.box.width > 0 && f.box.height > 0, `${f.id} box has a size`);
      assert.ok(typeof f.text === 'string' && f.text.length > 0, `${f.id} has text`);
    });
    assert.deepEqual(findingIds(second.json), findingIds(first.json), 'ids are identical across two runs of the same page');
  } finally {
    await server.close();
  }
});

serialTest('M2-AC-14 break-it: a clean page has no gate3 findings and gate3 passes', async () => {
  await scan('static-good.html', async ({ run, rule }) => {
    assertRan(run);
    assert.deepEqual(gate3Findings(run.json).map((f) => f.id), [], 'no gate3 finding on the good page');
    assert.equal(run.json.gates.gate3.passed, true);
    for (const name of ['no-accessible-name', 'dead-href', 'covered-target', 'no-label']) {
      const { ids } = await rule(name);
      assert.deepEqual(ids, [], `rule ${name} reports nothing on the good page`);
    }
  });
});
