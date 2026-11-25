/**
 * Reference bundle capture & verification (SPEC.md §12.2, §12.4, §12.8; M2b.1 / SIDE-28).
 * Freezes `html-file`, `url`, `screenshot`, and `design-file` references into
 * `.visual-eval/references/<route-id>/<viewport-name>/` bundles.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { PNG } from 'pngjs';
import { startStaticServer } from './targets.mjs';
import { runScenario } from './scenario-runner.mjs';
import { cropPngFile } from './visual-diff.mjs';

export const COPYRIGHT_DISCLAIMER =
  "Copying a website's design, text, images, or code can infringe copyright, trademark, or the site's terms of service. A visual or functional copy does not give you any rights to the original. Only publish a copy you own, have a license for, or have permission to make. This tool does not check rights for you.";

export const STYLE_PROPS = [
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'padding',
  'margin',
  'gap',
  'border-radius',
];

export function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

export function getBundleDir(cwd, routeId, viewportName) {
  return path.join(cwd, '.visual-eval', 'references', routeId, viewportName);
}

export function readBundleManifest(bundleDir) {
  const manifestPath = path.join(bundleDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

export function verifyBundleIntegrity(bundleDir, routeId, viewportName) {
  const manifest = readBundleManifest(bundleDir);
  const pngPath = path.join(bundleDir, `${viewportName}.png`);
  if (!manifest || !fs.existsSync(pngPath)) {
    return { ok: false, missing: true, manifest: null, pngPath };
  }
  const actualHash = sha256File(pngPath);
  if (manifest.sha256?.png && actualHash !== manifest.sha256.png) {
    return {
      ok: false,
      tampered: true,
      manifest,
      pngPath,
      finding: {
        id: `gate2.reference-tampered.${routeId}.${viewportName}`,
        gate: 'gate2',
        severity: 'fail',
        selector: '',
        box: null,
        text: `Reference PNG hash mismatch for ${routeId}/${viewportName}: manifest=${manifest.sha256.png}, actual=${actualHash}.`,
      },
    };
  }
  return { ok: true, manifest, pngPath };
}

async function promptCopyrightAck() {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await new Promise((resolve) => {
      rl.question('Type "yes" to acknowledge the copyright notice and proceed: ', (ans) => resolve(ans));
    });
    return String(answer || '').trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

export async function checkUrlCopyrightAck(route, opts = {}) {
  process.stderr.write(`${COPYRIGHT_DISCLAIMER}\n`);
  if (route?.reference?.acknowledgeCopyright === true || opts.acknowledgeCopyright === true) {
    return { ok: true, acknowledgedAt: new Date().toISOString() };
  }
  const prompted = await promptCopyrightAck();
  if (prompted) {
    return { ok: true, acknowledgedAt: new Date().toISOString() };
  }
  return {
    ok: false,
    finding: {
      id: `gate2.reference-copy-unacknowledged.${route.id}`,
      gate: 'gate2',
      severity: 'fail',
      selector: '',
      box: null,
      text: `Copyright disclaimer not acknowledged for url reference on route "${route.id}". Pass --acknowledge-copyright or set reference.acknowledgeCopyright: true.`,
    },
  };
}

export async function extractLandmarks(page, landmarkSelectors = ['header', 'nav', 'main', 'footer']) {
  const result = {};
  for (const sel of landmarkSelectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0) {
        const box = await loc.boundingBox();
        if (box) {
          result[sel] = {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        }
      }
    } catch {}
  }
  return result;
}

export async function extractComputedStyles(page, extraSelectors = [], scopeSelector = null) {
  return page.evaluate(({ props, extra, scope }) => {
    const root = scope ? (document.querySelector(scope) || document) : document;
    const selectors = new Set([
      'header', 'nav', 'main', 'footer',
      'h1', 'h2', 'h3', 'p', 'button', 'a', 'input', 'select', 'textarea',
      ...extra,
    ]);
    root.querySelectorAll('[id]').forEach((el) => {
      if (el.id) selectors.add(`#${el.id}`);
    });
    const elements = [];
    const seenEls = new Set();
    for (const sel of selectors) {
      const el = root === document ? document.querySelector(sel) : (root.matches(sel) ? root : root.querySelector(sel));
      if (!el || seenEls.has(el)) continue;
      seenEls.add(el);
      const cs = window.getComputedStyle(el);
      const entry = { selector: sel };
      for (const p of props) {
        entry[p] = cs.getPropertyValue(p);
      }
      elements.push(entry);
    }
    return { elements };
  }, { props: STYLE_PROPS, extra: extraSelectors, scope: scopeSelector });
}

export async function freezeReferencePage(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
    }`,
  });
}

export async function captureSingleRouteBundle({
  cwd,
  browser,
  route,
  viewport,
  dpr = 1,
  config,
  safeOutDir,
  opts = {},
  applyNetworkPolicy,
  freezeDateIso = '2026-01-01T00:00:00.000Z',
}) {
  const refCfg = route.reference || { kind: 'png' };
  const kind = refCfg.kind || 'png';
  const bDir = getBundleDir(cwd, route.id, viewport.name);
  const pngPath = path.join(bDir, `${viewport.name}.png`);

  let sourceUrl = null;
  let sourceHash = null;
  let staticSrv = null;
  let copyAcknowledgedAt = null;

  if (kind === 'url') {
    const ack = await checkUrlCopyrightAck(route, opts);
    if (!ack.ok) {
      return { ok: false, blocked: true, finding: ack.finding };
    }
    copyAcknowledgedAt = ack.acknowledgedAt;
    sourceUrl = refCfg.source;
    sourceHash = sha256Buffer(Buffer.from(String(sourceUrl), 'utf8'));
  } else if (kind === 'html-file') {
    if (!refCfg.source) {
      throw new Error(`html-file reference on route "${route.id}" requires reference.source`);
    }
    const resolvedSource = path.resolve(cwd, refCfg.source);
    if (!fs.existsSync(resolvedSource)) {
      throw new Error(`Reference html-file source not found: ${refCfg.source}`);
    }
    sourceHash = sha256File(resolvedSource);
    const existingManifest = readBundleManifest(bDir);
    if (
      !opts.refresh &&
      existingManifest &&
      existingManifest.kind === 'html-file' &&
      existingManifest.sha256?.source === sourceHash &&
      fs.existsSync(pngPath) &&
      (opts.compareMode || existingManifest.sha256?.png === sha256File(pngPath))
    ) {
      return { ok: true, reused: true, bundleDir: bDir, pngPath, manifest: existingManifest };
    }
    staticSrv = await startStaticServer({ file: resolvedSource });
    sourceUrl = staticSrv.baseUrl;
  } else {
    throw new Error(`Unsupported reference capture kind: ${kind}`);
  }

  fs.mkdirSync(bDir, { recursive: true });
  const harPath = kind === 'url' ? path.join(bDir, '.har') : null;

  const contextOptions = {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: dpr,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  };
  if (kind === 'url') {
    contextOptions.recordHar = { path: harPath };
    contextOptions.locale = 'en-US';
    contextOptions.timezoneId = 'UTC';
  }

  const context = await browser.newContext(contextOptions);
  let captureHtmlPath = null;
  try {
    if (kind === 'url') {
      await context.addInitScript((iso) => {
        const fixed = new Date(iso).valueOf();
        const OrigDate = Date;
        class FrozenDate extends OrigDate {
          constructor(...args) {
            super(...(args.length ? args : [fixed]));
          }
          static now() {
            return fixed;
          }
        }
        window.Date = FrozenDate;
      }, freezeDateIso);
    }

    const page = await context.newPage();
    if (applyNetworkPolicy) {
      const origins = [...(config?.allowNetwork || [])];
      try {
        origins.push(new URL(sourceUrl).origin);
      } catch {}
      await applyNetworkPolicy(page, sourceUrl, origins);
    }

    await page.goto(sourceUrl, { waitUntil: 'networkidle', timeout: 20000 });

    if (Array.isArray(refCfg.prepare) && refCfg.prepare.length > 0) {
      await runScenario({
        page,
        scenario: { id: `prepare-${route.id}`, steps: refCfg.prepare },
        baseUrl: sourceUrl,
        outDir: safeOutDir,
        cwd,
        defaultTimeoutMs: 10000,
      });
    }

    if (opts.fullPage) {
      await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 50));
        window.scrollTo(0, 0);
      });
    }

    await freezeReferencePage(page);

    const htmlContent = await page.content();
    if (safeOutDir) {
      fs.mkdirSync(safeOutDir, { recursive: true });
      captureHtmlPath = path.join(safeOutDir, 'capture.html');
      fs.writeFileSync(captureHtmlPath, htmlContent, 'utf8');
    }

    const landmarksList = config?.landmarks || ['header', 'nav', 'main', 'footer'];
    const landmarks = await extractLandmarks(page, landmarksList);
    fs.writeFileSync(path.join(bDir, '.landmarks.json'), `${JSON.stringify(landmarks, null, 2)}\n`);

    const extraSelectors = refCfg.selector ? [refCfg.selector] : [];
    const styles = await extractComputedStyles(page, extraSelectors, refCfg.selector || null);
    fs.writeFileSync(path.join(bDir, '.styles.json'), `${JSON.stringify(styles, null, 2)}\n`);

    let selBox = null;
    const captureSelector = refCfg.selector || route.selector;
    if (captureSelector) {
      const loc = page.locator(captureSelector).first();
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      selBox = await loc.boundingBox();
    }

    await page.screenshot({ path: pngPath, fullPage: Boolean(opts.fullPage) });
    if (selBox && !opts.fullPage) {
      cropPngFile(pngPath, selBox, dpr);
    }
  } finally {
    await context.close();
    if (staticSrv) await staticSrv.close();
  }

  const pngHash = sha256File(pngPath);
  const manifest = {
    kind,
    source: refCfg.source,
    sha256: {
      source: sourceHash,
      png: pngHash,
    },
    capturedAt: new Date().toISOString(),
    playwright: '1.65.1',
    viewport: { name: viewport.name, width: viewport.width, height: viewport.height },
    dpr,
    tier: 'A',
    copyAcknowledgedAt,
    sourceFormat: 'png',
  };
  fs.writeFileSync(path.join(bDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return { ok: true, reused: false, bundleDir: bDir, pngPath, manifest, captureHtmlPath };
}
