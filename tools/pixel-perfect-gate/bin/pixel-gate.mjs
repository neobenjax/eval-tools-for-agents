#!/usr/bin/env node
/**
 * pixel-gate: Single-browser Playwright CLI for Gate 1 (Layout/Runtime) + Gate 2 (Visual Diff).
 * Designed for deterministic Agent Looping across Antigravity, Cursor, Claude Code, and CI.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { program } from 'commander';
import { attachRuntimeListeners, runLayoutAudit } from '../src/layout-audit.mjs';
import { readReferencePng, compareVisual, cropPng } from '../src/visual-diff.mjs';
import { recordTelemetry } from '../src/telemetry.mjs';
import { buildReport } from '../src/report.mjs';

const startMs = Date.now();

program
  .name('pixel-gate')
  .description('Single-browser Gate 1 (Layout/Runtime) + Gate 2 (Visual Diff) evaluator for AI Agent Looping.')
  .requiredOption('--url <url>', 'Target URL (e.g. http://localhost:3000)')
  .option('--ref <path>', 'Path to reference design PNG (omit for Gate 1 layout-only check)')
  .option('--mode <mode>', 'Visual comparison mode: pixel | wireframe', 'pixel')
  .option('--dpr <number>', 'Device pixel ratio (use 2 for @2x Figma exports)', '1')
  .option('--viewport <WxH>', 'Viewport WxH (defaults to --ref dimensions / --dpr, or 1440x900 when --ref is omitted; pass explicitly for element-sized --selector refs)', '1440x900')
  .option('--selector <css>', 'Optional CSS selector to crop comparison')
  .option('--mask <selectors>', 'Comma-separated CSS selectors to mask dynamic elements')
  .option('--landmarks <selectors>', 'Comma-separated landmark selectors for wireframe mode', 'header,nav,main,footer')
  .option('--ref-landmarks <path>', 'Optional JSON file of expected landmark boxes for wireframe mode')
  .option('--full-page', 'Capture full scrollable page instead of viewport', false)
  .option('--timeout <ms>', 'Navigation timeout in milliseconds', '20000')
  .option('--out <dir>', 'Output directory for screenshots, diff, and telemetry', '.visual-eval')
  .option('--threshold <number>', 'Pixelmatch color sensitivity (0-1)', '0.1')
  .option('--max-diff <number>', 'Max allowed mismatch percentage before failing', '0.5')
  .option('--iteration <number>', 'Current Agent Loop iteration (1-5)', '1')
  .option('--model <name>', 'Optional AI model identifier for telemetry', 'unknown')
  .option('--harness <name>', 'Optional harness identifier (antigravity|cursor|cli)', 'cli')
  .exitOverride();

let opts = {};
try {
  program.parse();
  opts = program.opts();
} catch (err) {
  if (err?.code === 'commander.helpDisplayed' || err?.code === 'commander.version') {
    process.exit(0);
  }
  const report = buildReport({
    passed: false,
    iteration: 1,
    durationMs: Date.now() - startMs,
    errorMessage: err?.message || String(err),
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.exitCode);
}

const mode = opts.mode === 'wireframe' ? 'wireframe' : 'pixel';

let browser = null;
let gate1Result = null;
let gate2Result = null;
let dpr = 1;
let iteration = 1;

function resolveExpectedLandmarks(refPath, refLandmarksPath) {
  if (refLandmarksPath) {
    if (!fs.existsSync(refLandmarksPath)) {
      throw new Error(`Reference landmarks file not found: ${refLandmarksPath}`);
    }
    return { data: JSON.parse(fs.readFileSync(refLandmarksPath, 'utf8')), found: true };
  }
  if (!refPath) return null;
  const parsed = path.parse(refPath);
  const candidates = [
    path.join(parsed.dir, `${parsed.name}.landmarks.json`),
    `${refPath}.landmarks.json`,
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { data: JSON.parse(fs.readFileSync(candidate, 'utf8')), found: true };
    }
  }
  return null;
}

try {
  const iterRaw = String(opts.iteration ?? '1').trim();
  const parsedIteration = Number(iterRaw);
  if (!/^\d+$/.test(iterRaw) || !Number.isInteger(parsedIteration) || parsedIteration < 1 || parsedIteration > 5) {
    throw new Error(`Invalid --iteration "${opts.iteration}": must be an integer between 1 and 5.`);
  }
  iteration = parsedIteration;

  const dprRaw = String(opts.dpr ?? '1').trim();
  const parsedDpr = Number(dprRaw);
  if (!/^\d+$/.test(dprRaw) || !Number.isInteger(parsedDpr) || parsedDpr < 1) {
    throw new Error(`Invalid --dpr "${opts.dpr}": must be a positive integer.`);
  }
  dpr = parsedDpr;

  const timeoutMs = Number(opts.timeout) > 0 ? Number(opts.timeout) : 20000;

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
      gate2Result = {
        passed: false,
        mode,
        error: `Dimension finding: Reference dimensions ${refImg.width}x${refImg.height} are not divisible by --dpr ${dpr}.`,
        dimensions: `${refImg.width}x${refImg.height}`,
      };
      throw new Error(
        `Dimension finding: Reference dimensions ${refImg.width}x${refImg.height} are not divisible by --dpr ${dpr}.`
      );
    }
    const viewportExplicit = program.getOptionValueSource('viewport') !== 'default';
    if (!viewportExplicit) {
      viewportWidth = refImg.width / dpr;
      viewportHeight = refImg.height / dpr;
    }
  }

  fs.mkdirSync(opts.out, { recursive: true });
  const actualPath = path.join(opts.out, 'actual.png');

  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor: dpr,
  });

  const { consoleErrors, networkErrors } = attachRuntimeListeners(page);

  await page.goto(opts.url, { waitUntil: 'networkidle', timeout: timeoutMs });
  await page.evaluate(() => document.fonts.ready);

  // Freeze animations, transitions, and blinking carets for deterministic capture
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
    }`,
  });

  // Gate 1: Layout & Runtime Audit
  const domAudit = await runLayoutAudit(page);
  const g1Issues = domAudit.issues;
  const gate1Passed =
    consoleErrors.length === 0 &&
    networkErrors.length === 0 &&
    !g1Issues.horizontalOverflow &&
    g1Issues.overflowingElements.length === 0 &&
    g1Issues.clippedTextElements.length === 0 &&
    g1Issues.overlappingSiblings.length === 0 &&
    g1Issues.brokenImages.length === 0;

  gate1Result = {
    passed: gate1Passed,
    viewport: domAudit.viewport,
    consoleErrors,
    networkErrors,
    ...g1Issues,
  };

  // Compute mask bounding boxes before screenshot
  const maskBoxes = [];
  const maskLocators = [];
  if (opts.mask) {
    const selectors = opts.mask.split(',').map((s) => s.trim()).filter(Boolean);
    let offsetBox = { x: 0, y: 0 };
    if (opts.selector) {
      const parentLocator = page.locator(opts.selector).first();
      await parentLocator.waitFor({ state: 'visible', timeout: 5000 });
      const parentBox = await parentLocator.boundingBox();
      if (parentBox) offsetBox = parentBox;
    }

    for (const sel of selectors) {
      const locs = page.locator(sel);
      const count = await locs.count();
      for (let i = 0; i < count; i++) {
        const loc = locs.nth(i);
        maskLocators.push(loc);
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
  }

  // Gate 2: Capture Screenshot
  if (opts.ref) {
    let selBox = null;
    if (opts.selector) {
      const locator = page.locator(opts.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      selBox = await locator.boundingBox();
    }

    await page.screenshot({
      path: actualPath,
      fullPage: Boolean(opts.fullPage),
    });

    if (opts.selector && selBox) {
      const actualRaw = PNG.sync.read(fs.readFileSync(actualPath));
      const cropX = Math.round(selBox.x * dpr);
      const cropY = Math.round(selBox.y * dpr);
      const elemW = Math.round(selBox.width * dpr);
      const elemH = Math.round(selBox.height * dpr);

      const croppedActual = cropPng(actualRaw, cropX, cropY, elemW, elemH);
      fs.writeFileSync(actualPath, PNG.sync.write(croppedActual));

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
          if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
            continue;
          }
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

  gate2Result = { passed: true, skipped: true, reason: 'No --ref image provided' };
  if (opts.ref && refImg) {
    const resolvedSidecar = mode === 'wireframe' ? resolveExpectedLandmarks(opts.ref, opts.refLandmarks) : null;
    gate2Result = compareVisual({
      refImg,
      actualPath,
      outDir: opts.out,
      threshold: Number(opts.threshold),
      maxDiff: Number(opts.maxDiff),
      mode,
      maskBoxes,
      dpr,
      fullPage: Boolean(opts.fullPage),
      wireframe: mode === 'wireframe' ? {
        actualLandmarks,
        expectedLandmarks: resolvedSidecar ? resolvedSidecar.data : null,
        hasSidecar: Boolean(resolvedSidecar?.found),
        tolerance: 4,
      } : null,
    });
    gate2Result.artifacts = { ...gate2Result.artifacts, reference: opts.ref };
  }

  const durationMs = Date.now() - startMs;
  const passed = Boolean(gate1Result?.passed && gate2Result?.passed);

  const report = buildReport({
    passed,
    iteration,
    durationMs,
    gate1Result,
    gate2Result,
  });

  const telemetryPath = recordTelemetry(opts.out, {
    url: opts.url,
    mode,
    dpr,
    iteration,
    passed: report.passed,
    gate1Passed: Boolean(gate1Result?.passed),
    gate2Passed: Boolean(gate2Result?.passed),
    mismatchPct: gate2Result?.mismatchPct ?? null,
    durationMs: report.durationMs,
    findingIds: report.findings.map((f) => f.id),
    model: opts.model,
    harness: opts.harness,
  });

  report.telemetry = telemetryPath;
  report.artifacts = { ...(report.artifacts || {}), telemetry: telemetryPath };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.exitCode);
} catch (err) {
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }
  const durationMs = Date.now() - startMs;
  const errMsg = err.message || String(err);
  const parsedIter = Number(opts.iteration);
  const safeIter = Number.isInteger(parsedIter) ? parsedIter : iteration;

  const failureReport = buildReport({
    passed: false,
    iteration: safeIter,
    durationMs,
    errorMessage: errMsg,
    gate1Result,
    gate2Result,
  });

  let telemetryPath = null;
  try {
    telemetryPath = recordTelemetry(opts.out, {
      url: opts.url,
      mode,
      dpr,
      iteration: safeIter,
      passed: false,
      gate1Passed: Boolean(gate1Result?.passed),
      gate2Passed: false,
      mismatchPct: null,
      durationMs: failureReport.durationMs,
      error: errMsg,
      findingIds: failureReport.findings.map((f) => f.id),
      model: opts.model,
      harness: opts.harness,
    });
  } catch {}

  failureReport.telemetry = telemetryPath;
  if (telemetryPath) {
    failureReport.artifacts = { ...(failureReport.artifacts || {}), telemetry: telemetryPath };
  }

  console.log(JSON.stringify(failureReport, null, 2));
  process.exit(failureReport.exitCode);
}
