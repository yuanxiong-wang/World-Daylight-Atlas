import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAnnualSolarAltitudeRange,
  getObserverSeasonalDates,
  getSolarPosition,
  splitSolarPath,
} from '../src/utils/solarCalculator.ts';

test('season names follow the observer hemisphere', () => {
  const north = getObserverSeasonalDates(2026, 51.5);
  const south = getObserverSeasonalDates(2026, -33.8688);
  assert.equal(north.summerDate.getUTCMonth(), 5);
  assert.equal(north.winterDate.getUTCMonth(), 11);
  assert.equal(south.summerDate.getUTCMonth(), 11);
  assert.equal(south.winterDate.getUTCMonth(), 5);
  const noonAltitude = date => {
    const noon = new Date(date);
    noon.setUTCHours(2, 0, 0, 0);
    return getSolarPosition(-33.8688, 151.2093, noon).elevation;
  };
  assert.ok(noonAltitude(south.summerDate) - noonAltitude(south.winterDate) > 46);
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
