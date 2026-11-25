/**
 * M2b.5 WordPress target. The playground and wp-env commands are intercepted with a
 * PATH stub so the tests never use the network. Gap tests fail with ERR_ASSERTION.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  BUILD_TYPES,
  blueprintPath,
  compare,
  copyPrototype,
  filesContaining,
  findingIds,
  findings,
  freshDir,
  npxStub,
  pixelSourceOfTruth,
  pngSize,
  writeJson,
} from '../m2b-helpers.mjs';

const VIEW = [{ name: 'desktop', width: 400, height: 300 }];
const SENTINEL = 'm2b-app-password-sentinel';

function wpHtml(mode) {
  const script = mode === 'drop' ? '' : '<script>document.getElementById("go").addEventListener("click", () => { document.getElementById("out").textContent = "done"; });</script>';
  return `<!doctype html><html><body style="margin:0">
    <div id="wpadminbar" style="height:32px;background:#1d2327">admin</div>
    <header>Theme header</header>
    <main><button id="go" type="button">Subscribe</button><p id="out">idle</p></main>
    ${script}
  </body></html>`;
}

function wpRepo(name, { runtime, buildType, structureCheck, selector, html, raw, blueprint, maxDiff = 100 }) {
  const repo = freshDir('m2b', name);
  const htmlFile = path.join(repo, 'page.html');
  fs.writeFileSync(htmlFile, html || wpHtml('keep'));
  const stub = npxStub(repo);
  const reference = copyPrototype(repo, 'prototype.html');
  writeJson(path.join(repo, 'pixel-gate.config.json'), {
    viewports: VIEW,
    dpr: 1,
    maxDiff,
    scenarios: 'scenarios.json',
    routes: [{
      id: 'home',
      path: '/',
      reference: { kind: 'html-file', source: reference, ...(selector ? { selector } : {}) },
    }],
    target: {
      kind: 'wordpress',
      ...(selector ? { selector } : {}),
      wordpress: {
        ...(runtime ? { runtime } : {}),
        ...(buildType ? { buildType } : {}),
        ...(structureCheck ? { structureCheck } : {}),
        blueprint: blueprint || blueprintPath,
        url: 'http://127.0.0.1:9',
        pageId: 1,
      },
    },
  });
  writeJson(path.join(repo, 'scenarios.json'), {
    scenarios: [{ id: 'subscribe', steps: [{ action: 'goto', url: '/' }, { action: 'click', locator: { method: 'getByRole', role: 'button', name: 'Subscribe' } }] }],
  });
  return {
    repo,
    stub,
    env: { ...stub.env, M2B_WP_HTML: htmlFile, M2B_WP_RAW: raw || '' },
  };
}

serialTest('M2b-AC-25: With no `runtime` set, `playground` is used. On `windows-latest` and `ubuntu-latest` it starts WordPress from a committed blueprint without Docker and reaches REST `GET /wp-json/`.', async () => {
  const { repo, stub, env } = wpRepo('ac25', {});
  const result = await compare(repo, [], env);
  const launch = stub.entries().find((entry) => entry.argv && entry.argv.includes('@wp-playground/cli'));
  assert.ok(launch, 'playground is the default runtime');
  assert.ok(launch.argv.includes('server') && launch.argv.includes('--blueprint') && launch.argv.includes('--port'));
  assert.equal(launch.argv.some((arg) => /docker/i.test(String(arg))), false);
  const blueprintArg = launch.argv[launch.argv.indexOf('--blueprint') + 1];
  assert.equal(fs.readFileSync(blueprintArg, 'utf8').includes('"landingPage"'), true);
  assert.ok(stub.entries().some((entry) => entry.url && entry.url.startsWith('/wp-json')));
  assert.equal(result.code === 0 || result.code === 1, true);
  assert.equal(result.json && result.json.loop && result.json.loop.stopReason === 'blocked', false);
});

serialTest('M2b-AC-25 break-it: an explicit runtime of existing does not spawn playground', async () => {
  const { repo, stub, env } = wpRepo('ac25-existing', { runtime: 'existing' });
  const serverRoot = freshDir('m2b', 'ac25-site');
  fs.writeFileSync(path.join(serverRoot, 'index.html'), wpHtml('keep').replace('id="wpadminbar"', 'id="not-admin"'));
  const { startFixtureServer } = await import('../m2-helpers.mjs');
  const server = await startFixtureServer(serverRoot);
  try {
    const config = JSON.parse(fs.readFileSync(path.join(repo, 'pixel-gate.config.json'), 'utf8'));
    config.target.wordpress.url = server.baseUrl;
    config.routes[0].path = '/index.html';
    delete config.scenarios;
    writeJson(path.join(repo, 'pixel-gate.config.json'), config);
    const result = await compare(repo, [], env);
    assert.equal(stub.entries().some((entry) => entry.argv && entry.argv.includes('@wp-playground/cli')), false);
    assert.equal(result.json && result.json.loop && result.json.loop.stopReason, 'passed');
  } finally {
    await server.close();
  }
});

serialTest('M2b-AC-26: `runtime: "wp-env"` and `runtime: "existing"` (a local or remote site URL) are accepted. An unreachable site gives a `blocked` stop reason with a structured `error`, not a gate failure.', async () => {
  const envRun = wpRepo('ac26-env', { runtime: 'wp-env' });
  const accepted = await compare(envRun.repo, [], envRun.env);
  assert.ok(envRun.stub.entries().some((entry) => entry.argv && entry.argv.includes('@wordpress/env')));
  assert.notEqual(accepted.json && accepted.json.loop && accepted.json.loop.stopReason, 'blocked');

  const dead = wpRepo('ac26-dead', { runtime: 'existing' });
  const blocked = await compare(dead.repo, [], dead.env);
  assert.equal(blocked.code, 1);
  assert.equal(blocked.json && blocked.json.loop && blocked.json.loop.stopReason, 'blocked');
  assert.equal(typeof (blocked.json && blocked.json.error && blocked.json.error.message), 'string');
  assert.equal(findings(blocked.json).some((f) => f.severity === 'fail'), false);
});

serialTest('M2b-AC-26 break-it: a reachable existing URL is not a blocked error', async () => {
  const { startFixtureServer } = await import('../m2-helpers.mjs');
  const root = freshDir('m2b', 'ac26-live');
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><body><main>live</main></body></html>');
  const server = await startFixtureServer(root);
  try {
    const run = wpRepo('ac26-ok', { runtime: 'existing' });
    const config = JSON.parse(fs.readFileSync(path.join(run.repo, 'pixel-gate.config.json'), 'utf8'));
    config.target.wordpress.url = server.baseUrl;
    config.routes[0].path = '/index.html';
    config.routes[0].referenceRequired = false;
    delete config.routes[0].reference;
    delete config.scenarios;
    writeJson(path.join(run.repo, 'pixel-gate.config.json'), config);
    const result = await compare(run.repo, [], run.env);
    assert.equal(result.json && result.json.loop && result.json.loop.stopReason === 'blocked', false);
    assert.equal(result.code, 0);
  } finally {
    await server.close();
  }
});

serialTest('M2b-AC-27: `buildType` accepts `block-theme`, `classic-theme`, `hybrid-theme`, `patterns`, `custom-blocks`, `page-builder`, and `any` (default). The accuracy rule is the same for every build type: Gate 2 tier A on the browser output, plus SIDE-29 parity.', async () => {
  const bits = [];
  for (const buildType of BUILD_TYPES) {
    const run = wpRepo(`ac27-${buildType}`, { buildType });
    const result = await compare(run.repo, [], run.env);
    assert.notEqual(result.json && result.json.loop && result.json.loop.stopReason, 'blocked', `${buildType} is accepted`);
    const check = result.json && result.json.gates && result.json.gates.gate2 && result.json.gates.gate2.checks && result.json.gates.gate2.checks[0];
    assert.ok(check, `${buildType} reports a Gate 2 check`);
    assert.equal(check.tier, 'A');
    bits.push(`${check.passed}:${check.mismatchPct}`);
  }
  assert.equal(new Set(bits).size, 1, `every build type shares the accuracy result, got ${bits.join(' ')}`);
  const rejected = wpRepo('ac27-bad', { buildType: 'blog' });
  const bad = await compare(rejected.repo, [], rejected.env);
  assert.equal(bad.code, 1);
  assert.match((bad.json && bad.json.error && bad.json.error.message) || '', /buildType/);
  assert.equal(bad.json.loop.stopReason, 'blocked');
});

serialTest('M2b-AC-27 break-it: a buildType outside the allowed set is a config error', async () => {
  const run = wpRepo('ac27-nope', { buildType: 'classic' });
  const result = await compare(run.repo, [], run.env);
  assert.equal(result.code, 1);
  assert.match((result.json && result.json.error && result.json.error.message) || '', /buildType/);
  assert.equal(run.stub.entries().length, 0, 'an invalid buildType does not launch WordPress');
});

serialTest('M2b-AC-28: A classic-theme fixture (PHP template, no blocks) and a block-theme fixture that both render the prototype pass with the default config. No structure finding appears, because `structureCheck` defaults to `off`.', async () => {
  for (const buildType of ['classic-theme', 'block-theme']) {
    const run = wpRepo(`ac28-${buildType}`, { buildType, raw: '<!-- wp:html --><p>raw</p><!-- /wp:html -->' });
    const result = await compare(run.repo, [], run.env);
    assert.equal(result.code, 0, `${buildType} passes on the rendered page`);
    assert.equal(findingIds(result.json).some((id) => id.startsWith('gate1.wp-')), false, `${buildType} has no structure finding`);
  }
});

serialTest('M2b-AC-28 break-it: a core/html block produces no structure finding while structureCheck is off', async () => {
  const run = wpRepo('ac28-off', { buildType: 'block-theme', raw: '<!-- wp:html --><p>only</p><!-- /wp:html -->' });
  const result = await compare(run.repo, [], run.env);
  assert.equal(result.code, 0);
  assert.equal(findingIds(result.json).includes('gate1.wp-freeform-html.1'), false);
  assert.equal(result.json.gates.gate1.structureCheck, 'off');
});

serialTest('M2b-AC-29: With `structureCheck: "advisory"`, a page whose whole content is one `core/html` block reports `gate1.wp-freeform-html.1` as `info`, and a block whose saved markup does not validate reports `gate1.wp-invalid-block.<n>` as `info`. Neither changes `passed`; a test asserts exit `0` when the browser output matches.', async () => {
  const raw = '<!-- wp:html --><p>pasted</p><!-- /wp:html --><!-- wp:paragraph --><p>bad<!-- /wp:paragraph -->';
  const run = wpRepo('ac29', { buildType: 'block-theme', structureCheck: 'advisory', raw });
  const result = await compare(run.repo, [], run.env);
  const freeform = findings(result.json).find((f) => f.id === 'gate1.wp-freeform-html.1');
  const invalid = findings(result.json).find((f) => f.id === 'gate1.wp-invalid-block.1');
  assert.ok(freeform, `expected gate1.wp-freeform-html.1, got ${findingIds(result.json).join(', ')}`);
  assert.equal(freeform.severity, 'info');
  assert.ok(invalid, 'expected gate1.wp-invalid-block.1');
  assert.equal(invalid.severity, 'info');
  assert.equal(result.code, 0);
  assert.equal(result.json.passed, true);
});

serialTest('M2b-AC-30: A converted fixture page matches its `html-file` prototype within the tier A rule, comparing `target.selector` (default `main`, configurable) against `reference.selector`. Setting `target.selector` to `body` compares the whole page.', async () => {
  const sharedMain = '<main style="padding:8px;width:300px;height:120px;background:#fff;color:#111"><button id="go" type="button">Subscribe</button><p id="out">idle</p></main>';
  const refHtml = `<!doctype html><html><body style="margin:0"><header style="height:40px;background:#eee">Proto</header>${sharedMain}</body></html>`;
  const wpBody = `<!doctype html><html><body style="margin:0"><div id="wpadminbar" style="height:32px;background:#1d2327">admin</div><header style="height:40px;background:#ccc">Theme</header>${sharedMain}<script>document.getElementById("go").addEventListener("click",()=>{document.getElementById("out").textContent="done";});</script></body></html>`;
  const main = wpRepo('ac30-main', { selector: 'main', maxDiff: 0.5, html: wpBody });
  const body = wpRepo('ac30-body', { selector: 'body', maxDiff: 0.5, html: wpBody });
  for (const r of [main, body]) {
    const cfgPath = path.join(r.repo, 'pixel-gate.config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    fs.writeFileSync(cfg.routes[0].reference.source, refHtml);
    delete cfg.scenarios;
    writeJson(cfgPath, cfg);
  }
  const mainRun = await compare(main.repo, [], main.env);
  const bodyRun = await compare(body.repo, [], body.env);
  const mainCheck = mainRun.json && mainRun.json.gates && mainRun.json.gates.gate2 && mainRun.json.gates.gate2.checks && mainRun.json.gates.gate2.checks[0];
  const bodyCheck = bodyRun.json && bodyRun.json.gates && bodyRun.json.gates.gate2 && bodyRun.json.gates.gate2.checks && bodyRun.json.gates.gate2.checks[0];
  assert.ok(mainCheck && bodyCheck, 'both selectors report a check');
  assert.equal(mainCheck.selector, 'main');
  assert.equal(bodyCheck.selector, 'body');
  if (pixelSourceOfTruth) {
    assert.equal(mainRun.code, 0, 'the default main region matches the prototype main');
    assert.equal(bodyRun.code, 1, 'body includes theme chrome the prototype lacks');
  }
});

serialTest('M2b-AC-31: The front-end capture contains no `#wpadminbar` (asserted on the DOM and the PNG height).', async () => {
  const run = wpRepo('ac31', {});
  const result = await compare(run.repo, [], run.env);
  const htmlPath = result.json && result.json.artifacts && result.json.artifacts.captureHtml;
  assert.equal(typeof htmlPath, 'string');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.equal(html.includes('wpadminbar'), false);
  const check = result.json.gates.gate2.checks[0];
  const size = pngSize(check.actual);
  assert.ok(size, 'the capture png is readable');
  assert.equal(size.height, 300, 'the png height is the viewport, with no 32px admin bar');
});

serialTest('M2b-AC-31 break-it: a logged-in capture still has no wpadminbar in the DOM or the PNG height', async () => {
  const run = wpRepo('ac31-in', {});
  const config = JSON.parse(fs.readFileSync(path.join(run.repo, 'pixel-gate.config.json'), 'utf8'));
  config.target.wordpress.loggedIn = true;
  writeJson(path.join(run.repo, 'pixel-gate.config.json'), config);
  const result = await compare(run.repo, [], run.env);
  const htmlPath = result.json && result.json.artifacts && result.json.artifacts.captureHtml;
  assert.equal(typeof htmlPath, 'string');
  assert.equal(fs.readFileSync(htmlPath, 'utf8').includes('wpadminbar'), false);
  const actual = result.json.gates && result.json.gates.gate2 && result.json.gates.gate2.checks && result.json.gates.gate2.checks[0] && result.json.gates.gate2.checks[0].actual;
  assert.equal(pngSize(actual) && pngSize(actual).height, 300);
});

serialTest('M2b-AC-32: SIDE-29 parity passes on the converted page only when the prototype\'s interaction is re-implemented in a way WordPress keeps (enqueued script, block `viewScript`, or page-builder widget); with the script dropped, parity fails.', async () => {
  for (const mode of ['keep', 'viewScript', 'widget']) {
    const run = wpRepo(`ac32-${mode}`, { html: wpHtml('keep'), buildType: mode === 'widget' ? 'page-builder' : 'block-theme' });
    const result = await compare(run.repo, [], run.env);
    assert.equal(result.code, 0, `${mode} keeps the interaction`);
    assert.equal(findingIds(result.json).some((id) => id.startsWith('gate3.parity')), false);
  }
  const dropped = wpRepo('ac32-drop', { html: wpHtml('drop') });
  const fail = await compare(dropped.repo, [], dropped.env);
  assert.equal(fail.code, 1);
  assert.ok(findingIds(fail.json).some((id) => id.startsWith('gate3.parity.subscribe.')));
});

serialTest('M2b-AC-33: Credentials (application password) are read from the environment only and never appear in stdout, findings, or artifacts.', async () => {
  const http = await import('node:http');
  const auths = [];
  const server = http.createServer((req, res) => {
    auths.push(req.headers.authorization || '');
    if ((req.url || '').startsWith('/wp-json/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: { raw: '<!-- wp:html --><p>x</p><!-- /wp:html -->' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(wpHtml('keep'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const run = wpRepo('ac33', { runtime: 'existing', structureCheck: 'advisory', buildType: 'block-theme', raw: '<!-- wp:html --><p>x</p><!-- /wp:html -->' });
  try {
    const config = JSON.parse(fs.readFileSync(path.join(run.repo, 'pixel-gate.config.json'), 'utf8'));
    config.target.wordpress.url = `http://127.0.0.1:${server.address().port}/`;
    writeJson(path.join(run.repo, 'pixel-gate.config.json'), config);
    const result = await compare(run.repo, [], {
      ...run.env,
      WORDPRESS_USERNAME: 'm2b-user',
      WORDPRESS_APP_PASSWORD: SENTINEL,
    });
    assert.ok(
      auths.some(
        (value) =>
          value.includes(SENTINEL) ||
          (value.startsWith('Basic ') && Buffer.from(value.slice(6), 'base64').toString('utf8').includes(SENTINEL))
      ),
      'the environment password is sent to the site'
    );
    assert.equal(result.stdout.includes(SENTINEL), false);
    assert.equal(JSON.stringify(findings(result.json)).includes(SENTINEL), false);
    assert.deepEqual(filesContaining(path.join(run.repo, '.visual-eval'), SENTINEL), []);
    assert.equal(result.json && result.json.gates && result.json.gates.gate1 && result.json.gates.gate1.wordpress && result.json.gates.gate1.wordpress.credentialSource, 'environment');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

serialTest('M2b-AC-33 break-it: a password placed in the config is rejected and is not forwarded', async () => {
  const run = wpRepo('ac33-cfg', { runtime: 'existing', structureCheck: 'advisory' });
  const config = JSON.parse(fs.readFileSync(path.join(run.repo, 'pixel-gate.config.json'), 'utf8'));
  config.target.wordpress.password = SENTINEL;
  writeJson(path.join(run.repo, 'pixel-gate.config.json'), config);
  const result = await compare(run.repo, [], run.env);
  assert.equal(result.code, 1);
  assert.match((result.json && result.json.error && result.json.error.message) || '', /WORDPRESS_APP_PASSWORD/);
  assert.equal(JSON.stringify(run.stub.entries()).includes(SENTINEL), false);
  assert.equal(result.stdout.includes(SENTINEL), false);
});
