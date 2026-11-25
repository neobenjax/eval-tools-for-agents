/**
 * M3 client-bundle secret gap tests. Each test fails with ERR_ASSERTION until the viewer exists.
 * The sentinel key is a fixture value, never a real credential.
 * Interface: SPEC.md section 7, "Interfaces pinned by the M3 acceptance tests".
 * samePath is case-insensitive on win32 only. No pixel bar.
 * Editing this file requires "Acceptance-test change rationale:" in the PR body.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  dashboardClient,
  freshDir,
  getUrl,
  readStubLog,
  runDashboard,
  samePath,
  startDashboard,
  stopChild,
  telemetryFixture,
  writeLinearStub,
} from '../m3-helpers.mjs';

const SENTINEL = 'm3-sentinel-key';

function assertNoSecret(text, label) {
  assert.equal(text.includes('LINEAR_API_KEY'), false, label);
  assert.equal(text.includes(SENTINEL), false, label);
}

serialTest('M3-AC-03: `LINEAR_API_KEY` is read only on a server or in a local CLI. A check verifies it is absent from any client-side bundle.', async () => {
  const checked = await runDashboard(['check-client']);
  assert.equal(checked.spawnError, null, checked.spawnError);
  assert.equal(checked.code, 0, String(checked.stderr).slice(0, 300));
  assert.equal(checked.json && checked.json.ok, true);
  assert.ok(samePath(checked.json.root, dashboardClient));
  assert.ok(checked.json.files.includes('client.js'));
  assert.equal(fs.existsSync(path.join(dashboardClient, 'client.js')), true);

  const dir = freshDir('ac03-server');
  const stub = writeLinearStub(dir, {
    issues: [{ id: 'DEMO-1', title: 'Report schema', stage: 'In Review' }],
  });
  const session = await startDashboard(
    ['serve', '--telemetry', telemetryFixture, '--port', '0', '--linear-cli', stub.file],
    { env: { LINEAR_API_KEY: SENTINEL } }
  );
  try {
    assert.equal(session.spawnError, null, session.spawnError);
    assert.equal(typeof session.url, 'string');
    const page = await getUrl(session.url, '/');
    const board = await getUrl(session.url, '/board');
    const client = await getUrl(session.url, '/client.js');
    assert.equal(page.error, null, page.error);
    assert.equal(board.error, null, board.error);
    assert.equal(client.error, null, client.error);
    assert.equal(page.status, 200);
    assert.equal(board.status, 200);
    assert.equal(client.status, 200);
    assert.match(page.text, /<script src="\/client\.js"><\/script>/);
    assert.match(board.text, /<script src="\/client\.js"><\/script>/);
    assertNoSecret(page.text, '/');
    assertNoSecret(board.text, '/board');
    assertNoSecret(client.text, '/client.js');
    assert.deepEqual(readStubLog(stub.log), [{ invoked: true, hasKey: true }]);
  } finally {
    await stopChild(session.child);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

serialTest('M3-AC-03 break-it: a client file containing LINEAR_API_KEY fails the check and names that file', async () => {
  const root = freshDir('ac03-dirty');
  try {
    fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'clean.js'), 'export const view = "benchmarks";\n');
    fs.writeFileSync(path.join(root, 'nested', 'page.js'), '/* LINEAR_API_KEY must not ship */\n');
    const run = await runDashboard(['check-client', '--root', root]);
    assert.equal(run.spawnError, null, run.spawnError);
    assert.equal(run.code, 1);
    assert.equal(run.json && run.json.ok, false);
    assert.ok(samePath(run.json.root, root));
    assert.deepEqual(run.json.files, ['nested/page.js']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

serialTest('M3-AC-03 break-it: a clean client root passes, a token outside that root does not fail, and a missing root fails', async () => {
  const root = freshDir('ac03-clean');
  const outside = freshDir('ac03-outside');
  const missingParent = freshDir('ac03-missing');
  const missing = path.join(missingParent, 'no-such-client');
  try {
    fs.writeFileSync(path.join(root, 'app.css'), '.board{color:#111}\n');
    fs.writeFileSync(path.join(root, 'client.js'), 'export const view = "benchmarks";\n');
    fs.writeFileSync(path.join(outside, 'server.mjs'), 'const key = process.env.LINEAR_API_KEY;\n');
    const clean = await runDashboard(['check-client', '--root', root], { cwd: outside });
    assert.equal(clean.spawnError, null, clean.spawnError);
    assert.equal(clean.code, 0, String(clean.stderr).slice(0, 300));
    assert.equal(clean.json && clean.json.ok, true);
    assert.ok(samePath(clean.json.root, root));
    assert.deepEqual(clean.json.files, ['app.css', 'client.js']);

    const decoy = freshDir('ac03-decoy');
    try {
      const planted = path.join(decoy, 'apps', 'dashboard', 'client');
      fs.mkdirSync(planted, { recursive: true });
      fs.writeFileSync(path.join(planted, 'client.js'), 'LINEAR_API_KEY\n');
      const defaults = await runDashboard(['check-client'], { cwd: decoy });
      assert.equal(defaults.code, 0, String(defaults.stderr).slice(0, 300));
      assert.ok(samePath(defaults.json.root, dashboardClient));
      assert.equal(defaults.json.files.includes('nested/page.js'), false);
    } finally {
      fs.rmSync(decoy, { recursive: true, force: true });
    }

    const gone = await runDashboard(['check-client', '--root', missing]);
    assert.equal(gone.spawnError, null, gone.spawnError);
    assert.equal(gone.code, 1);
    assert.equal(gone.json && gone.json.ok, false);
    assert.deepEqual(gone.json.files, []);
    assert.equal(typeof gone.json.error.message, 'string');
    assert.ok(gone.json.error.message.length > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
    fs.rmSync(missingParent, { recursive: true, force: true });
  }
});

serialTest('M3-AC-03 break-it: the server key value is absent from the client script and both pages', async () => {
  const dir = freshDir('ac03-http');
  const stub = writeLinearStub(dir, { issues: [] });
  const session = await startDashboard(
    ['serve', '--telemetry', telemetryFixture, '--port', '0', '--linear-cli', stub.file],
    { env: { LINEAR_API_KEY: SENTINEL } }
  );
  try {
    assert.equal(typeof session.url, 'string', session.spawnError || session.stdout);
    for (const pathname of ['/', '/board', '/client.js']) {
      const response = await getUrl(session.url, pathname);
      assert.equal(response.error, null, response.error);
      assert.equal(response.status, 200, pathname);
      assertNoSecret(response.text, pathname);
    }
  } finally {
    await stopChild(session.child);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
