/**
 * Dual-run functional parity runner (SPEC.md §12.5, M2b.2 / SIDE-29).
 * Executes scenario steps in separate fresh contexts for reference and target,
 * compares step outcomes and post-step state screenshots, and enforces portable locators.
 */
import fs from 'node:fs';
import path from 'node:path';
import { compareVisual, readReferencePng } from './visual-diff.mjs';

function resolvePlaywrightLocator(page, step) {
  if (step.locator && typeof step.locator === 'object') {
    const { method, role, name, text, testId, label } = step.locator;
    if (method === 'getByRole') {
      return page.getByRole(role, name !== undefined ? { name } : undefined);
    }
    if (method === 'getByText') {
      return page.getByText(text);
    }
    if (method === 'getByTestId') {
      return page.getByTestId(testId);
    }
    if (method === 'getByLabel') {
      return page.getByLabel(label);
    }
  }
  if (step.selector) {
    return page.locator(step.selector);
  }
  return null;
}

async function execParityStep(page, step, baseUrl, timeoutMs = 5000) {
  const action = step.action;
  if (action === 'goto') {
    const targetUrl = step.url && /^https?:\/\//i.test(step.url)
      ? step.url
      : new URL(step.url || '/', baseUrl).toString();
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: timeoutMs });
    return { ok: true };
  }
  if (action === 'wait') {
    if (step.ms) {
      await page.waitForTimeout(Number(step.ms));
      return { ok: true };
    }
    if (step.selector || step.locator) {
      const loc = resolvePlaywrightLocator(page, step).first();
      await loc.waitFor({ state: step.state || 'visible', timeout: step.timeoutMs || timeoutMs });
      return { ok: true };
    }
    return { ok: true };
  }

  const loc = resolvePlaywrightLocator(page, step);
  if (!loc) {
    return { ok: false, missingLocator: true, error: `Step "${action}" missing selector or locator` };
  }
  const first = loc.first();
  const count = await loc.count();
  if (count === 0) {
    return { ok: false, missingLocator: true, error: `Locator not found: ${step.selector || JSON.stringify(step.locator)}` };
  }

  await first.waitFor({ state: 'visible', timeout: step.timeoutMs || timeoutMs });
  if (action === 'click') {
    await first.click({ timeout: step.timeoutMs || timeoutMs });
  } else if (action === 'fill') {
    await first.fill(String(step.value ?? ''), { timeout: step.timeoutMs || timeoutMs });
  } else if (action === 'toggle') {
    await first.click({ timeout: step.timeoutMs || timeoutMs });
  } else {
    return { ok: false, error: `Unsupported parity action "${action}"` };
  }
  return { ok: true };
}

