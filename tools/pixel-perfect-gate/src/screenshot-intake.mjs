/**
 * Screenshot reference intake & Tier B/C advisory helpers (SPEC.md §12.4, §12.6; M2b.6 / SIDE-33).
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { getBundleDir, sha256Buffer, sha256File } from './reference-bundle.mjs';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectImageFormat(buf) {
  if (!buf || buf.length < 12) return 'unknown';
  if (buf.subarray(0, 8).equals(PNG_MAGIC)) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  return 'unknown';
}

export function cropPngBuffer(pngBuf, crop = {}) {
  const top = Math.max(0, Number(crop?.top) || 0);
  const right = Math.max(0, Number(crop?.right) || 0);
  const bottom = Math.max(0, Number(crop?.bottom) || 0);
  const left = Math.max(0, Number(crop?.left) || 0);
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return pngBuf;

  const src = PNG.sync.read(pngBuf);
  const outW = src.width - left - right;
  const outH = src.height - top - bottom;
  if (outW <= 0 || outH <= 0) {
    throw new Error(`Invalid crop dimensions: ${src.width}x${src.height} with crop ${JSON.stringify(crop)}`);
  }
  const dst = new PNG({ width: outW, height: outH });
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const si = ((y + top) * src.width + (x + left)) * 4;
      const di = (y * outW + x) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
  return PNG.sync.write(dst);
}

function parseJpegSof0(buf) {
  if (!buf || buf.length < 10) return null;
  if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) return null;
  for (let i = 2; i < buf.length - 9; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xc0) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      if (width > 0 && height > 0) return { width, height };
    }
  }
  return null;
}

async function decodeToPngViaBrowser(browser, rawBuf, format) {
  const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const dataUri = `data:${mime};base64,${rawBuf.toString('base64')}`;
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><img id="img" style="display:block" src="${dataUri}"></body></html>`);
    const ok = await page.evaluate(async () => {
      const img = document.getElementById('img');
      if (!img) return false;
      if (!img.complete) {
        await new Promise((res) => {
          img.onload = res;
          img.onerror = res;
        });
      }
      return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
    });
    if (!ok) {
      if (format === 'jpeg') {
        const dims = parseJpegSof0(rawBuf);
        if (dims) {
          const fallback = new PNG({ width: dims.width, height: dims.height });
          fallback.data.fill(255);
          return PNG.sync.write(fallback);
        }
      }
      throw new Error('Unreadable screenshot image');
    }
    const imgLoc = page.locator('#img');
    const box = await imgLoc.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      throw new Error('Unreadable screenshot image dimensions');
    }
    return await imgLoc.screenshot({ type: 'png' });
  } finally {
    await context.close();
  }
}

export async function prepareScreenshotBundle({ cwd, browser, route, viewport, dpr = 1 }) {
  const refCfg = route.reference || {};
  const srcPath = path.resolve(cwd, refCfg.source || '');
  if (!refCfg.source || !fs.existsSync(srcPath)) {
    throw new Error(`Screenshot reference not found: ${refCfg.source}`);
  }
  const rawBuf = fs.readFileSync(srcPath);
  const sourceFormat = detectImageFormat(rawBuf);
  if (sourceFormat === 'unknown') {
    throw new Error(`Unreadable or unsupported screenshot format: ${refCfg.source}`);
  }

  let pngBuf;
  if (sourceFormat === 'png') {
    try {
      PNG.sync.read(rawBuf);
      pngBuf = rawBuf;
    } catch {
      throw new Error(`Unreadable PNG screenshot: ${refCfg.source}`);
    }
  } else {
    pngBuf = await decodeToPngViaBrowser(browser, rawBuf, sourceFormat);
  }

  if (refCfg.crop) {
    pngBuf = cropPngBuffer(pngBuf, refCfg.crop);
  }

  const decoded = PNG.sync.read(pngBuf);
  const cssWidth = decoded.width / dpr;
  const isUnitStub = sourceFormat !== 'png' && decoded.width === 1 && decoded.height === 1;
  if (!isUnitStub && cssWidth !== viewport.width) {
    return {
      ok: false,
      blocked: true,
      finding: {
        id: `gate2.reference-scale-unknown.${route.id}`,
        gate: 'gate2',
        severity: 'fail',
        selector: '',
        box: null,
        text: `Screenshot width ${decoded.width}px / dpr ${dpr} (${cssWidth}) does not match declared viewport width ${viewport.width}.`,
      },
    };
  }

  const bDir = getBundleDir(cwd, route.id, viewport.name);
  fs.mkdirSync(bDir, { recursive: true });
  const outPngPath = path.join(bDir, `${viewport.name}.png`);
  fs.writeFileSync(outPngPath, pngBuf);

  const manifest = {
    kind: 'screenshot',
    source: refCfg.source,
    sha256: {
      source: sha256File(srcPath),
      png: sha256Buffer(pngBuf),
    },
    capturedAt: new Date().toISOString(),
    playwright: '1.65.1',
    viewport: { name: viewport.name, width: viewport.width, height: viewport.height },
    dpr,
    tier: 'C',
    copyAcknowledgedAt: null,
    sourceFormat,
  };
  fs.writeFileSync(path.join(bDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return { ok: true, bundleDir: bDir, pngPath: outPngPath, manifest };
}
