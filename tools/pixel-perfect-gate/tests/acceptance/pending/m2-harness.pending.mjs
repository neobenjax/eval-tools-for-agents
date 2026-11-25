/**
 * SIDE-22 (M2.4) harness smoke check: tools/pixel-perfect-gate/scripts/harness-smoke.mjs.
 * CI cannot run Antigravity Desktop, Antigravity CLI, or Cursor. The checker is the scripted part:
 *   --harness <antigravity-desktop|antigravity-cli|cursor|all>
 *   --home <dir>             home directory whose skill destinations are listed
 *   --prompt-cmd <command>   optional; runs <command> through the shell once per harness with the
 *                            fixed prompt (scripts/harness-smoke.prompt.txt) on stdin and
 *                            PIXEL_GATE_HARNESS=<name> in the environment
 *   --recording <file>       optional evidence; never required
 * It prints one JSON object: { ok, results: [{ harness, skillListed, skillPath, promptPassed,
 * promptJson }], recording } and exits 0 only when ok is true.
 * A live recording or a model that stops short of passed:true is evidence, never a failure.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  HARNESSES,
  freshDir,
  installToTemp,
  realOrNull,
  runSmoke,
  skillDestination,
  skillDir,
  smokePath,
  smokePromptPath,
} from '../m2-helpers.mjs';

function fakeHarness(name) {
  const dir = freshDir(name, 'fake');
  const received = freshDir(name, 'received');
  const script = path.join(dir, 'fake-harness.cjs');
  fs.writeFileSync(
    script,
    [
      "const fs = require('fs');",
      "const harness = process.env.PIXEL_GATE_HARNESS || 'unknown';",
      "const mode = process.env.FAKE_MODE || 'good';",
      "const prompt = fs.readFileSync(0, 'utf8');",
      "fs.writeFileSync(process.env.FAKE_RECEIVED_DIR + '/' + harness + '.txt', prompt);",
      'const report = { schemaVersion: 1, passed: true, exitCode: 0, iteration: 1, durationMs: 5, error: null, findings: [],',
      "  gates: { gate1: { passed: true }, gate2: { passed: true }, gate3: { passed: true, skipped: true, reason: 'not run' } },",
      '  artifacts: null, telemetry: null };',
      "if (mode === 'failed-pass') {",
      '  report.passed = false; report.exitCode = 1;',
      "  report.findings = [{ id: 'gate1.console-error.1', gate: 'gate1', severity: 'fail', selector: '', box: null, text: 'console error' }];",
      '}',
      "if (mode === 'missing-key') delete report.gates;",
      "const json = JSON.stringify(report);",
      "process.stdout.write(mode === 'prose' ? 'Here is the report:\\n' + json + '\\n' : json + '\\n');",
      '',
    ].join('\n')
  );
  return {
    received,
    command: `"${process.execPath}" "${script}"`,
    env: (mode) => ({ FAKE_MODE: mode, FAKE_RECEIVED_DIR: received }),
  };
}

async function installedHome(name) {
  const { run, home } = await installToTemp(name);
  assert.equal(run.code, 0, `installer must exit 0 before the harness check (spawnError=${run.spawnError})`);
  return home;
}

serialTest('M2-AC-35: All three required v1 harnesses (**Antigravity Desktop, Antigravity CLI, and Cursor**) list the installed `pixel-perfect-gate` skill (no skip path).', async () => {
  assert.ok(fs.existsSync(smokePath), 'tools/pixel-perfect-gate/scripts/harness-smoke.mjs must exist');
  const home = await installedHome('ac35');
  const all = await runSmoke(['--harness', 'all', '--home', home]);
  assert.equal(all.code, 0, `all three harnesses list the skill (stderr=${all.stderr.slice(0, 200)})`);
  assert.ok(all.json && all.json.ok === true && Array.isArray(all.json.results), 'one JSON object { ok, results }');
  assert.deepEqual(all.json.results.map((r) => r.harness).sort(), [...HARNESSES].sort(), 'Antigravity Desktop, Antigravity CLI, and Cursor are all checked');
  for (const result of all.json.results) {
    assert.equal(result.skillListed, true, `${result.harness} lists the pixel-perfect-gate skill`);
    assert.equal(realOrNull(result.skillPath), realOrNull(skillDir), `${result.harness} lists the skill from this package`);
  }
  for (const harness of HARNESSES) {
    const one = await runSmoke(['--harness', harness, '--home', home]);
    assert.equal(one.code, 0, `${harness} alone passes`);
    assert.equal(one.json?.results?.length, 1, `${harness} alone checks one harness`);
  }
});

serialTest('M2-AC-35 break-it: a fresh home fails and no flag or environment variable skips the check', async () => {
  assert.ok(fs.existsSync(smokePath), 'the checker must exist');
  const empty = freshDir('ac35-empty', 'home');
  const plain = await runSmoke(['--harness', 'all', '--home', empty]);
  assert.equal(plain.code, 1, 'no installed skill is a failure');
  assert.equal(plain.json?.ok, false);
  assert.ok(plain.json.results.length === 3 && plain.json.results.every((r) => r.skillListed === false), 'each harness reports the skill as not listed');
  const skipped = await runSmoke(['--harness', 'all', '--home', empty], {
    env: { PIXEL_GATE_SKIP_HARNESS: '1', SKIP_HARNESS_SMOKE: '1', CI_SKIP_HARNESS: '1' },
  });
  assert.equal(skipped.code, 1, 'an environment variable cannot turn the check into a pass');
  assert.equal(skipped.json?.ok, false);
  const flagged = await runSmoke(['--harness', 'all', '--home', empty, '--skip', '--allow-missing']);
  assert.notEqual(flagged.code, 0, 'a skip flag cannot turn the check into a pass');
  if (flagged.json?.results) {
    assert.ok(flagged.json.results.every((r) => r.skillListed === false), 'missing skills stay unlisted');
  }
});

serialTest('M2-AC-35 break-it: one missing harness fails the whole run and is named', async () => {
  const home = await installedHome('ac35-missing');
  fs.rmSync(skillDestination(home, 'cursor'), { recursive: true, force: true });
  const result = await runSmoke(['--harness', 'all', '--home', home]);
  assert.equal(result.code, 1, 'a missing Cursor skill fails the run');
  assert.equal(result.json?.ok, false);
  const byName = Object.fromEntries((result.json?.results || []).map((r) => [r.harness, r.skillListed]));
  assert.deepEqual(byName, { 'antigravity-desktop': true, 'antigravity-cli': true, cursor: false }, 'only cursor is reported as missing');
});

serialTest('M2-AC-35 break-it: an unknown harness name is rejected', async () => {
  const home = await installedHome('ac35-unknown');
  const result = await runSmoke(['--harness', 'vscode', '--home', home]);
  assert.equal(result.code, 1, 'an unknown harness is not silently accepted');
  assert.equal(result.json?.ok, false);
});

serialTest('M2-AC-36: A scripted prompt (fixed text, no requirement that a model invent a fix) returns stdout that parses as section 6 JSON in each of the three harnesses.', async () => {
  assert.ok(fs.existsSync(smokePromptPath), 'the fixed prompt lives in scripts/harness-smoke.prompt.txt');
  const prompt = fs.readFileSync(smokePromptPath, 'utf8');
  assert.ok(prompt.length > 20 && /pixel-gate/.test(prompt), 'the fixed prompt tells the harness to run pixel-gate');
  const home = await installedHome('ac36');
  const fake = fakeHarness('ac36');
  for (const harness of HARNESSES) {
    const result = await runSmoke(['--harness', harness, '--home', home, '--prompt-cmd', fake.command], { env: fake.env('good') });
    assert.equal(result.code, 0, `${harness}: the scripted prompt returns section 6 JSON (stderr=${result.stderr.slice(0, 200)})`);
    const entry = result.json?.results?.[0];
    assert.ok(entry, `${harness}: a result entry exists`);
    assert.equal(entry.promptPassed, true, `${harness}: promptPassed`);
    assert.equal(entry.promptJson?.schemaVersion, 1, `${harness}: the parsed stdout is the section 6 object`);
    assert.ok(fs.existsSync(path.join(fake.received, `${harness}.txt`)), `${harness}: the fake harness was run`);
    assert.equal(
      fs.readFileSync(path.join(fake.received, `${harness}.txt`), 'utf8'),
      prompt,
      `${harness}: the harness received the fixed prompt byte for byte on stdin`
    );
  }
});

serialTest('M2-AC-36 break-it: stdout with prose around the JSON fails', async () => {
  const home = await installedHome('ac36-prose');
  const fake = fakeHarness('ac36-prose');
  const result = await runSmoke(['--harness', 'cursor', '--home', home, '--prompt-cmd', fake.command], { env: fake.env('prose') });
  assert.equal(result.code, 1, 'text before the JSON object breaks the one-object contract');
  assert.equal(result.json?.ok, false);
  assert.equal(result.json?.results?.[0]?.promptPassed, false);
});

serialTest('M2-AC-36 break-it: a report missing a section 6 key fails', async () => {
  const home = await installedHome('ac36-key');
  const fake = fakeHarness('ac36-key');
  const result = await runSmoke(['--harness', 'cursor', '--home', home, '--prompt-cmd', fake.command], { env: fake.env('missing-key') });
  assert.equal(result.code, 1, 'a report without gates is not a section 6 object');
  assert.equal(result.json?.ok, false);
  assert.equal(result.json?.results?.[0]?.promptPassed, false);
});

serialTest('M2-AC-37: A recording of a live loop-until-green session may be attached to the PR. CI does not fail when that recording is absent or when the model stops short of `passed: true`.', async () => {
  const home = await installedHome('ac37');
  const fake = fakeHarness('ac37');
  const stopped = await runSmoke(['--harness', 'all', '--home', home, '--prompt-cmd', fake.command], { env: fake.env('failed-pass') });
  assert.equal(stopped.code, 0, 'a model that stops short of passed:true does not fail the check');
  assert.equal(stopped.json?.ok, true);
  assert.equal(stopped.json?.recording, null, 'an absent recording is null and not an error');
  for (const entry of stopped.json?.results || []) {
    assert.equal(entry.promptPassed, true, `${entry.harness}: valid section 6 JSON is the bar`);
    assert.equal(entry.promptJson?.passed, false, `${entry.harness}: the report says passed:false and that is allowed`);
  }
  assert.equal((stopped.json?.results || []).length, 3);
  const missing = path.join(freshDir('ac37', 'rec'), 'no-such-recording.mp4');
  const absent = await runSmoke(['--harness', 'all', '--home', home, '--recording', missing]);
  assert.equal(absent.code, 0, 'a recording path that does not exist is treated as absent');
  assert.equal(absent.json?.recording, null);
});

serialTest('M2-AC-37 break-it: an attached recording is echoed and still never required', async () => {
  const home = await installedHome('ac37-rec');
  const recording = path.join(freshDir('ac37-rec', 'rec'), 'session.mp4');
  fs.writeFileSync(recording, 'not really a video');
  const result = await runSmoke(['--harness', 'all', '--home', home, '--recording', recording]);
  assert.equal(result.code, 0);
  assert.equal(realOrNull(String(result.json?.recording)), realOrNull(recording), 'the recording path is reported');
  const without = await runSmoke(['--harness', 'all', '--home', home]);
  assert.equal(without.code, 0, 'the same run without a recording also passes');
});
