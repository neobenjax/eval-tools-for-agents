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

test('M1-AC-01 break-it: width or height of 5 CSS px fails and 4 CSS px stays within tolerance', () => {
  for (const axis of ['width', 'height']) {
    const over = { ...aligned, [axis]: aligned[axis] + 5 };
    const overResult = compareWireframeLandmarks([aligned], [over], 4, true);
    assert.equal(overResult.passed, false, `${axis}+5`);
    assert.ok(overResult.findings.some((finding) => finding.id === 'gate2.landmark.main'));

    const edge = { ...aligned, [axis]: aligned[axis] + 4 };
    const edgeResult = compareWireframeLandmarks([aligned], [edge], 4, true);
    assert.equal(edgeResult.passed, true, `${axis}+4`);
    assert.equal(edgeResult.findings.length, 0);
  }
});
