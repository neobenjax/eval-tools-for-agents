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

const startMs = Date.now();
const cwd = process.cwd();
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

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
  const report = buildReport({
    passed: false,
    iteration: parsedIter,
    durationMs: Date.now() - startMs,
    errorMessage: err?.message || String(err),
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
  return {
    passed: Boolean(base.passed && next.passed),
    viewport: next.viewport || base.viewport,
    consoleErrors: [...(base.consoleErrors || []), ...(next.consoleErrors || [])],
    networkErrors: [...(base.networkErrors || []), ...(next.networkErrors || [])],
    horizontalOverflow: Boolean(base.horizontalOverflow || next.horizontalOverflow),
    overflowingElements: [...(base.overflowingElements || []), ...(next.overflowingElements || [])],
    clippedTextElements: [...(base.clippedTextElements || []), ...(next.clippedTextElements || [])],
    overlappingSiblings: [...(base.overlappingSiblings || []), ...(next.overlappingSiblings || [])],
    brokenImages: [...(base.brokenImages || []), ...(next.brokenImages || [])],
  };
}

try {
  const iterRaw = String(opts.iteration ?? '1').trim();
  const parsedIteration = Number(iterRaw);
  if (!/^\d+$/.test(iterRaw) || !Number.isInteger(parsedIteration) || parsedIteration < 1 || parsedIteration > 5) {
    throw new Error(`Invalid --iteration "${opts.iteration}": must be an integer between 1 and 5.`);
  }
  iteration = parsedIteration;

  safeOutDir = resolveSafeOutDir(cwd, opts.out, { allowTestDir: Boolean(opts.url && !opts.config) });
  const outRel = toRelArtifact(safeOutDir);

  const loaded = opts.config || !opts.url ? loadProjectConfig(cwd, opts.config || null) : null;
  if (!opts.url && !loaded) {
    throw new Error('No --url provided and pixel-gate.config.json not found in current directory.');
  }
  const config = loaded?.config || null;

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
        const report = buildReport({
          passed: false,
          iteration,
          durationMs,
          errorMessage: errorMsg,
          gate1Result: null,
          gate2Result,
        });
        const telemetryPath = recordTelemetry(outRel, {
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
  } else {
    // Config-driven run (routes x viewports, intake mapping, optional --scenario)
    process.chdir(safeOutDir);
    try {
      browser = await chromium.launch({
        args: ['--disable-logging', `--log-file=${path.join(safeOutDir, 'chromium.log')}`],
        env: { ...process.env, CHROME_LOG_FILE: path.join(safeOutDir, 'chromium.log') },
      });
    } finally {
      process.chdir(cwd);
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
      await applyNetworkPolicy(page, config.baseUrl, config.allowNetwork);
      const scenRes = await runScenario({
        page,
        scenario: targetScenario,
        baseUrl: config.baseUrl,
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

      for (const route of config.routes) {
        const routeUrl = new URL(route.path, config.baseUrl).toString();
        const routeMasks = Array.isArray(route.masks) ? route.masks : (config.masks || []);
        const maskSelectors = isExplicit('mask')
          ? opts.mask.split(',').map((s) => s.trim()).filter(Boolean)
          : routeMasks;

        for (const vp of config.viewports) {
          const refPath = resolveKeyedReferencePath(cwd, config.references, route.id, vp.name);
          const refRel = toRelArtifact(refPath);

          if (!fs.existsSync(refPath)) {
            if (route.referenceRequired !== false) {
              allChecksPassed = false;
              gate2Findings.push({
                id: `gate2.missing-reference.${route.id}.${vp.name}`,
                gate: 'gate2',
                severity: 'fail',
                selector: '',
                box: null,
                text: `Missing required reference PNG at ${refRel}`,
              });
            }
            continue;
          }

          const refImg = readReferencePng(refPath);
          const page = await browser.newPage({
            viewport: { width: vp.width, height: vp.height },
            deviceScaleFactor: dpr,
          });
          const abortedUrls = await applyNetworkPolicy(page, config.baseUrl, config.allowNetwork);
          const { consoleErrors, networkErrors } = attachRuntimeListeners(page);

          await page.goto(routeUrl, { waitUntil: 'networkidle', timeout: timeoutMs });
          await freezePage(page);

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
          const maskBoxes = await collectMasks(page, maskSelectors, null);
          await page.screenshot({ path: actualPath, fullPage: Boolean(opts.fullPage) });
          await page.close();

          const vis = compareVisual({
            refImg,
            actualPath,
            outDir: checkDir,
            threshold: effectiveThreshold,
            maxDiff: effectiveMaxDiff,
            mode,
            maskBoxes,
            dpr,
            fullPage: Boolean(opts.fullPage),
          });

          if (!vis.passed) {
            allChecksPassed = false;
            for (const f of vis.findings || []) {
              gate2Findings.push({ ...f, id: `${f.id}.${route.id}.${vp.name}` });
            }
          }

          checks.push({
            route: route.id,
            viewport: vp.name,
            reference: refRel,
            passed: vis.passed,
            mismatchPct: vis.mismatchPct,
          });
          lastMismatchPct = vis.mismatchPct;
          lastArtifacts = {
            actual: toRelArtifact(vis.artifacts?.actual),
            diff: toRelArtifact(vis.artifacts?.diff),
            composite: toRelArtifact(vis.artifacts?.composite),
            reference: refRel,
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
          artifacts: lastArtifacts,
        };
      } else {
        gate2Result = { passed: true, skipped: true, reason: 'No matching reference PNGs for configured routes' };
      }

      if (config.acceptance) {
        const intakeFindings = checkAcceptanceMapping(cwd, config.acceptance, scenariosList);
        gate3Result = {
          passed: intakeFindings.length === 0,
          skipped: false,
          findings: intakeFindings,
        };
      }
    }

    await browser.close();
    browser = null;
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

  const report = buildReport({
    passed,
    iteration,
    durationMs,
    gate1Result,
    gate2Result,
    gate3Result,
  });

  const telemetryPath = recordTelemetry(outRel, {
    url: opts.url || config?.baseUrl || '',
    mode,
    dpr,
    iteration,
    passed: report.passed,
    gate1Passed: Boolean(report.gates.gate1?.passed),
    gate2Passed: Boolean(report.gates.gate2?.passed),
    mismatchPct: gate2Result?.mismatchPct ?? null,
    durationMs: report.durationMs,
    findingIds: report.findings.map((f) => f.id),
    model: opts.model,
    harness: opts.harness,
  });

  report.telemetry = telemetryPath;
  report.artifacts = { ...(report.artifacts || {}), telemetry: telemetryPath };

  fs.writeSync(1, JSON.stringify(report, null, 2) + '\n');
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
    gate3Result,
  });

  let telemetryPath = null;
  if (safeOutDir) {
    try {
      telemetryPath = recordTelemetry(toRelArtifact(safeOutDir), {
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

  fs.writeSync(1, JSON.stringify(failureReport, null, 2) + '\n');
  process.exit(failureReport.exitCode);
}
