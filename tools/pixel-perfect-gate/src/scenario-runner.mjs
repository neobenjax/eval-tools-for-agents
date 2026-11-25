import path from 'node:path';

/**
 * Gate 3 Scenario Runner (`src/scenario-runner.mjs`).
 * Executes ordered steps: goto, click, fill, toggle, wait.
 * Stops on first failed step and captures a failure screenshot under `.visual-eval/`.
 */
export async function runScenario({ page, scenario, baseUrl, outDir, cwd, defaultTimeoutMs = 5000 }) {
  const stepResults = [];
  const findings = [];
  let scenarioPassed = true;

  const steps = Array.isArray(scenario?.steps) ? scenario.steps : [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepNum = i + 1;
    const action = step?.action;
    const timeout = Number(step?.timeoutMs) > 0 ? Number(step.timeoutMs) : defaultTimeoutMs;

    try {
      if (action === 'goto') {
        const targetUrl = new URL(step.url, baseUrl).toString();
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout });
      } else if (action === 'click') {
        await page.locator(step.selector).first().click({ timeout });
      } else if (action === 'fill') {
        await page.locator(step.selector).first().fill(String(step.value ?? ''), { timeout });
      } else if (action === 'toggle') {
        await page.locator(step.selector).first().click({ timeout });
      } else if (action === 'wait') {
        if (step.selector) {
          await page.locator(step.selector).first().waitFor({
            state: step.state || 'visible',
            timeout,
          });
        } else {
          await page.waitForTimeout(Number(step.ms) || 0);
        }
      } else {
        throw new Error(`Unknown scenario action "${action}"`);
      }

      stepResults.push({ action, passed: true });
    } catch (err) {
      scenarioPassed = false;
      stepResults.push({ action, passed: false });

      const shotAbs = path.join(outDir, `scenario-${scenario.id}-step-${stepNum}.png`);
      await page.screenshot({ path: shotAbs }).catch(() => {});
      const shotRel = path.relative(cwd, shotAbs).split(path.sep).join('/');

      let box = null;
      if (step?.selector) {
        const rawBox = await page.locator(step.selector).first().boundingBox({ timeout: 250 }).catch(() => null);
        if (rawBox) {
          box = {
            x: Math.round(rawBox.x),
            y: Math.round(rawBox.y),
            width: Math.round(rawBox.width),
            height: Math.round(rawBox.height),
          };
        }
      }

      findings.push({
        id: `gate3.scenario.${scenario.id}.${stepNum}`,
        gate: 'gate3',
        severity: 'fail',
        selector: step?.selector || '',
        action,
        screenshot: shotRel,
        box,
        text: `Scenario "${scenario.id}" step ${stepNum} (${action}${step?.selector ? ` ${step.selector}` : ''}) failed: ${err?.message || String(err)}`,
      });
      break;
    }
  }

  return {
    passed: scenarioPassed,
    scenarioReport: {
      id: scenario.id,
      passed: scenarioPassed,
      steps: stepResults,
    },
    findings,
  };
}
