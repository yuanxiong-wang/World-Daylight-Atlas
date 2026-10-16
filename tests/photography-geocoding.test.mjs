import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeocodingResults } from '../src/utils/geocoding.ts';
import { getPhotographyWindows, getLocalDayKey } from '../src/utils/photography.ts';
import { getSolarPosition } from '../src/utils/solarCalculator.ts';

test('geocoding validates coordinates, time zones, regions, and duplicate identities', () => {
  const valid = { id: 123, name: 'Kyoto', latitude: 35.0116, longitude: 135.7681, country: 'Japan', admin1: 'Kyoto', timezone: 'Asia/Tokyo' };
  const cities = parseGeocodingResults({ results: [valid, valid, { ...valid, id: 2, latitude: 91 },
    { ...valid, id: 3, timezone: 'not/a-zone' }, { ...valid, id: 4, longitude: NaN }, null] });
  assert.equal(cities.length, 1); assert.equal(cities[0].id, 'open-meteo-123');
  assert.equal(cities[0].country, 'Kyoto, Japan'); assert.equal(cities[0].timezone, 'Asia/Tokyo');
  assert.deepEqual(parseGeocodingResults({}), []);
});
test('ordinary photography days have ordered blue/golden windows at their angle boundaries', () => {
  for (const city of [{ lat: 51.5, lng: 0, timezone: 'Europe/London' }, { lat: -33.87, lng: 151.2, timezone: 'Australia/Sydney' }]) {
    const date = new Date('2026-06-21T12:00Z'), windows = getPhotographyWindows(city, date);
    assert.equal(windows.golden.length, 2); assert.equal(windows.blue.length, 2);
    assert.ok(windows.blue[0].end <= windows.golden[0].end);
    assert.ok(windows.golden[1].end <= windows.blue[1].end);
    for (const [key, thresholds] of [['golden', [-4, 6]], ['blue', [-6, -4]]]) {
      for (const window of windows[key]) {
        assert.ok(window.start < window.end); assert.equal(window.clipped, false);
        for (const bound of [window.start, window.end]) {
          const altitude = getSolarPosition(city.lat, city.lng, bound).elevation;
          assert.ok(thresholds.some(threshold => Math.abs(altitude - threshold) < 0.001));
        }
      }
    }
  }
});
test('polar light can be absent, continuous, or clipped rather than invented rise/set times', () => {
  const pole = { lat: 89, lng: 0, timezone: 'UTC' };
  const summer = getPhotographyWindows(pole, new Date('2026-06-21T12:00Z'));
  assert.equal(summer.golden.length, 0); assert.equal(summer.blue.length, 0);
  const equinox = getPhotographyWindows(pole, new Date('2026-03-20T12:00Z'));
  assert.equal(equinox.golden.length, 1); assert.equal(equinox.golden[0].clipped, true);
  assert.equal(equinox.golden[0].end - equinox.golden[0].start, 86400000);
  const winter = getPhotographyWindows(pole, new Date('2026-12-21T12:00Z'));
  assert.equal(winter.golden.length, 0); assert.equal(winter.blue.length, 0);
});
test('photography uses the local date, including daylight saving and date-line zones', () => {
  for (const city of [{ lat: 35, lng: 135, timezone: 'Asia/Tokyo' },
    { lat: 1.87, lng: -157.43, timezone: 'Pacific/Kiritimati' }, { lat: 40.7, lng: -74, timezone: 'America/New_York' }]) {
    const date = new Date('2026-03-08T23:30Z');
    const windows = getPhotographyWindows(city, date);
    assert.equal(windows.day, getLocalDayKey(date, city.timezone));
    assert.ok(windows.golden.some(w => getLocalDayKey(new Date((+w.start + +w.end) / 2), city.timezone) === windows.day));
  }
});
