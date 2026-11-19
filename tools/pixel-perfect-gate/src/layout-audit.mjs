/**
 * Gate 1: Runtime Health & DOM Layout Geometry Audit.
 * Runs inside the same Playwright page session before Gate 2 visual capture.
 */

export function attachRuntimeListeners(page) {
  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ type: 'console.error', text: msg.text() });
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push({ type: 'pageerror', text: err.message });
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      networkErrors.push({ url: res.url(), status: res.status(), statusText: res.statusText() });
    }
  });

  page.on('requestfailed', (req) => {
    networkErrors.push({
      url: req.url(),
      status: 0,
      statusText: req.failure()?.errorText || 'requestfailed',
    });
  });

  return { consoleErrors, networkErrors };
}

export async function runLayoutAudit(page) {
  const domIssues = await page.evaluate(() => {
    const issues = {
      horizontalOverflow: false,
      overflowingElements: [],
      clippedTextElements: [],
      overlappingSiblings: [],
      brokenImages: [],
    };

    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    if (docWidth > winWidth) {
      issues.horizontalOverflow = true;
      issues.overflowingElements.push({
        selector: 'html',
        scrollWidth: docWidth,
        clientWidth: winWidth,
      });
    }

    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls =
        typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };

    const isVisible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    for (const el of document.querySelectorAll('body *')) {
      if (!isVisible(el)) continue;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      if (rect.right > winWidth + 1 && style.position !== 'fixed') {
        issues.overflowingElements.push({
          selector: describe(el),
          rightEdge: Math.round(rect.right),
          viewportWidth: winWidth,
        });
      }

      const isScrollableY = ['auto', 'scroll'].includes(style.overflowY);
      const isScrollableX = ['auto', 'scroll'].includes(style.overflowX);
      const hasEllipsis = style.textOverflow === 'ellipsis';
      const hasOnlyInlineChildren = Array.from(el.children).every((c) =>
        ['inline', 'inline-block'].includes(getComputedStyle(c).display)
      );

      if (
        !isScrollableY &&
        !isScrollableX &&
        !hasEllipsis &&
        (el.children.length === 0 || hasOnlyInlineChildren) &&
        el.textContent.trim().length > 0
      ) {
        if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) {
          issues.clippedTextElements.push({
            selector: describe(el),
            textPreview: el.textContent.trim().slice(0, 40),
            scrollSize: `${el.scrollWidth}x${el.scrollHeight}`,
            clientSize: `${el.clientWidth}x${el.clientHeight}`,
          });
        }
      }
    }

    // Sibling overlap check (respects data-allow-overlap)
    for (const parent of document.querySelectorAll('body *')) {
      if (!isVisible(parent) || parent.hasAttribute('data-allow-overlap')) continue;
      const children = Array.from(parent.children).filter((child) => {
        if (!isVisible(child) || child.hasAttribute('data-allow-overlap')) return false;
        const st = getComputedStyle(child);
        return st.position === 'static' || st.position === 'relative';
      });

      for (let i = 0; i < children.length; i++) {
        const r1 = children[i].getBoundingClientRect();
        for (let j = i + 1; j < children.length; j++) {
          const r2 = children[j].getBoundingClientRect();
          const overlapX = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
          const overlapY = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));
          if (overlapX > 2 && overlapY > 2) {
            issues.overlappingSiblings.push({
              parent: describe(parent),
              elA: describe(children[i]),
              elB: describe(children[j]),
              overlapPx: `${Math.round(overlapX)}x${Math.round(overlapY)}`,
            });
          }
        }
      }
    }

    for (const img of document.querySelectorAll('img')) {
      if (!img.complete || img.naturalWidth === 0) {
        issues.brokenImages.push({
          src: img.getAttribute('src') || '(no src)',
          alt: img.alt || '',
        });
      }
    }

    return { viewport: `${winWidth}x${window.innerHeight}`, issues };
  });

  return domIssues;
}