export async function runParityComparison({
  browser,
  scenarios,
  referenceUrl,
  targetUrl,
  harPath = null,
  viewport = { width: 400, height: 300 },
  dpr = 1,
  outDir,
  cwd,
  maxDiff = 0.5,
  threshold = 0.1,
  applyNetworkPolicy,
  allowNetwork = [],
}) {
  const findings = [];
  const scenarioResults = [];
  let referenceSaw = 'none';
  let targetSaw = 'none';

  const parityDir = path.join(outDir, 'parity');
  fs.mkdirSync(parityDir, { recursive: true });

  for (const scenario of scenarios) {
    const refCtx = await browser.newContext({
      viewport,
      deviceScaleFactor: dpr,
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });
    const tgtCtx = await browser.newContext({
      viewport,
      deviceScaleFactor: dpr,
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });

    const stepsOut = [];
    let scenarioPassed = true;

    try {
      const refPage = await refCtx.newPage();
      const tgtPage = await tgtCtx.newPage();

      if (harPath && fs.existsSync(harPath)) {
        await refCtx.routeFromHAR(harPath, { url: '**/*', update: false, notFound: 'fallback' });
      }
      if (applyNetworkPolicy) {
        const refAllowed = [...allowNetwork];
        try { refAllowed.push(new URL(referenceUrl).origin); } catch {}
        const tgtAllowed = [...allowNetwork];
        try { tgtAllowed.push(new URL(targetUrl).origin); } catch {}
        await applyNetworkPolicy(refPage, referenceUrl, refAllowed);
        await applyNetworkPolicy(tgtPage, targetUrl, tgtAllowed);
      }

      refPage.on('request', (req) => {
        try {
          const u = new URL(req.url());
          if (u.pathname === '/__storage' && u.searchParams.has('v')) {
            const v = u.searchParams.get('v');
            if (v && v !== 'none') referenceSaw = v;
          }
        } catch {}
      });
      tgtPage.on('request', (req) => {
        try {
          const u = new URL(req.url());
          if (u.pathname === '/__storage' && u.searchParams.has('v')) {
            targetSaw = u.searchParams.get('v') || 'none';
          }
        } catch {}
      });

      const steps = Array.isArray(scenario.steps) ? scenario.steps : [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepNum = i + 1;
        const stepSelector = step.selector || (step.locator ? `${step.locator.method}(${step.locator.name || step.locator.role || ''})` : '');

        let refRes;
        let tgtRes;
        const refTextBefore = await refPage.evaluate(() => document.body?.innerText?.trim() || '').catch(() => '');
        const tgtTextBefore = await tgtPage.evaluate(() => document.body?.innerText?.trim() || '').catch(() => '');
        try {
          refRes = await execParityStep(refPage, step, referenceUrl, step.timeoutMs || 5000);
        } catch (err) {
          refRes = { ok: false, error: err.message };
        }
        try {
          tgtRes = await execParityStep(tgtPage, step, targetUrl, step.timeoutMs || 5000);
        } catch (err) {
          tgtRes = { ok: false, error: err.message };
        }

        if (refRes.ok && !tgtRes.ok && tgtRes.missingLocator && step.selector && !step.locator) {
          scenarioPassed = false;
          findings.push({
            id: `gate3.parity-unportable-locator.${scenario.id}.${stepNum}`,
            gate: 'gate3',
            severity: 'fail',
            selector: stepSelector,
            box: null,
            text: `Unportable CSS selector "${step.selector}" resolved on reference but not on target at step ${stepNum} (${step.action}).`,
          });
          stepsOut.push({ action: step.action, passed: false });
          break;
        }

        if (refRes.ok !== tgtRes.ok) {
          scenarioPassed = false;
          findings.push({
            id: `gate3.parity.${scenario.id}.${stepNum}`,
            gate: 'gate3',
            severity: 'fail',
            selector: stepSelector,
            box: null,
            text: `Parity outcome mismatch at step ${stepNum} (${step.action}): reference=${refRes.ok}, target=${tgtRes.ok}.`,
          });
          stepsOut.push({ action: step.action, passed: false });
          break;
        }

        // Compare post-step visual state
        const stepOutDir = path.join(parityDir, `${scenario.id}-${stepNum}`);
        fs.mkdirSync(stepOutDir, { recursive: true });
        const refShotAbs = path.join(stepOutDir, 'ref.png');
        const tgtShotAbs = path.join(stepOutDir, 'actual.png');

        await refPage.screenshot({ path: refShotAbs });
        await tgtPage.screenshot({ path: tgtShotAbs });

        const refImg = readReferencePng(refShotAbs);
        const cmp = compareVisual({
          refImg,
          actualPath: tgtShotAbs,
          outDir: stepOutDir,
          dpr,
          threshold,
          maxDiff,
        });

        const refShotRel = path.relative(cwd, refShotAbs).split(path.sep).join('/');
        const tgtShotRel = path.relative(cwd, tgtShotAbs).split(path.sep).join('/');

        // Also check DOM/text change delta on non-goto steps
        const refTextAfter = await refPage.evaluate(() => document.body?.innerText?.trim() || '');
        const tgtTextAfter = await tgtPage.evaluate(() => document.body?.innerText?.trim() || '');
        const refChanged = refTextAfter !== refTextBefore;
        const tgtChanged = tgtTextAfter !== tgtTextBefore;

        if (step.action !== 'goto' && refChanged && !tgtChanged) {
          scenarioPassed = false;
          findings.push({
            id: `gate3.parity.${scenario.id}.${stepNum}`,
            gate: 'gate3',
            severity: 'fail',
            selector: stepSelector,
            box: null,
            text: `Target did not update state after ${step.action} at step ${stepNum}.`,
            referenceScreenshot: refShotRel,
            targetScreenshot: tgtShotRel,
          });
          stepsOut.push({ action: step.action, passed: false });
          break;
        }

        if (step.action !== 'goto' && cmp.mismatchPct > maxDiff) {
          scenarioPassed = false;
          findings.push({
            id: `gate3.parity-state.${scenario.id}.${stepNum}`,
            gate: 'gate3',
            severity: 'fail',
            selector: stepSelector,
            box: null,
            text: `Visual state mismatch (${cmp.mismatchPct}%) after ${step.action} at step ${stepNum}.`,
            referenceScreenshot: refShotRel,
            targetScreenshot: tgtShotRel,
          });
          stepsOut.push({ action: step.action, passed: false });
          break;
        }

        stepsOut.push({ action: step.action, passed: true });
      }

      if (referenceSaw === 'none') {
        const refLs = await refPage.evaluate(() => {
          try { return localStorage.getItem('pg') || 'none'; } catch { return 'none'; }
        });
        if (refLs && refLs !== 'none') referenceSaw = refLs;
      }
    } finally {
      await refCtx.close();
      await tgtCtx.close();
    }

    scenarioResults.push({
      id: scenario.id,
      passed: scenarioPassed,
      steps: stepsOut,
    });
  }

  return {
    passed: findings.every((f) => f.severity !== 'fail'),
    findings,
    scenarios: scenarioResults,
    parity: {
      passed: findings.every((f) => f.severity !== 'fail'),
      referenceSaw,
      targetSaw,
    },
  };
}
