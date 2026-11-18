#!/usr/bin/env node
/**
 * pixel-gate: Single-browser Playwright CLI for Gate 1 (Layout/Runtime) + Gate 2 (Visual Diff).
 * Designed for deterministic Agent Looping across Antigravity, Cursor, Claude Code, and CI.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { program } from 'commander';
import { attachRuntimeListeners, runLayoutAudit } from '../src/layout-audit.mjs';
import { readReferencePng, compareVisual } from '../src/visual-diff.mjs';
import { recordTelemetry } from '../src/telemetry.mjs';

program
  .name('pixel-gate')
  .description('Single-browser Gate 1 (Layout/Runtime) + Gate 2 (Visual Diff) evaluator for AI Agent Looping.')
  .requiredOption('--url <url>', 'Target URL (e.g. http://localhost:3000)')
  .option('--ref <path>', 'Path to reference design PNG (omit for Gate 1 layout-only check)')
  .option('--mode <mode>', 'Visual comparison mode: pixel | wireframe', 'pixel')
  .option('--dpr <number>', 'Device pixel ratio (use 2 for @2x Figma exports)', '1')
  .option('--viewport <WxH>', 'Fallback viewport when --ref is omitted', '1440x900')
  .option('--selector <css>', 'Optional CSS selector to crop comparison')
  .option('--mask <selectors>', 'Comma-separated CSS selectors to mask dynamic elements')
  .option('--full-page', 'Capture full scrollable page instead of viewport', false)
  .option('--out <dir>', 'Output directory for screenshots, diff, and telemetry', '.visual-eval')
  .option('--threshold <number>', 'Pixelmatch color sensitivity (0-1)', '0.1')
  .option('--max-diff <number>', 'Max allowed mismatch percentage before failing', '0.5')
  .option('--iteration <number>', 'Current Agent Loop iteration (1-5)', '1')
  .option('--model <name>', 'Optional AI model identifier for telemetry', 'unknown')
  .option('--harness <name>', 'Optional harness identifier (antigravity|cursor|cli)', 'cli')
  .parse();

const opts = program.opts();
const startMs = Date.now();
const dpr = Number(opts.dpr) || 1;
const mode = opts.mode === 'wireframe' ? 'wireframe' : 'pixel';

let refImg = null;
let viewportWidth = 1440;
let viewportHeight = 900;

if (opts.ref) {
  try {
    refImg = readReferencePng(opts.ref);
    viewportWidth = Math.round(refImg.width / dpr);
    viewportHeight = Math.round(refImg.height / dpr);
  } catch (err) {
    console.error(JSON.stringify({ passed: false, error: err.message }, null, 2));
    process.exit(1);
  }
} else {
  const [w, h] = opts.viewport.split('x').map(Number);
  if (w > 0 && h > 0) {
    viewportWidth = w;
    viewportHeight = h;
  }
}

fs.mkdirSync(opts.out, { recursive: true });
const actualPath = path.join(opts.out, 'actual.png');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: viewportWidth, height: viewportHeight },
  deviceScaleFactor: dpr,
});

const { consoleErrors, networkErrors } = attachRuntimeListeners(page);
let gate1Result;

try {
  await page.goto(opts.url, { waitUntil: 'networkidle', timeout: 20000 });
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

  // Gate 2: Capture Screenshot (in the same browser session)
  if (opts.ref) {
    const maskLocators = opts.mask
      ? opts.mask
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => page.locator(s))
      : [];

    if (opts.selector) {
      const locator = page.locator(opts.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      await locator.screenshot({ path: actualPath, mask: maskLocators });
    } else {
      await page.screenshot({
        path: actualPath,
        fullPage: Boolean(opts.fullPage),
        mask: maskLocators,
      });
    }
  }
} finally {
  await browser.close();
}

let gate2Result = { passed: true, skipped: true, reason: 'No --ref image provided' };
if (opts.ref && refImg) {
  gate2Result = compareVisual({
    refImg,
    actualPath,
    outDir: opts.out,
    threshold: Number(opts.threshold),
    maxDiff: Number(opts.maxDiff),
    mode,
  });
  gate2Result.artifacts = { ...gate2Result.artifacts, reference: opts.ref };
}

const durationMs = Date.now() - startMs;
const passed = gate1Result.passed && gate2Result.passed;

const telemetryPath = recordTelemetry(opts.out, {
  url: opts.url,
  mode,
  dpr,
  iteration: Number(opts.iteration),
  passed,
  gate1Passed: gate1Result.passed,
  gate2Passed: gate2Result.passed,
  mismatchPct: gate2Result.mismatchPct ?? null,
  durationMs,
  model: opts.model,
  harness: opts.harness,
});

const output = {
  passed,
  iteration: Number(opts.iteration),
  durationMs,
  gate1: gate1Result,
  gate2: gate2Result,
  telemetry: telemetryPath,
};

console.log(JSON.stringify(output, null, 2));
process.exit(passed ? 0 : 1);
