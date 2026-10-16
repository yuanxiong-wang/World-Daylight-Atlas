import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAnnualSolarAltitudeRange,
  getSolarMilestones,
  getDailySolarCurve,
  getSolarPosition,
  splitSolarPath,
} from '../src/utils/solarCalculator.ts';

test('all four shared milestones have stable names, colors and UTC dates', () => {
  const milestones = getSolarMilestones(2026);
  assert.equal(new Set(milestones.map(m => m.id)).size, 4);
  assert.deepEqual(milestones.map(m => m.name), [
    'March Equinox', 'June Solstice', 'September Equinox', 'December Solstice',
  ]);
  for (const m of milestones) {
    assert.match(m.color, /^#[0-9a-f]{6}$/);
    assert.equal(m.date.getUTCFullYear(), 2026);
    assert.equal(m.date.getUTCMonth(), m.month);
    assert.equal(m.date.getUTCDate(), m.day);
  }
  // A consumer mutating its jump date must not alter another consumer's list.
  milestones[0].date.setUTCFullYear(2000);
  assert.equal(getSolarMilestones(2026)[0].date.getUTCFullYear(), 2026);
});

test('daily peak is independent of the simulation clock, even at night', () => {
  const night = new Date('2026-06-21T00:00:00Z');
  const morning = new Date('2026-06-21T09:00:00Z');
  const nightCurve = getDailySolarCurve(51.5074, -0.1278, night);
  const morningCurve = getDailySolarCurve(51.5074, -0.1278, morning);
  assert.deepEqual(nightCurve, morningCurve);
  const peak = Math.max(...nightCurve.map(p => p.elevation));
  assert.ok(peak > 61 && peak < 63);
  assert.ok(getSolarPosition(51.5074, -0.1278, night).elevation < 0);
});

test('Sydney and London retain the full annual noon altitude swing', () => {
  for (const latitude of [-33.8688, 51.5074]) {
    const { range } = getAnnualSolarAltitudeRange(latitude, 2026);
    assert.ok(Math.abs(range - 46.88) < 0.03, `${latitude}: ${range}`);
  }
});

test('annual extrema include tropical zenith crossings, including leap years', () => {
  for (const year of [2024, 2026]) {
    for (const latitude of [0, 15, -15, 23, -23]) {
      const extrema = getAnnualSolarAltitudeRange(latitude, year);
      assert.equal(extrema.maxElevation, 90);
      assert.ok(Math.abs(extrema.range - (23.44 + Math.abs(latitude))) < 0.03);
    }
  }
});

function dailySamples(latitude, longitude, month, day) {
  return Array.from({ length: 73 }, (_, index) => {
    const date = new Date(Date.UTC(2026, month, day, 0, index * 20));
    return { index, elev: getSolarPosition(latitude, longitude, date).elevation };
  });
}

test('Sydney daylight across UTC midnight never bridges the nighttime gap', () => {
  const samples = dailySamples(-33.8688, 151.2093, 5, 21);
  const { daySegments, nightSegments } = splitSolarPath(samples);
  assert.equal(daySegments.length, 2);
  assert.equal(nightSegments.length, 1);
  for (const [segments, isDay] of [[daySegments, true], [nightSegments, false]]) {
    for (const segment of segments) {
      segment.forEach((sample, i) => {
        assert.equal(sample.elev >= 0, isDay);
        if (i) assert.equal(sample.index - segment[i - 1].index, 1);
      });
    }
  }
  assert.equal(daySegments.flat().length + nightSegments.flat().length, samples.length);
});

test('night paths split at daylight and polar paths remain continuous', () => {
  const london = splitSolarPath(dailySamples(51.5074, -0.1278, 5, 21));
  assert.equal(london.daySegments.length, 1);
  assert.equal(london.nightSegments.length, 2);
  const polarSummer = splitSolarPath(dailySamples(80, 0, 5, 21));
  assert.equal(polarSummer.daySegments[0].length, 73);
  assert.equal(polarSummer.nightSegments.length, 0);
  const polarWinter = splitSolarPath(dailySamples(80, 0, 11, 21));
  assert.equal(polarWinter.nightSegments[0].length, 73);
  assert.equal(polarWinter.daySegments.length, 0);
  assert.deepEqual(splitSolarPath([]), { daySegments: [], nightSegments: [] });
});
