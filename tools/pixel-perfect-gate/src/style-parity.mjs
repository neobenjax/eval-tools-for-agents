/**
 * Style & token parity check (SPEC.md §12.6, M2b.8 / SIDE-35).
 * Compares 10 computed CSS properties against `.styles.json` (Tier A, fail)
 * or `.tokens.json` (Tier B, info).
 */
import fs from 'node:fs';
import path from 'node:path';
import { STYLE_PROPS } from './reference-bundle.mjs';

function slugifySelector(selector) {
  const cleaned = String(selector || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'unknown';
}

function normalizeColorToRgb(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s.startsWith('rgb(') || s.startsWith('rgba(')) return s;
  const hex3 = /^#([0-9a-f]{3})$/i.exec(s);
  if (hex3) {
    const [r, g, b] = hex3[1].split('').map((c) => parseInt(c + c, 16));
    return `rgb(${r}, ${g}, ${b})`;
  }
  const hex6 = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex6) {
    const n = parseInt(hex6[1], 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  }
  return s;
}

export async function runStyleParity({ page, bundleDir, tier = 'A' }) {
  const stylesPath = path.join(bundleDir, '.styles.json');
  const tokensPath = path.join(bundleDir, '.tokens.json');

  const severity = tier === 'B' || tier === 'C' ? 'info' : 'fail';
  const findings = [];

  if (fs.existsSync(stylesPath)) {
    const stylesData = JSON.parse(fs.readFileSync(stylesPath, 'utf8'));
    const elements = Array.isArray(stylesData?.elements) ? stylesData.elements : [];
    const selectors = elements.map((el) => el.selector).filter(Boolean);

    const actualMap = await page.evaluate(({ sels, props }) => {
      const out = {};
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) {
          out[sel] = null;
          continue;
        }
        const cs = window.getComputedStyle(el);
        const entry = {};
        for (const p of props) {
          entry[p] = cs.getPropertyValue(p);
        }
        out[sel] = entry;
      }
      return out;
    }, { sels: selectors, props: STYLE_PROPS });

    for (const refEl of elements) {
      const sel = refEl.selector;
      const slug = slugifySelector(sel);
      const actualEl = actualMap[sel];
      if (!actualEl) {
        findings.push({
          id: `gate2.style.${slug}.missing`,
          gate: 'gate2',
          severity,
          selector: sel,
          box: null,
          text: `Mapped element "${sel}" is missing on target.`,
        });
        continue;
      }
      for (const prop of STYLE_PROPS) {
        const expectedVal = String(refEl[prop] ?? '').trim();
        const actualVal = String(actualEl[prop] ?? '').trim();
        if (expectedVal !== actualVal) {
          findings.push({
            id: `gate2.style.${slug}.${prop}`,
            gate: 'gate2',
            severity,
            selector: sel,
            box: null,
            text: `Style mismatch on ${sel} for ${prop}: expected "${expectedVal}", got "${actualVal}".`,
            expected: expectedVal,
            actual: actualVal,
          });
        }
      }
    }

    return {
      passed: severity === 'info' ? true : findings.length === 0,
      style: { compared: [...STYLE_PROPS], reference: 'styles' },
      findings,
    };
  }

  if (fs.existsSync(tokensPath)) {
    const tokensData = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
    const tokens = tokensData?.tokens && typeof tokensData.tokens === 'object' ? tokensData.tokens : {};
    const colorTokens = Object.entries(tokens)
      .filter(([k, v]) => typeof v === 'string' && (k.toLowerCase().includes('color') || v.trim().startsWith('#') || v.trim().startsWith('rgb')))
      .map(([k, v]) => [k, normalizeColorToRgb(v)]);

    if (colorTokens.length > 0) {
      const actualBtnColor = await page.evaluate(() => {
        const el = document.querySelector('button') || document.querySelector('[role="button"]') || document.querySelector('a');
        if (!el) return null;
        return {
          selector: el.tagName.toLowerCase(),
          color: window.getComputedStyle(el).getPropertyValue('color').trim(),
        };
      });
      if (actualBtnColor) {
        const [tokName, expectedColor] = colorTokens[0];
        if (actualBtnColor.color !== expectedColor) {
          const slug = slugifySelector(actualBtnColor.selector);
          findings.push({
            id: `gate2.style.${slug}.color`,
            gate: 'gate2',
            severity: 'info',
            selector: actualBtnColor.selector,
            box: null,
            text: `Token "${tokName}" color mismatch on ${actualBtnColor.selector}: expected "${expectedColor}", got "${actualBtnColor.color}".`,
            expected: expectedColor,
            actual: actualBtnColor.color,
          });
        }
      }
    }

    return {
      passed: true,
      style: { compared: [...STYLE_PROPS], reference: 'tokens' },
      findings,
    };
  }

  return {
    passed: true,
    style: null,
    findings: [],
  };
}
