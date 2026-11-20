import test from 'node:test';
import assert from 'node:assert/strict';
import { compareWireframeLandmarks } from '../../src/visual-diff.mjs';

const aligned = { selector: 'main', index: 0, x: 10, y: 20, width: 30, height: 40 };

test('M1-AC-01 break-it: NaN or null landmark coordinate fails closed', () => {
  for (const axis of ['x', 'y', 'width', 'height']) {
    for (const bad of [Number.NaN, null, undefined, Number.POSITIVE_INFINITY]) {
      const box = { ...aligned, [axis]: bad };
      const result = compareWireframeLandmarks([aligned], [box], 4, true);
      assert.equal(result.passed, false, `${axis}=${String(bad)} must fail closed`);
      assert.ok(result.findings.some((finding) => finding.id === 'gate2.landmark.main'));
    }
  }

  const finite = compareWireframeLandmarks([aligned], [aligned], 4, true);
  assert.equal(finite.passed, true);
  assert.equal(finite.findings.length, 0);
});
