/**
 * M3 Eval Benchmarks gap tests. Each test fails with ERR_ASSERTION until the viewer exists.
 * M3-AC-01 through M3-AC-03 are gaps. M3-AC-04 is green. ENFORCED_MILESTONES includes M3.
 * Interface: SPEC.md section 7, "Interfaces pinned by the M3 acceptance tests".
 * These asserts are the same on Windows and Ubuntu (no pixel mismatchPct bar).
 * Editing this file requires "Acceptance-test change rationale:" in the PR body.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  expectedGroups,
  freshDir,
  parseJsonl,
  runDashboard,
  telemetryFixture,
  writeJsonl,
} from '../m3-helpers.mjs';

function assertBenchmark(run, rows, detail) {
  assert.equal(run.spawnError, null, detail);
  assert.equal(run.code, 0, `${detail} stderr=${String(run.stderr).slice(0, 300)}`);
  assert.deepEqual(run.json, {
    view: 'benchmarks',
    primary: true,
    groups: expectedGroups(rows),
  });
}

function assertBenchmarkError(run) {
  assert.equal(run.spawnError, null, run.spawnError);
  assert.equal(run.code, 1, `stderr=${String(run.stderr).slice(0, 300)} stdout=${String(run.stdout).slice(0, 300)}`);
  assert.ok(run.json, 'stdout must be one JSON object');
  assert.deepEqual(Object.keys(run.json).sort(), ['error', 'view']);
  assert.equal(run.json.view, 'benchmarks');
  assert.deepEqual(Object.keys(run.json.error).sort(), ['message']);
  assert.equal(typeof run.json.error.message, 'string');
  assert.ok(run.json.error.message.length > 0);
}

serialTest('M3-AC-01: **Eval Benchmarks (primary):** Groups `.visual-eval/telemetry.jsonl` by `model`, `harness`, and `iteration`.', async () => {
  const rows = parseJsonl(fs.readFileSync(telemetryFixture, 'utf8'));
  assert.equal(rows.length, 4, 'the committed fixture is the grouping input');

  const flagged = await runDashboard(['benchmarks', '--telemetry', telemetryFixture]);
  assertBenchmark(flagged, rows, '--telemetry');

  const project = freshDir('ac01-default');
  const other = freshDir('ac01-other');
  try {
    const copied = path.join(project, '.visual-eval', 'telemetry.jsonl');
    fs.mkdirSync(path.dirname(copied), { recursive: true });
    fs.copyFileSync(telemetryFixture, copied);
    writeJsonl(path.join(other, '.visual-eval', 'telemetry.jsonl'), [
      { schemaVersion: 1, model: 'from-cwd', harness: 'cursor', iteration: 1 },
    ]);

    const implicit = await runDashboard(['benchmarks'], { cwd: project });
    assertBenchmark(implicit, rows, 'default .visual-eval/telemetry.jsonl');

    const flagWins = await runDashboard(['benchmarks', '--telemetry', telemetryFixture], { cwd: other });
    assertBenchmark(flagWins, rows, '--telemetry overrides the default path');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});

serialTest('M3-AC-01 break-it: rows with the same model, harness, and iteration are one group', async () => {
  const dir = freshDir('ac01-merge');
  try {
    const file = writeJsonl(path.join(dir, 'same.jsonl'), [
      { schemaVersion: 1, model: 'alpha', harness: 'cursor', iteration: 1, mismatchPct: 0 },
      { schemaVersion: 1, model: 'alpha', harness: 'cursor', iteration: 1, mismatchPct: 4 },
    ]);
    const run = await runDashboard(['benchmarks', '--telemetry', file]);
    assertBenchmark(run, parseJsonl(fs.readFileSync(file, 'utf8')), 'same triple');
    assert.equal(run.json.groups.length, 1);
    assert.equal(run.json.groups[0].count, 2);
    assert.deepEqual(run.json.groups[0].rows.map((row) => row.mismatchPct), [0, 4]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

serialTest('M3-AC-01 break-it: a different model, harness, or iteration is a different group', async () => {
  const dir = freshDir('ac01-split');
  try {
    const cases = [
      [
        { schemaVersion: 1, model: 'alpha', harness: 'cursor', iteration: 1 },
        { schemaVersion: 1, model: 'beta', harness: 'cursor', iteration: 1 },
      ],
      [
        { schemaVersion: 1, model: 'alpha', harness: 'cursor', iteration: 1 },
        { schemaVersion: 1, model: 'alpha', harness: 'antigravity-cli', iteration: 1 },
      ],
      [
        { schemaVersion: 1, model: 'alpha', harness: 'cursor', iteration: 1 },
        { schemaVersion: 1, model: 'alpha', harness: 'cursor', iteration: 2 },
      ],
    ];
    for (const rows of cases) {
      const file = writeJsonl(path.join(dir, `${rows[1].model}-${rows[1].harness}-${rows[1].iteration}.jsonl`), rows);
      const run = await runDashboard(['benchmarks', '--telemetry', file]);
      assertBenchmark(run, rows, `${rows[1].model}/${rows[1].harness}/${rows[1].iteration}`);
      assert.equal(run.json.groups.length, 2);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

serialTest('M3-AC-01 break-it: groups are ordered by model, then harness, then numeric iteration', async () => {
  const dir = freshDir('ac01-order');
  try {
    const rows = [
      { schemaVersion: 1, model: 'm', harness: 'h', iteration: 10 },
      { schemaVersion: 1, model: 'b', harness: 'a', iteration: 1 },
      { schemaVersion: 1, model: 'a', harness: 'b', iteration: 2 },
      { schemaVersion: 1, model: 'a', harness: 'a', iteration: 2 },
    ];
    const file = writeJsonl(path.join(dir, 'order.jsonl'), rows);
    const run = await runDashboard(['benchmarks', '--telemetry', file]);
    assertBenchmark(run, rows, 'sort');
    assert.deepEqual(
      run.json.groups.map((group) => [group.model, group.harness, group.iteration]),
      [['a', 'a', 2], ['a', 'b', 2], ['b', 'a', 1], ['m', 'h', 10]]
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

serialTest('M3-AC-01 break-it: an extra telemetry field does not create a group and a missing model, harness, iteration, or schemaVersion 1 is rejected', async () => {
  const dir = freshDir('ac01-fields');
  try {
    const extra = writeJsonl(path.join(dir, 'extra.jsonl'), [
      { schemaVersion: 1, model: 'alpha', harness: 'cursor', iteration: 1, note: 'keep' },
      { schemaVersion: 1, model: 'alpha', harness: 'cursor', iteration: 1, other: 1 },
    ]);
    const kept = await runDashboard(['benchmarks', '--telemetry', extra]);
    assertBenchmark(kept, parseJsonl(fs.readFileSync(extra, 'utf8')), 'extra fields');
    assert.equal(kept.json.groups.length, 1);
    assert.equal(kept.json.groups[0].rows[0].note, 'keep');
    assert.equal(kept.json.groups[0].rows[1].other, 1);

    const rejected = [
      [{ harness: 'cursor', iteration: 1, schemaVersion: 1 }],
      [{ model: '', harness: 'cursor', iteration: 1, schemaVersion: 1 }],
      [{ model: 'alpha', iteration: 1, schemaVersion: 1 }],
      [{ model: 'alpha', harness: '', iteration: 1, schemaVersion: 1 }],
      [{ model: 'alpha', harness: 'cursor', schemaVersion: 1 }],
      [{ model: 'alpha', harness: 'cursor', iteration: '1', schemaVersion: 1 }],
      [{ model: 'alpha', harness: 'cursor', iteration: 1.5, schemaVersion: 1 }],
      [{ model: 'alpha', harness: 'cursor', iteration: 1 }],
      [{ model: 'alpha', harness: 'cursor', iteration: 1, schemaVersion: 2 }],
    ];
    for (const rows of rejected) {
      const file = writeJsonl(path.join(dir, `bad-${rejected.indexOf(rows)}.jsonl`), rows);
      const run = await runDashboard(['benchmarks', '--telemetry', file]);
      assertBenchmarkError(run);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

serialTest('M3-AC-01 break-it: a missing telemetry file and a non-JSON line fail closed, and blank or CRLF lines do not create a group', async () => {
  const dir = freshDir('ac01-badfile');
  try {
    const missing = await runDashboard(['benchmarks', '--telemetry', path.join(dir, 'nope.jsonl')]);
    assert.equal(missing.code, 1);
    assertBenchmarkError(missing);

    const implicit = await runDashboard(['benchmarks'], { cwd: dir });
    assertBenchmarkError(implicit);

    const garbage = path.join(dir, 'garbage.jsonl');
    fs.writeFileSync(garbage, '{"schemaVersion":1,"model":"a","harness":"h","iteration":1}\nnot-json\n');
    const broken = await runDashboard(['benchmarks', '--telemetry', garbage]);
    assertBenchmarkError(broken);

    const blank = path.join(dir, 'blank.jsonl');
    const row = { schemaVersion: 1, model: 'alpha', harness: 'cursor', iteration: 1 };
    fs.writeFileSync(blank, `${JSON.stringify(row)}\r\n\r\n   \r\n${JSON.stringify({ ...row, mismatchPct: 1 })}`);
    const spaced = await runDashboard(['benchmarks', '--telemetry', blank]);
    assertBenchmark(spaced, [row, { ...row, mismatchPct: 1 }], 'blank lines and CRLF');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
