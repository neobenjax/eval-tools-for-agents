/**
 * CDP-based PWA installability audit (SPEC.md §12.3, M2b.4 / SIDE-31).
 * Runs in a separate context with service workers allowed.
 */

export async function runPwaAudit(browser, url, applyNetworkPolicy, allowNetwork) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    if (applyNetworkPolicy) {
      await applyNetworkPolicy(page, url, allowNetwork);
    }
    const session = await context.newCDPSession(page);
    await session.send('Page.enable');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    const result = await session.send('Page.getInstallabilityErrors');
    const installabilityErrors = (result?.installabilityErrors || []).map((err) => err.errorId).filter(Boolean);
    const findings = installabilityErrors.map((errorId) => ({
      id: `gate1.pwa-installability.${errorId}`,
      gate: 'gate1',
      severity: 'fail',
      selector: '',
      box: null,
      text: `PWA installability error: ${errorId}`,
    }));
    return {
      pwa: {
        source: 'Page.getInstallabilityErrors',
        installabilityErrors,
      },
      findings,
    };
  } finally {
    await context.close();
  }
}
