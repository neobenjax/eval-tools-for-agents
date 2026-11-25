/**
 * M3 Linear Delivery Board gap tests. Each test fails with ERR_ASSERTION until the viewer exists.
 * The board reads a local Node stub only. Nothing in this file opens a network connection.
 * Interface: SPEC.md section 7, "Interfaces pinned by the M3 acceptance tests".
 * Path compare is case-insensitive on win32 and exact elsewhere (samePath). No pixel bar.
 * Editing this file requires "Acceptance-test change rationale:" in the PR body.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  STAGES,
  freshDir,
  getUrl,
  readStubLog,
  runDashboard,
  startDashboard,
  stopChild,
  telemetryFixture,
  writeLinearStub,
} from '../m3-helpers.mjs';

const EMPTY_TEXT = 'Linear API key is not set';

function serveArgs(linearCli) {
  return ['serve', '--telemetry', telemetryFixture, '--port', '0', '--linear-cli', linearCli];
}

function assertUrl(session) {
  assert.equal(session.spawnError, null, session.spawnError || String(session.stderr).slice(0, 300));
  assert.equal(typeof session.url, 'string', `stdout=${String(session.stdout).slice(0, 300)}`);
  let url = null;
  try {
    url = new URL(session.url);
  } catch {
    url = null;
  }
  assert.ok(url, session.url);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/');
}

function assertStageOrder(html) {
  let previous = -1;
  for (const stage of STAGES) {
    const at = html.indexOf(`data-stage="${stage}"`);
    assert.ok(at > previous, `missing or unordered data-stage="${stage}"`);
    previous = at;
  }
  assert.equal(html.includes('data-stage="Done"'), false);
}

async function assertEmptyBoard(session, stubLog) {
  assertUrl(session);
  const page = await getUrl(session.url, '/');
  const board = await getUrl(session.url, '/board');
  const apiBoard = await getUrl(session.url, '/api/board');
  const apiBench = await getUrl(session.url, '/api/benchmarks');
  const cli = await runDashboard(['benchmarks', '--telemetry', telemetryFixture]);

  assert.equal(page.error, null, page.error);
  assert.equal(page.status, 200);
  assert.match(page.text, /data-view="benchmarks"/);
  assert.match(page.text, /data-primary="true"/);
  assert.match(page.text, /href="\/board"/);
  assert.equal(page.text.includes('data-view="board"'), false);
  for (const group of ['alpha|antigravity-cli|1', 'alpha|cursor|1', 'zeta|cursor|2']) {
    assert.ok(page.text.includes(`data-group="${group}"`), group);
  }
  const groupAt = ['alpha|antigravity-cli|1', 'alpha|cursor|1', 'zeta|cursor|2'].map((group) => page.text.indexOf(`data-group="${group}"`));
  assert.deepEqual(groupAt, [...groupAt].sort((a, b) => a - b));
  assert.ok(groupAt.every((at) => at >= 0));

  assert.equal(board.error, null, board.error);
  assert.equal(board.status, 200);
  assert.match(board.text, /data-view="board"/);
  assert.match(board.text, /data-primary="false"/);
  assert.match(board.text, /data-empty="true"/);
  assert.match(page.text, /<script src="\/client\.js"><\/script>/);
  assert.match(board.text, /<script src="\/client\.js"><\/script>/);
  assert.ok(board.text.includes(EMPTY_TEXT));
  assertStageOrder(board.text);
  assert.equal(board.text.includes('DEMO-1'), false);

  assert.equal(apiBoard.error, null, apiBoard.error);
  assert.equal(apiBoard.status, 200);
  assert.deepEqual(apiBoard.json, {
    view: 'board',
    primary: false,
    empty: true,
    stages: STAGES.map((name) => ({ name, issues: [] })),
  });

  assert.equal(cli.code, 0, cli.stderr || cli.spawnError);
  assert.equal(apiBench.error, null, apiBench.error);
  assert.equal(apiBench.status, 200);
  assert.deepEqual(apiBench.json, cli.json);
  assert.deepEqual(readStubLog(stubLog), []);
}

async function withServer(env, linearCli, fn) {
  const session = await startDashboard(serveArgs(linearCli), { env });
  try {
    await fn(session);
  } finally {
    await stopChild(session.child);
  }
}

serialTest('M3-AC-02: **Linear Delivery Board (secondary):** Renders live Linear stages (`Todo`, `In Progress`, `In Review`, `Approved`, `Rework`) fetched server-side or via local CLI. When `LINEAR_API_KEY` is absent, the board route remains present and renders an empty state while Eval Benchmarks stay the primary view.', async () => {
  const dir = freshDir('ac02-empty');
  try {
    const stub = writeLinearStub(dir, {
      issues: [{ id: 'DEMO-1', title: 'Should not render', stage: 'Todo' }],
    });
    await withServer({}, stub.file, async (session) => {
      assert.equal(session.spawnError, null, session.spawnError);
      await assertEmptyBoard(session, stub.log);
    });
    await withServer({ LINEAR_API_KEY: '' }, stub.file, async (session) => {
      await assertEmptyBoard(session, stub.log);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

serialTest('M3-AC-02 break-it: a configured key uses the local CLI, and a zero-issue result is not the no-key empty state', async () => {
  const dir = freshDir('ac02-live');
  const sentinel = 'm3-sentinel-key';
  try {
    const live = writeLinearStub(dir, {
      issues: [
        { id: 'DEMO-2', title: 'First queued', stage: 'Todo' },
        { id: 'DEMO-3', title: 'Second queued', stage: 'Todo' },
        { id: 'DEMO-1', title: 'Report schema', stage: 'In Review' },
      ],
    });
    await withServer({ LINEAR_API_KEY: sentinel }, live.file, async (session) => {
      assertUrl(session);
      const board = await getUrl(session.url, '/board');
      const api = await getUrl(session.url, '/api/board');
      assert.equal(board.error, null, board.error);
      assert.equal(board.status, 200);
      assert.match(board.text, /data-empty="false"/);
      assert.match(board.text, /<script src="\/client\.js"><\/script>/);
      assert.equal(board.text.includes(EMPTY_TEXT), false);
      assert.ok(board.text.includes('data-issue="DEMO-1"'));
      assert.ok(board.text.includes('Report schema'));
      assertStageOrder(board.text);
      assert.equal(api.error, null, api.error);
      assert.equal(api.status, 200);
      assert.equal(JSON.stringify(api.json).includes(sentinel), false);
      assert.equal(board.text.includes(sentinel), false);
      assert.deepEqual(api.json, {
        view: 'board',
        primary: false,
        empty: false,
        stages: [
          {
            name: 'Todo',
            issues: [
              { id: 'DEMO-2', title: 'First queued', stage: 'Todo' },
              { id: 'DEMO-3', title: 'Second queued', stage: 'Todo' },
            ],
          },
          { name: 'In Progress', issues: [] },
          { name: 'In Review', issues: [{ id: 'DEMO-1', title: 'Report schema', stage: 'In Review' }] },
          { name: 'Approved', issues: [] },
          { name: 'Rework', issues: [] },
        ],
      });
      assert.deepEqual(readStubLog(live.log), [{ invoked: true, hasKey: true }]);
    });

    const none = writeLinearStub(path.join(dir, 'none'), { issues: [] });
    await withServer({ LINEAR_API_KEY: sentinel }, none.file, async (session) => {
      assertUrl(session);
      const api = await getUrl(session.url, '/api/board');
      assert.equal(api.error, null, api.error);
      assert.equal(api.status, 200);
      assert.equal(api.json.empty, false);
      assert.deepEqual(api.json.stages, STAGES.map((name) => ({ name, issues: [] })));
      assert.equal(JSON.stringify(api.json).includes(sentinel), false);
      assert.deepEqual(readStubLog(none.log), [{ invoked: true, hasKey: true }]);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

serialTest('M3-AC-02 break-it: an unknown stage and a failing local CLI are rejected and are not the empty state', async () => {
  const dir = freshDir('ac02-bad');
  const sentinel = 'm3-sentinel-key';
  try {
    const cases = [
      writeLinearStub(path.join(dir, 'unknown'), {
        issues: [{ id: 'DEMO-9', title: 'Nope', stage: 'Done' }],
      }),
      writeLinearStub(path.join(dir, 'crash'), { exitCode: 2, body: '' }),
      writeLinearStub(path.join(dir, 'garbage'), { body: 'not-json' }),
    ];
    for (const stub of cases) {
      await withServer({ LINEAR_API_KEY: sentinel }, stub.file, async (session) => {
        assertUrl(session);
        for (const pathname of ['/api/board', '/board']) {
          const response = await getUrl(session.url, pathname);
          assert.equal(response.error, null, response.error);
          assert.equal(response.status, 400, pathname);
          assert.ok(response.json, pathname);
          assert.deepEqual(Object.keys(response.json).sort(), ['error', 'view']);
          assert.equal(response.json.view, 'board');
          assert.equal(typeof response.json.error.message, 'string');
          assert.ok(response.json.error.message.length > 0);
          assert.equal(Object.hasOwn(response.json, 'empty'), false);
          assert.equal(response.text.includes('data-empty="true"'), false);
          assert.equal(response.text.includes(EMPTY_TEXT), false);
          assert.equal(response.text.includes('data-stage="Done"'), false);
          assert.equal(response.text.includes(sentinel), false);
        }
        assert.ok(readStubLog(stub.log).length >= 1);
      });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

serialTest('M3-AC-02 break-it: Eval Benchmarks stay the primary view when the key is set', async () => {
  const dir = freshDir('ac02-primary');
  try {
    const stub = writeLinearStub(dir, {
      issues: [{ id: 'DEMO-1', title: 'Report schema', stage: 'Approved' }],
    });
    await withServer({ LINEAR_API_KEY: 'm3-sentinel-key' }, stub.file, async (session) => {
      assertUrl(session);
      const page = await getUrl(session.url, '/');
      assert.equal(page.error, null, page.error);
      assert.equal(page.status, 200);
      assert.match(page.text, /data-view="benchmarks"/);
      assert.match(page.text, /data-primary="true"/);
      assert.equal(page.text.includes('data-view="board"'), false);
      assert.ok(page.text.includes('data-group="alpha|cursor|1"'));
      const board = await getUrl(session.url, '/board');
      assert.equal(board.status, 200);
      assert.match(board.text, /data-primary="false"/);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
