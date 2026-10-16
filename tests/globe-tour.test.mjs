import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleTour } from '../src/utils/globeTour.ts';
const stops = [{ lat: 78, lng: 15 }, { lat: 51, lng: 0 }, { lat: 1, lng: 104 }, { lat: -34, lng: 151 }, { lat: -55, lng: -68 }];
const equivalentLongitude = (a, b) => Math.abs(((a - b + 540) % 360) - 180) < 1e-8;
test('tour reaches every city and stays continuous across leg boundaries', () => {
  for (let i = 0; i < stops.length; i++) {
    const at = sampleTour(i, stops);
    assert.ok(Math.abs(at.lat - stops[i].lat) < 1e-8);
    assert.ok(equivalentLongitude(at.lng, stops[i].lng));
    assert.equal(at.stopIndex, i);
    assert.ok(at.vortex < 1e-8);
    if (i > 0 && i < stops.length - 1) {
      const before = sampleTour(i - 1e-7, stops);
      const after = sampleTour(i + 1e-7, stops);
      assert.ok(Math.abs(before.lat - after.lat) < 1e-6);
      assert.ok(equivalentLongitude(before.lng, after.lng));
    }
  }
});
test('orbital path remains outside Earth and vortex peaks in transit', () => {
  for (let p = 0; p <= 4; p += 0.005) {
    const sample = sampleTour(p, stops);
    assert.ok(sample.radius >= 155);
    assert.ok(Math.abs(sample.lat) < 90);
    assert.ok(sample.vortex >= 0 && sample.vortex <= 1);
  }
  assert.equal(sampleTour(0.5, stops).vortex, 1);
  assert.equal(sampleTour(0.5, stops).radius, 210);
});
test('reduced motion uses discrete city views without spins or vortex', () => {
  for (const progress of [0, 0.25, 0.8, 1.3, 2.8, 4]) {
    const sample = sampleTour(progress, stops, true);
    assert.equal(sample.lat, stops[Math.round(progress)].lat);
    assert.equal(sample.lng, stops[Math.round(progress)].lng);
    assert.equal(sample.vortex, 0);
    assert.equal(sample.radius, 155);
  }
  assert.equal(sampleTour(-1, stops).stopIndex, 0);
  assert.equal(sampleTour(99, stops).stopIndex, 4);
  assert.equal(sampleTour(NaN, stops).stopIndex, 0);
});
