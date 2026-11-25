/**
 * Gate 3 Static Interaction Audit (`src/interaction-audit.mjs`).
 * Rules:
 *  - no-accessible-name
 *  - dead-href
 *  - covered-target
 *  - no-label
 */

function slugifyId(text) {
  return String(text || 'element')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'element';
}

export async function runInteractionAudit(page) {
  const rawHits = await page.evaluate(() => {
    const hits = [];

    function isVisible(el) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function toBox(el) {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }

    function buildSelector(el) {
      if (el.id) {
        const escaped = CSS.escape(el.id);
        if (document.querySelectorAll(`#${escaped}`).length === 1) {
          return `#${escaped}`;
        }
      }
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === Node.ELEMENT_NODE && cur.tagName.toLowerCase() !== 'html') {
        const tag = cur.tagName.toLowerCase();
        if (cur.id) {
          const escaped = CSS.escape(cur.id);
          if (document.querySelectorAll(`#${escaped}`).length === 1) {
            parts.unshift(`#${escaped}`);
            break;
          }
        }
        let idx = 1;
        let sib = cur.previousElementSibling;
        while (sib) {
          if (sib.tagName === cur.tagName) idx++;
          sib = sib.previousElementSibling;
        }
        parts.unshift(`${tag}:nth-of-type(${idx})`);
        cur = cur.parentElement;
      }
      return parts.join(' > ') || el.tagName.toLowerCase();
    }

    function accessibleName(el) {
      const ariaLabel = (el.getAttribute('aria-label') || '').trim();
      if (ariaLabel) return ariaLabel;
      const labelledBy = (el.getAttribute('aria-labelledby') || '').trim();
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() || '')
          .join(' ')
          .trim();
        if (text) return text;
      }
      const text = (el.innerText || el.textContent || '').trim();
      if (text) return text;
      const title = (el.getAttribute('title') || '').trim();
      if (title) return title;
      const img = el.querySelector('img[alt]');
      if (img && (img.getAttribute('alt') || '').trim()) return img.getAttribute('alt').trim();
      return '';
    }

    // 1. no-accessible-name
    const interactiveControls = document.querySelectorAll('button, a[href], [role="button"], [role="link"]');
    for (const el of interactiveControls) {
      if (!isVisible(el)) continue;
      if (!accessibleName(el)) {
        hits.push({
          rule: 'no-accessible-name',
          selector: buildSelector(el),
          box: toBox(el),
          text: `Control <${el.tagName.toLowerCase()}> has no accessible name.`,
        });
      }
    }

    // 2. dead-href
    const links = document.querySelectorAll('a[href]');
    for (const el of links) {
      if (!isVisible(el)) continue;
      const href = (el.getAttribute('href') || '').trim();
      if (href === '' || href === '#') {
        hits.push({
          rule: 'dead-href',
          selector: buildSelector(el),
          box: toBox(el),
          text: `Link has dead href="${href}".`,
        });
      }
    }

    // 3. covered-target
    const clickTargets = document.querySelectorAll(
      'button, a[href], [role="button"], [role="link"], input:not([type="hidden"]), select, textarea'
    );
    for (const el of clickTargets) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const topEl = document.elementFromPoint(cx, cy);
      if (topEl && topEl !== el && !el.contains(topEl)) {
        hits.push({
          rule: 'covered-target',
          selector: buildSelector(el),
          box: toBox(el),
          text: `Click target is covered at its center by ${buildSelector(topEl)}.`,
        });
      }
    }

    // 4. no-label
    const formFields = document.querySelectorAll('input, select, textarea');
    for (const el of formFields) {
      if (!isVisible(el)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset' || type === 'image') {
          continue;
        }
      }
      const hasAriaLabel = Boolean((el.getAttribute('aria-label') || '').trim());
      const labelledBy = (el.getAttribute('aria-labelledby') || '').trim();
      const hasAriaLabelledBy = Boolean(
        labelledBy &&
          labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() || '')
            .join('')
            .trim()
      );
      const hasWrappingLabel = Boolean(el.closest('label'));
      const id = el.getAttribute('id');
      const hasForLabel = Boolean(id && document.querySelector(`label[for="${CSS.escape(id)}"]`));

      if (!hasAriaLabel && !hasAriaLabelledBy && !hasWrappingLabel && !hasForLabel) {
        hits.push({
          rule: 'no-label',
          selector: buildSelector(el),
          box: toBox(el),
          text: `Form control <${tag}> has no associated label.`,
        });
      }
    }

    return hits;
  });

  const seen = new Map();
  const findings = rawHits.map((hit) => {
    const base = `gate3.${hit.rule}.${slugifyId(hit.selector)}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    const id = count === 1 ? base : `${base}.${count}`;
    return {
      id,
      gate: 'gate3',
      severity: 'fail',
      selector: hit.selector,
      box: hit.box,
      text: hit.text,
    };
  });

  return {
    passed: findings.length === 0,
    skipped: false,
    findings,
  };
}
