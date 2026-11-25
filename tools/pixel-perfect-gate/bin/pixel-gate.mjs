#!/usr/bin/env node
/**
 * pixel-gate: Single-browser Playwright CLI for Gate 1 (Layout/Runtime) + Gate 2 (Visual Diff) + Gate 3 (Interaction).
 * Designed for deterministic Agent Looping across Antigravity, Cursor, Claude Code, and CI.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { program } from 'commander';
import { attachRuntimeListeners, runLayoutAudit } from '../src/layout-audit.mjs';
import { readReferencePng, compareVisual, cropPng } from '../src/visual-diff.mjs';
import { recordTelemetry } from '../src/telemetry.mjs';
import { buildReport } from '../src/report.mjs';
import { resolveSafeOutDir, loadProjectConfig, loadScenariosFile } from '../src/config.mjs';
import { checkAcceptanceMapping, resolveKeyedReferencePath } from '../src/intake.mjs';
import { runInteractionAudit } from '../src/interaction-audit.mjs';
import { runScenario } from '../src/scenario-runner.mjs';
import { computeLoop, resolveRunId, validateMaxIterations } from '../src/loop.mjs';
import {
  captureSingleRouteBundle,
  checkUrlCopyrightAck,
  getBundleDir,
  readBundleManifest,
  sha256File,
  verifyBundleIntegrity,
} from '../src/reference-bundle.mjs';
import { startStaticServer, startDevServer } from '../src/targets.mjs';
import { runPwaAudit } from '../src/pwa-audit.mjs';
import { runParityComparison } from '../src/parity-runner.mjs';
import { runStyleParity } from '../src/style-parity.mjs';
import {
  startWordPressTarget,
  hideWpAdminBar,
  runWordPressStructureCheck,
  validateWordPressConfig,
} from '../src/wordpress.mjs';
import { detectImageFormat, prepareScreenshotBundle } from '../src/screenshot-intake.mjs';
import { prepareDesignFileBundle } from '../src/design-file.mjs';

const startMs = Date.now();
const cwd = process.cwd();
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const isReferenceCapture = process.argv[2] === 'reference' && process.argv[3] === 'capture';
const parseArgv = isReferenceCapture
  ? [process.argv[0], process.argv[1], ...process.argv.slice(4)]
  : process.argv;

program
  .name('pixel-gate')
  .version(pkg.version)
  .description(
    'Single-browser Gate 1 (Layout/Runtime), Gate 2 (Visual Diff), and Gate 3 (Interaction) evaluator. Reads pixel-gate.config.json by default.'
  )
  .option('--config <file>', 'Path to config file (defaults to pixel-gate.config.json)')
  .option('--url <url>', 'Target URL (e.g. http://localhost:3000)')
  .option('--ref <path>', 'Path to reference design PNG (omit for Gate 1 layout-only check)')
  .option('--scenario <id>', 'Replay a named scenario from the config scenarios file')
  .option('--gate3-static', 'Run Gate 3 static interaction audit on --url', false)
  .option('--vision-verdict <file>', 'Optional vision verdict JSON when vision.enabled is true')
  .option('--mode <mode>', 'Visual comparison mode: pixel | wireframe', 'pixel')
  .option('--dpr <number>', 'Device pixel ratio (use 2 for @2x Figma exports)', '1')
  .option('--viewport <WxH>', 'Viewport WxH (defaults to --ref dimensions / --dpr, or 1440x900 when --ref is omitted)', '1440x900')
  .option('--selector <css>', 'Optional CSS selector to crop comparison')
  .option('--mask <selectors>', 'Comma-separated CSS selectors to mask dynamic elements')
  .option('--landmarks <selectors>', 'Comma-separated landmark selectors for wireframe mode', 'header,nav,main,footer')
  .option('--ref-landmarks <path>', 'Optional JSON file of expected landmark boxes for wireframe mode')
  .option('--full-page', 'Capture full scrollable page instead of viewport', false)
  .option('--timeout <ms>', 'Navigation timeout in milliseconds', '20000')
  .option('--out <dir>', 'Output directory inside .visual-eval/ for screenshots, diff, and telemetry', '.visual-eval')
  .option('--threshold <number>', 'Pixelmatch color sensitivity (0-1)', '0.1')
  .option('--max-diff <number>', 'Max allowed mismatch percentage before failing', '0.5')
  .option('--iteration <number>', 'Current Agent Loop iteration (1-5)', '1')
  .option('--run-id <id>', 'Audit loop run identifier')
  .option('--max-iterations <number>', 'Max loop iterations (hard cap 5)')
  .option('--refresh', 'Re-capture frozen references', false)
  .option('--acknowledge-copyright', 'Acknowledge copyright disclaimer for url capture', false)
  .option('--model <name>', 'Optional AI model identifier for telemetry', 'unknown')
  .option('--harness <name>', 'Optional harness identifier (antigravity|cursor|cli)', 'cli')
  .exitOverride();

let opts = {};
try {
  program.parse(parseArgv);
  opts = program.opts();
} catch (err) {
  if (err?.code === 'commander.helpDisplayed' || err?.code === 'commander.version') {
    process.exit(0);
  }
  let parsedIter = 1;
  const iterOpt = program.opts()?.iteration;
  if (iterOpt) {
    const n = Number(iterOpt);
    if (Number.isInteger(n) && n >= 1 && n <= 5) parsedIter = n;
  }
  if (parsedIter === 1) {
    const iterIdx = process.argv.indexOf('--iteration');
    if (iterIdx !== -1 && iterIdx + 1 < process.argv.length) {
      const n = Number(process.argv[iterIdx + 1]);
      if (Number.isInteger(n) && n >= 1 && n <= 5) parsedIter = n;
    }
  }
  const errMsg = err?.message || String(err);
  const loop = computeLoop({
    runId: resolveRunId(program.opts()?.runId, null),
    iteration: parsedIter,
    passed: false,
    errorMessage: errMsg,
    blocked: true,
  });
  const report = buildReport({
    passed: false,
    iteration: parsedIter,
    durationMs: Date.now() - startMs,
    errorMessage: errMsg,
    loop,
  });
  fs.writeSync(1, JSON.stringify(report, null, 2) + '\n');
  process.exit(report.exitCode);
}

const mode = opts.mode === 'wireframe' ? 'wireframe' : 'pixel';

let browser = null;
let gate1Result = null;
let gate2Result = null;
let gate3Result = null;
let dpr = 1;
let iteration = 1;
let safeOutDir = null;
let runId = null;

function isExplicit(name) {
  return program.getOptionValueSource(name) !== 'default' && program.getOptionValueSource(name) !== undefined;
}

function resolveExpectedLandmarks(refPath, refLandmarksPath) {
  let targetPath = null;
  if (refLandmarksPath) {
    if (!fs.existsSync(refLandmarksPath)) {
      throw new Error(`Reference landmarks file not found: ${refLandmarksPath}`);
    }
    targetPath = refLandmarksPath;
  } else if (refPath) {
    const parsed = path.parse(refPath);
    const candidates = [
      path.join(parsed.dir, `${parsed.name}.landmarks.json`),
      `${refPath}.landmarks.json`,
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        targetPath = candidate;
        break;
      }
    }
  }
  if (!targetPath) return null;
  const content = fs.readFileSync(targetPath, 'utf8');
  try {
    return { data: JSON.parse(content), found: true };
  } catch (err) {
    const sidecarErr = new Error(`Invalid sidecar JSON in ${targetPath}: ${err.message}`);
    sidecarErr.code = 'INVALID_SIDECAR_JSON';
    throw sidecarErr;
  }
}

function readVisionVerdict(verdictPath) {
  if (!fs.existsSync(verdictPath)) {
    throw new Error(`Vision verdict file not found: ${verdictPath}`);
  }
  const stat = fs.statSync(verdictPath);
  if (!stat.isFile()) {
    throw new Error(`Vision verdict path is not a file: ${verdictPath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSON in vision verdict file: ${err.message}`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    typeof parsed.passed !== 'boolean' ||
    typeof parsed.text !== 'string'
  ) {
    throw new Error('Invalid vision verdict schema: expected { "passed": boolean, "text": string }');
  }
  return parsed;
}

function redactSecrets(text) {
  let out = String(text ?? '');
  for (const key of ['WORDPRESS_APP_PASSWORD', 'FIGMA_TOKEN']) {
    const val = process.env[key];
    if (val && val.length > 0) {
      out = out.split(val).join('[REDACTED]');
    }
  }
  return out;
}

function toRelArtifact(absPath) {
  if (!absPath) return null;
  return path.relative(cwd, absPath).split(path.sep).join('/');
}

async function applyNetworkPolicy(page, baseUrl, allowNetwork) {
  const allowed = new Set();
  if (baseUrl) {
    try {
      allowed.add(new URL(baseUrl).origin);
    } catch {}
  }
  for (const origin of allowNetwork || []) {
    try {
      allowed.add(new URL(origin).origin);
    } catch {}
  }
  const abortedUrls = new Set();
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) {
      return route.continue();
    }
    try {
      const origin = new URL(url).origin;
      if (allowed.has(origin)) {
        return route.continue();
      }
    } catch {}
    abortedUrls.add(url);
    return route.abort();
  });
  return abortedUrls;
}

async function collectMasks(page, maskSelectors, cropSelector) {
  const maskBoxes = [];
  if (!maskSelectors || maskSelectors.length === 0) return maskBoxes;
  let offsetBox = { x: 0, y: 0 };
  if (cropSelector) {
    const parentLocator = page.locator(cropSelector).first();
    await parentLocator.waitFor({ state: 'visible', timeout: 5000 });
    const parentBox = await parentLocator.boundingBox();
    if (parentBox) offsetBox = parentBox;
  }
  for (const sel of maskSelectors) {
    const locs = page.locator(sel);
    const count = await locs.count();
    for (let i = 0; i < count; i++) {
      const loc = locs.nth(i);
      if (await loc.isVisible().catch(() => false)) {
        const box = await loc.boundingBox();
        if (box) {
          maskBoxes.push({
            x: box.x - offsetBox.x,
            y: box.y - offsetBox.y,
            width: box.width,
            height: box.height,
          });
        }
      }
    }
  }
  return maskBoxes;
}

async function freezePage(page) {
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

function mergeGate1(base, next) {
  if (!base) return next;
  const merged = {
    passed: Boolean(base.passed && next.passed),
    viewport: next.viewport || base.viewport,
    consoleErrors: [...(base.consoleErrors || []), ...(next.consoleErrors || [])],
    networkErrors: [...(base.networkErrors || []), ...(next.networkErrors || [])],
    horizontalOverflow: Boolean(base.horizontalOverflow || next.horizontalOverflow),
    overflowingElements: [...(base.overflowingElements || []), ...(next.overflowingElements || [])],
    clippedTextElements: [...(base.clippedTextElements || []), ...(next.clippedTextElements || [])],
    overlappingSiblings: [...(base.overlappingSiblings || []), ...(next.overlappingSiblings || [])],
    brokenImages: [...(base.brokenImages || []), ...(next.brokenImages || [])],
    extraFindings: [...(base.extraFindings || []), ...(next.extraFindings || [])],
  };
  if (next.pwa || base.pwa) merged.pwa = next.pwa || base.pwa;
  if (next.wordpress || base.wordpress) merged.wordpress = next.wordpress || base.wordpress;
  if (next.structureCheck || base.structureCheck) merged.structureCheck = next.structureCheck || base.structureCheck;
  return merged;
}

try {
  runId = resolveRunId(opts.runId, null);
  if (isExplicit('maxIterations')) {
    validateMaxIterations(opts.maxIterations);
  }

  const iterRaw = String(opts.iteration ?? '1').trim();
  const parsedIteration = Number(iterRaw);
  if (!/^\d+$/.test(iterRaw) || !Number.isInteger(parsedIteration) || parsedIteration < 1 || parsedIteration > 5) {
    throw new Error(`Invalid --iteration "${opts.iteration}": must be an integer between 1 and 5.`);
  }
  iteration = parsedIteration;

  safeOutDir = resolveSafeOutDir(cwd, opts.out, { allowTestDir: Boolean(opts.url && !opts.config) });
  const outRel = toRelArtifact(safeOutDir);

  const loaded = opts.config || !opts.url ? loadProjectConfig(cwd, opts.config || null, { isCapture: isReferenceCapture }) : null;
  if (!opts.url && !loaded) {
    throw new Error('No --url provided and pixel-gate.config.json not found in current directory.');
  }
  const config = loaded?.config || null;
  runId = resolveRunId(opts.runId, config);
  if (config?.loop?.maxIterations !== undefined) {
    validateMaxIterations(config.loop.maxIterations);
  }

  const dprRaw = isExplicit('dpr') ? String(opts.dpr) : String(config?.dpr ?? opts.dpr ?? '1');
  const parsedDpr = Number(dprRaw.trim());
  if (!/^\d+$/.test(dprRaw.trim()) || !Number.isInteger(parsedDpr) || parsedDpr < 1) {
    throw new Error(`Invalid --dpr "${dprRaw}": must be a positive integer.`);
  }
  dpr = parsedDpr;

  const timeoutMs = Number(opts.timeout) > 0 ? Number(opts.timeout) : 20000;
  const effectiveMaxDiff = isExplicit('maxDiff') ? Number(opts.maxDiff) : Number(config?.maxDiff ?? opts.maxDiff ?? 0.5);
  const effectiveThreshold = isExplicit('threshold') ? Number(opts.threshold) : Number(config?.threshold ?? opts.threshold ?? 0.1);

  const scenariosList = config?.scenarios ? loadScenariosFile(cwd, config.scenarios) : [];
  let targetScenario = null;
  if (opts.scenario) {
    targetScenario = scenariosList.find((s) => s.id === opts.scenario) || null;
    if (!targetScenario) {
      throw new Error(`Unknown scenario "${opts.scenario}"`);
    }
  }

  const visionEnabled = config?.vision?.enabled === true;
  const visionBlocking = config?.vision?.blocking === true;
  let parsedVerdict = null;
  if (visionEnabled && opts.visionVerdict) {
    parsedVerdict = readVisionVerdict(path.resolve(cwd, opts.visionVerdict));
  }

  fs.mkdirSync(safeOutDir, { recursive: true });

  if (opts.url) {
    // Flag-driven single-URL run (PR #2 compatible + --gate3-static)
    let refImg = null;
    let viewportWidth = 1440;
    let viewportHeight = 900;

    if (opts.viewport) {
      const [w, h] = opts.viewport.split('x').map(Number);
      if (w > 0 && h > 0) {
        viewportWidth = w;
        viewportHeight = h;
      }
    }

    if (opts.ref) {
      refImg = readReferencePng(opts.ref);
      if (refImg.width % dpr !== 0 || refImg.height % dpr !== 0) {
        const errorMsg = `Dimension finding: Reference dimensions ${refImg.width}x${refImg.height} are not divisible by --dpr ${dpr}.`;
        gate2Result = {
          passed: false,
          mode,
          mismatchPct: null,
          regions: [],
          regionCount: 0,
          error: errorMsg,
          dimensions: `${refImg.width}x${refImg.height}`,
          findings: [
            {
              id: 'gate2.dimension-mismatch',
              gate: 'gate2',
              severity: 'fail',
              selector: '',
              box: null,
              text: errorMsg,
            },
          ],
        };
        const durationMs = Date.now() - startMs;
        const loop = computeLoop({
          outDir: safeOutDir,
          runId,
          iteration,
          passed: false,
          errorMessage: errorMsg,
          findings: gate2Result.findings,
          blocked: true,
        });
        const report = buildReport({
          passed: false,
          iteration,
          durationMs,
          errorMessage: errorMsg,
          gate1Result: null,
          gate2Result,
          loop,
        });
        const telemetryPath = recordTelemetry(outRel, {
          runId,
          url: opts.url,
          mode,
          dpr,
          iteration,
          passed: false,
          gate1Passed: Boolean(report.gates.gate1?.passed),
          gate2Passed: Boolean(report.gates.gate2?.passed),
          mismatchPct: null,
          durationMs: report.durationMs,
          error: errorMsg,
          failCount: report.findings.filter((f) => f.severity === 'fail').length,
          failIds: report.findings.filter((f) => f.severity === 'fail').map((f) => f.id),
          findingIds: report.findings.map((f) => f.id),
          model: opts.model,
          harness: opts.harness,
        });
        report.telemetry = telemetryPath;
        if (telemetryPath) {
          report.artifacts = { ...(report.artifacts || {}), telemetry: telemetryPath };
        }
        fs.writeSync(1, JSON.stringify(report, null, 2) + '\n');
        process.exit(report.exitCode);
      }
      if (!isExplicit('viewport')) {
        viewportWidth = refImg.width / dpr;
        viewportHeight = refImg.height / dpr;
      }
    }

    const actualPath = path.join(safeOutDir, 'actual.png');
    process.chdir(safeOutDir);
    try {
      browser = await chromium.launch({
        args: ['--disable-logging', `--log-file=${path.join(safeOutDir, 'chromium.log')}`],
        env: { ...process.env, CHROME_LOG_FILE: path.join(safeOutDir, 'chromium.log') },
      });
    } finally {
      process.chdir(cwd);
    }
    const page = await browser.newPage({
      viewport: { width: viewportWidth, height: viewportHeight },
      deviceScaleFactor: dpr,
    });
    const abortedUrls = await applyNetworkPolicy(page, opts.url, config?.allowNetwork);
    const { consoleErrors, networkErrors } = attachRuntimeListeners(page);
    await page.goto(opts.url, { waitUntil: 'networkidle', timeout: timeoutMs });
    await freezePage(page);

    const filteredConsoleErrors = consoleErrors.filter((e) => !e.url || !abortedUrls.has(e.url));
    const filteredNetworkErrors = networkErrors.filter((e) => !abortedUrls.has(e.url));
    const domAudit = await runLayoutAudit(page);
    const g1Issues = domAudit.issues;
    const gate1Passed =
      filteredConsoleErrors.length === 0 &&
      filteredNetworkErrors.length === 0 &&
      !g1Issues.horizontalOverflow &&
      g1Issues.overflowingElements.length === 0 &&
      g1Issues.clippedTextElements.length === 0 &&
      g1Issues.overlappingSiblings.length === 0 &&
      g1Issues.brokenImages.length === 0;

    gate1Result = {
      passed: gate1Passed,
      viewport: domAudit.viewport,
      consoleErrors: filteredConsoleErrors,
      networkErrors: filteredNetworkErrors,
      ...g1Issues,
    };

    if (opts.gate3Static) {
      gate3Result = await runInteractionAudit(page);
    }

    const maskSelectors = opts.mask ? opts.mask.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const maskBoxes = await collectMasks(page, maskSelectors, opts.selector);

    if (opts.ref) {
      let selBox = null;
      if (opts.selector) {
        const locator = page.locator(opts.selector).first();
        await locator.waitFor({ state: 'visible', timeout: 5000 });
        selBox = await locator.boundingBox();
      }
      await page.screenshot({ path: actualPath, fullPage: Boolean(opts.fullPage) });
      if (opts.selector && selBox) {
        const actualRaw = PNG.sync.read(fs.readFileSync(actualPath));
        const cropX = Math.round(selBox.x * dpr);
        const cropY = Math.round(selBox.y * dpr);
        const elemW = Math.round(selBox.width * dpr);
        const elemH = Math.round(selBox.height * dpr);
        fs.writeFileSync(actualPath, PNG.sync.write(cropPng(actualRaw, cropX, cropY, elemW, elemH)));
        if (refImg && (refImg.width > elemW + Math.ceil(dpr) || refImg.height > elemH + Math.ceil(dpr))) {
          refImg = cropPng(refImg, cropX, cropY, elemW, elemH);
        }
      }
    }

    let actualLandmarks = [];
    if (opts.ref && mode === 'wireframe') {
      const landmarkSelectors = String(opts.landmarks || 'header,nav,main,footer')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      actualLandmarks = await page.evaluate((selectors) => {
        const results = [];
        for (const sel of selectors) {
          const els = Array.from(document.querySelectorAll(sel));
          let idx = 0;
          for (const el of els) {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) continue;
            results.push({
              selector: sel,
              index: idx++,
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            });
          }
        }
        return results;
      }, landmarkSelectors);
    }

    await browser.close();
    browser = null;

    let resolvedSidecar = null;
    if (opts.ref && refImg && mode === 'wireframe') {
      try {
        resolvedSidecar = resolveExpectedLandmarks(opts.ref, opts.refLandmarks);
      } catch (err) {
        if (err?.code === 'INVALID_SIDECAR_JSON') {
          gate2Result = {
            passed: false,
            skipped: false,
            mode: 'wireframe',
            mismatchPct: null,
            error: err.message,
            findings: [
              {
                id: 'gate2.landmark.invalid-sidecar',
                gate: 'gate2',
                severity: 'fail',
                selector: '',
                box: null,
                text: err.message,
              },
            ],
            regions: [],
            regionCount: 0,
          };
        }
        throw err;
      }
    }

    gate2Result = { passed: true, skipped: true, reason: 'No --ref image provided' };
    if (opts.ref && refImg) {
      gate2Result = compareVisual({
        refImg,
        actualPath,
        outDir: safeOutDir,
        threshold: effectiveThreshold,
        maxDiff: effectiveMaxDiff,
        mode,
        maskBoxes,
        dpr,
        fullPage: Boolean(opts.fullPage),
        wireframe: mode === 'wireframe'
          ? {
              actualLandmarks,
              expectedLandmarks: resolvedSidecar ? resolvedSidecar.data : null,
              hasSidecar: Boolean(resolvedSidecar?.found),
              tolerance: 4,
            }
          : null,
      });
      gate2Result.artifacts = {
        actual: toRelArtifact(gate2Result.artifacts?.actual),
        diff: toRelArtifact(gate2Result.artifacts?.diff),
        composite: toRelArtifact(gate2Result.artifacts?.composite),
        reference: opts.ref,
      };
    }
  } else if (isReferenceCapture) {
    process.chdir(safeOutDir);
    try {
      browser = await chromium.launch({
        args: ['--disable-logging', `--log-file=${path.join(safeOutDir, 'chromium.log')}`],
        env: { ...process.env, CHROME_LOG_FILE: path.join(safeOutDir, 'chromium.log') },
      });
    } finally {
      process.chdir(cwd);
    }

    const captureFindings = [];
    let captureBlocked = false;
    let lastCaptureHtml = null;

    for (const route of config.routes) {
      const refKind = route.reference?.kind || 'png';
      for (const vp of config.viewports) {
        if (refKind === 'html-file' || refKind === 'url') {
          const capRes = await captureSingleRouteBundle({
            cwd,
            browser,
            route,
            viewport: vp,
            dpr,
            config,
            safeOutDir,
            opts,
            applyNetworkPolicy,
          });
          if (!capRes.ok) {
            captureBlocked = Boolean(capRes.blocked);
            if (capRes.finding) captureFindings.push(capRes.finding);
          } else if (capRes.captureHtmlPath) {
            lastCaptureHtml = capRes.captureHtmlPath;
          }
        } else if (refKind === 'screenshot') {
          const shotRes = await prepareScreenshotBundle({ cwd, browser, route, viewport: vp, dpr });
          if (!shotRes.ok) {
            captureBlocked = Boolean(shotRes.blocked);
            if (shotRes.finding) captureFindings.push(shotRes.finding);
          }
        } else if (refKind === 'design-file') {
          const designRes = await prepareDesignFileBundle({ cwd, config, route, viewport: vp, dpr });
          if (!designRes.ok) {
            captureBlocked = Boolean(designRes.blocked);
            if (designRes.finding) captureFindings.push(designRes.finding);
          }
        }
      }
    }

    await browser.close();
    browser = null;

    gate1Result = { passed: true, skipped: true, reason: 'Reference capture only' };
    gate2Result = {
      passed: !captureBlocked && captureFindings.every((f) => f.severity !== 'fail'),
      skipped: false,
      findings: captureFindings,
      artifacts: lastCaptureHtml ? { captureHtml: lastCaptureHtml } : null,
    };
    gate3Result = { passed: true, skipped: true, reason: 'Reference capture only' };
  } else {
    // Config-driven run (routes x viewports, intake mapping, optional --scenario, M2b adapters)
    if (config.target?.kind === 'wordpress') {
      validateWordPressConfig(config.target.wordpress || {});
    }

    let activeTarget = null;
    if (config.target?.kind === 'static') {
      activeTarget = await startStaticServer(config.target);
    } else if (config.target?.kind === 'dev-server') {
      activeTarget = await startDevServer(config.target, cwd);
    } else if (config.target?.kind === 'wordpress') {
      activeTarget = await startWordPressTarget(config.target.wordpress || {}, cwd);
    }

    try {
      const effectiveBaseUrl = activeTarget?.baseUrl || config.baseUrl;

      process.chdir(safeOutDir);
      try {
        browser = await chromium.launch({
          args: ['--disable-logging', `--log-file=${path.join(safeOutDir, 'chromium.log')}`],
          env: { ...process.env, CHROME_LOG_FILE: path.join(safeOutDir, 'chromium.log') },
        });
      } finally {
        process.chdir(cwd);
      }

      if (config.target?.pwa === true) {
        const pwaRes = await runPwaAudit(browser, effectiveBaseUrl, applyNetworkPolicy, config.allowNetwork);
        gate1Result = mergeGate1(gate1Result, {
          passed: pwaRes.findings.length === 0,
          viewport: { width: config.viewports[0].width, height: config.viewports[0].height },
          consoleErrors: [],
          networkErrors: [],
          horizontalOverflow: false,
          overflowingElements: [],
          clippedTextElements: [],
          overlappingSiblings: [],
          brokenImages: [],
          pwa: pwaRes.pwa,
          extraFindings: pwaRes.findings,
        });
      }

      if (config.target?.kind === 'wordpress') {
        const wpStruct = await runWordPressStructureCheck({
          baseUrl: effectiveBaseUrl,
          wpCfg: config.target.wordpress || {},
        });
        gate1Result = mergeGate1(gate1Result, {
          passed: true,
          viewport: { width: config.viewports[0].width, height: config.viewports[0].height },
          consoleErrors: [],
          networkErrors: [],
          horizontalOverflow: false,
          overflowingElements: [],
          clippedTextElements: [],
          overlappingSiblings: [],
          brokenImages: [],
          structureCheck: wpStruct.structureCheck,
          wordpress: wpStruct.credentialSource ? { credentialSource: wpStruct.credentialSource } : undefined,
          extraFindings: wpStruct.findings,
        });
      }

      if (targetScenario) {
        let vpWidth = 1440;
        let vpHeight = 900;
        if (isExplicit('viewport') && opts.viewport) {
          const [w, h] = opts.viewport.split('x').map(Number);
          if (w > 0 && h > 0) {
            vpWidth = w;
            vpHeight = h;
          }
        }
        const page = await browser.newPage({
          viewport: { width: vpWidth, height: vpHeight },
          deviceScaleFactor: dpr,
        });
        await applyNetworkPolicy(page, effectiveBaseUrl, config.allowNetwork);
        const scenRes = await runScenario({
          page,
          scenario: targetScenario,
          baseUrl: effectiveBaseUrl,
          outDir: safeOutDir,
          cwd,
          defaultTimeoutMs: timeoutMs,
        });
        gate3Result = {
          passed: scenRes.passed,
          skipped: false,
          scenarios: [scenRes.scenarioReport],
          findings: scenRes.findings,
        };
      } else {
        const checks = [];
        const gate2Findings = [];
        let allChecksPassed = true;
        let lastArtifacts = null;
        let lastMismatchPct = null;
        let lastAdvisory = null;
        let lastStyleMeta = null;
        let lastCaptureHtml = null;

        for (const route of config.routes) {
          const routeUrl = new URL(route.path, effectiveBaseUrl).toString();
          const routeMasks = Array.isArray(route.masks) ? route.masks : (config.masks || []);
          const maskSelectors = isExplicit('mask')
            ? opts.mask.split(',').map((s) => s.trim()).filter(Boolean)
            : routeMasks;
          const refKind = route.reference?.kind || 'png';
          const targetSelector = route.selector || config.target?.selector || (config.target?.kind === 'wordpress' ? 'main' : null);

          for (const vp of config.viewports) {
            let refPath = null;
            let refRel = null;
            let bundleDir = null;
            let tier = 'A';
            let expectedLandmarksPath = null;

            if (refKind === 'png') {
              if (route.reference?.source) {
                const explicitSrc = path.resolve(cwd, route.reference.source);
                if (fs.existsSync(explicitSrc)) {
                  const fmt = detectImageFormat(fs.readFileSync(explicitSrc));
                  if (fmt !== 'png') {
                    allChecksPassed = false;
                    throw new Error(`Invalid PNG reference (${fmt}) for kind "png" on route "${route.id}"`);
                  }
                  refPath = explicitSrc;
                }
              } else {
                refPath = resolveKeyedReferencePath(cwd, config.references, route.id, vp.name);
              }
              refRel = refPath ? toRelArtifact(refPath) : '';

              if (!refPath || !fs.existsSync(refPath)) {
                if (route.referenceRequired !== false) {
                  allChecksPassed = false;
                  gate2Findings.push({
                    id: `gate2.missing-reference.${route.id}.${vp.name}`,
                    gate: 'gate2',
                    severity: 'fail',
                    selector: '',
                    box: null,
                    text: `Missing required reference PNG at ${refRel || `${route.id}/${vp.name}.png`}`,
                  });
                  continue;
                }
                if (!config.target?.kind || config.target.kind === 'url') continue;
                const targetContext = await browser.newContext({
                  viewport: { width: vp.width, height: vp.height },
                  deviceScaleFactor: dpr,
                  serviceWorkers: 'block',
                  reducedMotion: 'reduce',
                });
                const page = await targetContext.newPage();
                const abortedUrls = await applyNetworkPolicy(page, effectiveBaseUrl, config.allowNetwork);
                const { consoleErrors, networkErrors } = attachRuntimeListeners(page);
                await page.goto(routeUrl, { waitUntil: 'networkidle', timeout: timeoutMs });
                if (config.target?.kind === 'wordpress') {
                  await hideWpAdminBar(page);
                }
                await freezePage(page);
                const captureHtmlFile = path.join(safeOutDir, 'capture.html');
                fs.writeFileSync(captureHtmlFile, await page.content(), 'utf8');
                lastCaptureHtml = captureHtmlFile;
                const filteredConsoleErrors = consoleErrors.filter((e) => !e.url || !abortedUrls.has(e.url));
                const filteredNetworkErrors = networkErrors.filter((e) => !abortedUrls.has(e.url));
                const domAudit = await runLayoutAudit(page);
                const g1Issues = domAudit.issues;
                const g1Passed =
                  filteredConsoleErrors.length === 0 &&
                  filteredNetworkErrors.length === 0 &&
                  !g1Issues.horizontalOverflow &&
                  g1Issues.overflowingElements.length === 0 &&
                  g1Issues.clippedTextElements.length === 0 &&
                  g1Issues.overlappingSiblings.length === 0 &&
                  g1Issues.brokenImages.length === 0;
                gate1Result = mergeGate1(gate1Result, {
                  passed: g1Passed,
                  viewport: domAudit.viewport,
                  consoleErrors: filteredConsoleErrors,
                  networkErrors: filteredNetworkErrors,
                  ...g1Issues,
                });
                await targetContext.close();
                continue;
              }
            } else {
              bundleDir = getBundleDir(cwd, route.id, vp.name);
              const existingManifest = readBundleManifest(bundleDir);

              if (refKind === 'html-file') {
                const capRes = await captureSingleRouteBundle({
                  cwd,
                  browser,
                  route,
                  viewport: vp,
                  dpr,
                  config,
                  safeOutDir,
                  opts: { ...opts, compareMode: true },
                  applyNetworkPolicy,
                });
                if (!capRes.ok) {
                  allChecksPassed = false;
                  if (capRes.finding) gate2Findings.push(capRes.finding);
                  continue;
                }
              } else if (refKind === 'url') {
                if (!existingManifest || opts.refresh) {
                  const capRes = await captureSingleRouteBundle({
                    cwd,
                    browser,
                    route,
                    viewport: vp,
                    dpr,
                    config,
                    safeOutDir,
                    opts,
                    applyNetworkPolicy,
                  });
                  if (!capRes.ok) {
                    allChecksPassed = false;
                    if (capRes.finding) gate2Findings.push(capRes.finding);
                    checks.push({
                      route: route.id,
                      viewport: vp.name,
                      reference: null,
                      referenceKind: refKind,
                      passed: false,
                      mismatchPct: null,
                    });
                    continue;
                  }
                }
              } else if (refKind === 'screenshot') {
                if (!existingManifest || opts.refresh) {
                  const shotRes = await prepareScreenshotBundle({ cwd, browser, route, viewport: vp, dpr });
                  if (!shotRes.ok) {
                    allChecksPassed = false;
                    if (shotRes.finding) gate2Findings.push(shotRes.finding);
                    continue;
                  }
                }
                tier = 'C';
              } else if (refKind === 'design-file') {
                if (!existingManifest || opts.refresh) {
                  const designRes = await prepareDesignFileBundle({ cwd, config, route, viewport: vp, dpr });
                  if (!designRes.ok) {
                    allChecksPassed = false;
                    if (designRes.finding) gate2Findings.push(designRes.finding);
                    continue;
                  }
                }
                tier = 'B';
              }

              const integrity = verifyBundleIntegrity(bundleDir, route.id, vp.name);
              if (!integrity.ok) {
                allChecksPassed = false;
                if (integrity.finding) gate2Findings.push(integrity.finding);
                continue;
              }
              refPath = integrity.pngPath;
              refRel = toRelArtifact(refPath);
              tier = integrity.manifest?.tier || tier;
              const lmCandidate = path.join(bundleDir, '.landmarks.json');
              if (fs.existsSync(lmCandidate)) {
                expectedLandmarksPath = lmCandidate;
              }
            }

            const refImg = readReferencePng(refPath);
            const targetContext = await browser.newContext({
              viewport: { width: vp.width, height: vp.height },
              deviceScaleFactor: dpr,
              serviceWorkers: 'block',
              reducedMotion: 'reduce',
            });
            const page = await targetContext.newPage();
            const abortedUrls = await applyNetworkPolicy(page, effectiveBaseUrl, config.allowNetwork);
            const { consoleErrors, networkErrors } = attachRuntimeListeners(page);

            await page.goto(routeUrl, { waitUntil: 'networkidle', timeout: timeoutMs });
            if (config.target?.kind === 'wordpress') {
              await hideWpAdminBar(page);
            }
            await freezePage(page);

            const captureHtmlFile = path.join(safeOutDir, 'capture.html');
            fs.writeFileSync(captureHtmlFile, await page.content(), 'utf8');
            lastCaptureHtml = captureHtmlFile;

            const filteredConsoleErrors = consoleErrors.filter((e) => !e.url || !abortedUrls.has(e.url));
            const filteredNetworkErrors = networkErrors.filter((e) => !abortedUrls.has(e.url));
            const domAudit = await runLayoutAudit(page);
            const g1Issues = domAudit.issues;
            const g1Passed =
              filteredConsoleErrors.length === 0 &&
              filteredNetworkErrors.length === 0 &&
              !g1Issues.horizontalOverflow &&
              g1Issues.overflowingElements.length === 0 &&
              g1Issues.clippedTextElements.length === 0 &&
              g1Issues.overlappingSiblings.length === 0 &&
              g1Issues.brokenImages.length === 0;

            gate1Result = mergeGate1(gate1Result, {
              passed: g1Passed,
              viewport: domAudit.viewport,
              consoleErrors: filteredConsoleErrors,
              networkErrors: filteredNetworkErrors,
              ...g1Issues,
            });

            const checkDir = path.join(safeOutDir, `${route.id}-${vp.name}`);
            fs.mkdirSync(checkDir, { recursive: true });
            const actualPath = path.join(checkDir, 'actual.png');
            const maskBoxes = await collectMasks(page, maskSelectors, targetSelector);

            const shouldFullPage = Boolean(
              opts.fullPage || (refKind === 'screenshot' && route.reference?.region !== 'viewport')
            );
            let selBox = null;
            if (targetSelector && !shouldFullPage) {
              const loc = page.locator(targetSelector).first();
              if ((await loc.count()) > 0) {
                selBox = await loc.boundingBox();
              }
            }

            let actualLandmarks = null;
            if (mode === 'wireframe') {
              const lmSelectors = String(opts.landmarks || 'header,nav,main,footer')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              actualLandmarks = await page.evaluate((selectors) => {
                const results = [];
                for (const sel of selectors) {
                  const els = Array.from(document.querySelectorAll(sel));
                  let idx = 0;
                  for (const el of els) {
                    const style = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect();
                    if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) continue;
                    results.push({
                      selector: sel,
                      index: idx++,
                      x: Math.round(rect.x),
                      y: Math.round(rect.y),
                      width: Math.round(rect.width),
                      height: Math.round(rect.height),
                    });
                  }
                }
                return results;
              }, lmSelectors);
            }

            await page.screenshot({ path: actualPath, fullPage: shouldFullPage });
            if (selBox && !shouldFullPage) {
              cropPng(actualPath, selBox, dpr);
            }

            if (bundleDir && config.target?.kind !== 'wordpress') {
              const styleRes = await runStyleParity({ page, bundleDir, tier });
              if (styleRes.style) {
                lastStyleMeta = styleRes.style;
              }
              if (styleRes.findings.length > 0) {
                gate2Findings.push(...styleRes.findings);
                if (styleRes.findings.some((f) => f.severity === 'fail')) {
                  allChecksPassed = false;
                }
              }
            }

            await targetContext.close();

            const isAdvisoryTier = tier === 'B' || tier === 'C';
            const routeMaxDiff = route.reference?.maxDiff !== undefined
              ? Number(route.reference.maxDiff)
              : (isAdvisoryTier ? 20 : effectiveMaxDiff);

            let resolvedSidecar = null;
            if (mode === 'wireframe' && expectedLandmarksPath) {
              resolvedSidecar = resolveExpectedLandmarks(null, expectedLandmarksPath);
            }

            const vis = compareVisual({
              refImg,
              actualPath,
              outDir: checkDir,
              threshold: effectiveThreshold,
              maxDiff: routeMaxDiff,
              mode,
              maskBoxes,
              dpr,
              fullPage: shouldFullPage,
              wireframe: mode === 'wireframe'
                ? {
                    actualLandmarks,
                    expectedLandmarks: resolvedSidecar ? resolvedSidecar.data : null,
                    hasSidecar: Boolean(resolvedSidecar?.found),
                    tolerance: 4,
                  }
                : null,
            });

            if (isAdvisoryTier) {
              const simPct = vis.mismatchPct !== null ? Number((100 - vis.mismatchPct).toFixed(4)) : 100;
              const threshPct = Number((100 - routeMaxDiff).toFixed(4));
              lastAdvisory = {
                similarityPct: simPct,
                thresholdPct: threshPct,
                met: simPct >= threshPct,
              };
              const hasDimensionFail = (vis.findings || []).some((f) => f.id.includes('dimension') || f.id.includes('height'));
              if (hasDimensionFail) allChecksPassed = false;
              for (const f of vis.findings || []) {
                const isDim = f.id.includes('dimension') || f.id.includes('height');
                const fid = f.id.startsWith('gate2.landmark.') ? f.id : `${f.id}.${route.id}.${vp.name}`; gate2Findings.push({ ...f, severity: isDim ? 'fail' : 'info', id: fid });
              }
            } else if (!vis.passed) {
              allChecksPassed = false;
              for (const f of vis.findings || []) {
                gate2Findings.push({ ...f, id: `${f.id}.${route.id}.${vp.name}` });
              }
            }

            checks.push({
              route: route.id,
              viewport: vp.name,
              reference: path.relative(cwd, refPath),
              actual: vis.artifacts?.actual,
              thresholdPct: Number((100 - routeMaxDiff).toFixed(4)),
              referenceKind: refKind,
              tier,
              ...(targetSelector ? { selector: targetSelector } : {}),
              passed: isAdvisoryTier ? true : vis.passed,
              mismatchPct: vis.mismatchPct,
            });
            lastMismatchPct = vis.mismatchPct;
            lastArtifacts = {
              actual: toRelArtifact(vis.artifacts?.actual),
              diff: toRelArtifact(vis.artifacts?.diff),
              composite: toRelArtifact(vis.artifacts?.composite),
              reference: refRel,
              ...(lastCaptureHtml ? { captureHtml: lastCaptureHtml } : {}),
            };
          }
        }

        if (checks.length > 0 || gate2Findings.length > 0) {
          gate2Result = {
            passed: allChecksPassed,
            skipped: false,
            mode,
            mismatchPct: lastMismatchPct,
            checks,
            findings: gate2Findings,
            artifacts: lastArtifacts || (lastCaptureHtml ? { captureHtml: lastCaptureHtml } : null),
            capture: { serviceWorkers: 'block' },
            ...(lastAdvisory ? { advisory: lastAdvisory } : {}),
            ...(lastStyleMeta ? { style: lastStyleMeta } : {}),
          };
        } else {
          gate2Result = {
            passed: true,
            skipped: true,
            reason: 'No matching reference PNGs for configured routes',
            artifacts: lastCaptureHtml ? { captureHtml: lastCaptureHtml } : null,
            capture: { serviceWorkers: 'block' },
          };
        }

        if (config.acceptance) {
          const intakeFindings = checkAcceptanceMapping(cwd, config.acceptance, scenariosList);
          gate3Result = {
            passed: intakeFindings.length === 0,
            skipped: false,
            findings: intakeFindings,
          };
        }

        // Dual-run functional parity (M2b.2 / SIDE-29)
        const behavioralRoute = config.routes.find((r) => {
          const k = r.reference?.kind || 'png';
          return k === 'html-file' || k === 'url';
        });
        const onlyScreenshot = config.routes.length > 0 && config.routes.every((r) => (r.reference?.kind || 'png') === 'screenshot');

        if (onlyScreenshot) {
          gate3Result = {
            ...(gate3Result || { passed: true, skipped: false, findings: [] }),
            parity: { skipped: true, reason: 'reference has no behavior' },
          };
        } else if (behavioralRoute && scenariosList.length > 0) {
          const refKind = behavioralRoute.reference.kind;
          let refServer = null;
          let refUrl = behavioralRoute.reference.source;
          let harPath = null;
          try {
            if (refKind === 'html-file') {
              refServer = await startStaticServer({ file: path.resolve(cwd, behavioralRoute.reference.source) });
              refUrl = refServer.baseUrl;
            } else if (refKind === 'url') {
              const bDir = getBundleDir(cwd, behavioralRoute.id, config.viewports[0].name);
              const candidateHar = path.join(bDir, '.har');
              if (fs.existsSync(candidateHar)) harPath = candidateHar;
            }
            const parityRes = await runParityComparison({
              browser,
              scenarios: scenariosList,
              referenceUrl: refUrl,
              targetUrl: effectiveBaseUrl,
              harPath,
              viewport: { width: config.viewports[0].width, height: config.viewports[0].height },
              dpr,
              outDir: safeOutDir,
              cwd,
              maxDiff: effectiveMaxDiff,
              threshold: effectiveThreshold,
              applyNetworkPolicy,
              allowNetwork: config.allowNetwork || [],
            });
            gate3Result = {
              passed: (gate3Result ? gate3Result.passed : true) && parityRes.passed,
              skipped: false,
              scenarios: parityRes.scenarios,
              parity: parityRes.parity,
              findings: [...(gate3Result?.findings || []), ...parityRes.findings],
            };
          } finally {
            if (refServer) await refServer.close();
          }
        } else if (!onlyScreenshot && scenariosList.length > 0) {
          const scenPage = await browser.newPage({
            viewport: { width: config.viewports[0].width, height: config.viewports[0].height },
            deviceScaleFactor: dpr,
          });
          await applyNetworkPolicy(scenPage, effectiveBaseUrl, config.allowNetwork);
          const scenResults = [];
          const scenFindings = [...(gate3Result?.findings || [])];
          let scenAllOk = gate3Result ? gate3Result.passed : true;
          for (const sc of scenariosList) {
            const sr = await runScenario({
              page: scenPage,
              scenario: sc,
              baseUrl: effectiveBaseUrl,
              outDir: safeOutDir,
              cwd,
              defaultTimeoutMs: timeoutMs,
            });
            scenResults.push(sr.scenarioReport);
            scenFindings.push(...sr.findings);
            if (!sr.passed) scenAllOk = false;
          }
          await scenPage.close();
          gate3Result = {
            passed: scenAllOk,
            skipped: false,
            scenarios: scenResults,
            findings: scenFindings,
          };
        }
      }

      await browser.close();
      browser = null;
    } finally {
      if (activeTarget) {
        await activeTarget.close();
      }
    }
  }

  if (visionEnabled && parsedVerdict) {
    const verdictSeverity = visionBlocking && parsedVerdict.passed === false ? 'fail' : 'info';
    const verdictFinding = {
      id: 'gate2.vision-verdict',
      gate: 'gate2',
      severity: verdictSeverity,
      selector: '',
      box: null,
      text: parsedVerdict.text,
    };
    if (!gate2Result) {
      gate2Result = { passed: true, skipped: true, reason: 'No Gate 2 check ran', findings: [] };
    }
    gate2Result.findings = [...(gate2Result.findings || []), verdictFinding];
    if (verdictSeverity === 'fail') {
      gate2Result.passed = false;
    }
  }

  const durationMs = Date.now() - startMs;
  const g1Ok = gate1Result ? gate1Result.passed : true;
  const g2Ok = gate2Result ? gate2Result.passed : true;
  const g3Ok = gate3Result ? gate3Result.passed : true;
  const passed = Boolean(g1Ok && g2Ok && g3Ok);

  const preReport = buildReport({
    passed,
    iteration,
    durationMs,
    gate1Result,
    gate2Result,
    gate3Result,
  });

  const loop = computeLoop({
    outDir: safeOutDir,
    runId,
    iteration,
    passed: preReport.passed,
    findings: preReport.findings,
    mismatchPct: gate2Result?.mismatchPct ?? null,
    advisory: gate2Result?.advisory ?? null,
  });

  const report = buildReport({
    passed,
    iteration,
    durationMs,
    gate1Result,
    gate2Result,
    gate3Result,
    loop,
  });

  const telemetryPath = recordTelemetry(outRel, {
    runId,
    url: opts.url || config?.baseUrl || '',
    mode,
    dpr,
    iteration,
    passed: report.passed,
    gate1Passed: Boolean(report.gates.gate1?.passed),
    gate2Passed: Boolean(report.gates.gate2?.passed),
    mismatchPct: gate2Result?.mismatchPct ?? null,
    similarityPct: gate2Result?.advisory?.similarityPct ?? null,
    durationMs: report.durationMs,
    failCount: report.findings.filter((f) => f.severity === 'fail').length,
    failIds: report.findings.filter((f) => f.severity === 'fail').map((f) => f.id),
    findingIds: report.findings.map((f) => f.id),
    model: opts.model,
    harness: opts.harness,
  });

  report.telemetry = telemetryPath;
  report.artifacts = { ...(report.artifacts || {}), telemetry: telemetryPath };

  fs.writeSync(1, redactSecrets(JSON.stringify(report, null, 2)) + '\n');
  process.exit(report.exitCode);
} catch (err) {
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }
  const durationMs = Date.now() - startMs;
  const errMsg = redactSecrets(err.message || String(err));
  const parsedIter = Number(opts.iteration);
  const safeIter = Number.isInteger(parsedIter) && parsedIter >= 1 && parsedIter <= 5 ? parsedIter : iteration;
  const safeRunId = runId || resolveRunId(opts.runId, null);

  const preFailureReport = buildReport({
    passed: false,
    iteration: safeIter,
    durationMs,
    errorMessage: errMsg,
    gate1Result,
    gate2Result,
    gate3Result,
  });

  const loop = computeLoop({
    outDir: safeOutDir,
    runId: safeRunId,
    iteration: safeIter,
    passed: false,
    errorMessage: errMsg,
    findings: preFailureReport.findings,
    blocked: true,
  });

  const failureReport = buildReport({
    passed: false,
    iteration: safeIter,
    durationMs,
    errorMessage: errMsg,
    gate1Result,
    gate2Result,
    gate3Result,
    loop,
  });

  let telemetryPath = null;
  if (safeOutDir) {
    try {
      telemetryPath = recordTelemetry(toRelArtifact(safeOutDir), {
        runId: safeRunId,
        url: opts.url || '',
        mode,
        dpr,
        iteration: safeIter,
        passed: false,
        gate1Passed: Boolean(failureReport.gates.gate1?.passed),
        gate2Passed: Boolean(failureReport.gates.gate2?.passed),
        mismatchPct: null,
        durationMs: failureReport.durationMs,
        error: errMsg,
        failCount: failureReport.findings.filter((f) => f.severity === 'fail').length,
        failIds: failureReport.findings.filter((f) => f.severity === 'fail').map((f) => f.id),
        findingIds: failureReport.findings.map((f) => f.id),
        model: opts.model,
        harness: opts.harness,
      });
    } catch {}
  }

  failureReport.telemetry = telemetryPath;
  if (telemetryPath) {
    failureReport.artifacts = { ...(failureReport.artifacts || {}), telemetry: telemetryPath };
  }

  fs.writeSync(1, redactSecrets(JSON.stringify(failureReport, null, 2)) + '\n');
  process.exit(failureReport.exitCode);
}
