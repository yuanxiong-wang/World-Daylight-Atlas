import assert from 'node:assert/strict';
import test from 'node:test';
import { Body, Observer, Equator, Horizon, SearchRiseSet } from 'astronomy-engine';
import { getSolarMilestones, getSolarPosition, getSolarTimes } from '../src/utils/solarCalculator.ts';
import { getLunarPhase } from '../src/utils/lunarCalculator.ts';

// Published minute-resolution UTC fixtures, independent of the library used by the app.
// Seasons: https://aa.usno.navy.mil/data/Earth_Seasons
// Lunar phases: https://eclipse.gsfc.nasa.gov/phase/phase2001gmt.html
// and https://eclipse.gsfc.nasa.gov/phase/phase1901gmt.html
const seasons = {
  2024: ['03-20T03:06Z', '06-20T20:51Z', '09-22T12:44Z', '12-21T09:20Z'],
  2025: ['03-20T09:01Z', '06-21T02:42Z', '09-22T18:19Z', '12-21T15:03Z'],
};
test('computed seasons match published UTC instants within two minutes', () => {
  for (const [year, expected] of Object.entries(seasons)) {
    getSolarMilestones(Number(year)).forEach((event, i) => {
      assert.ok(Math.abs(event.date - new Date(`${year}-${expected[i]}`)) <= 120000, `${year} ${event.name}: ${event.date.toISOString()}`);
    });
  }
  assert.equal(getSolarMilestones(2024)[1].day, 20);
  assert.equal(getSolarMilestones(2025)[1].day, 21);
  for (let year = 1900; year <= 2100; year++) {
    const events = getSolarMilestones(year);
    events.forEach((event, i) => {
      assert.equal(event.date.getUTCFullYear(), year);
      if (i) assert.ok(event.date > events[i - 1].date);
    });
  }
});

test('solar position and rise/set match Astronomy Engine across the supported range', () => {
  const cities = [
    ['London', 51.5074, -0.1278], ['Shanghai', 31.23, 121.47],
    ['Sydney', -33.8688, 151.2093], ['Seattle', 47.6062, -122.3321],
    ['Singapore', 1.3521, 103.8198], ['Tromsø', 69.6492, 18.9553],
  ];
  let maxAltitude = 0, maxAzimuth = 0, maxEventMinutes = 0, eventCount = 0;
  for (const [name, lat, lng] of cities) for (const year of [1900, 2000, 2024, 2026, 2100]) {
    for (const day of ['03-20', '06-21', '09-22', '12-21']) {
      const observer = new Observer(lat, lng, 0);
      for (const hour of ['00', '06', '12', '18']) {
        const date = new Date(`${year}-${day}T${hour}:00:00Z`);
        const equatorial = Equator(Body.Sun, date, observer, true, true);
        // No atmospheric refraction: the app reports geometric solar-center altitude.
        const reference = Horizon(date, observer, equatorial.ra, equatorial.dec);
        const actual = getSolarPosition(lat, lng, date);
        const altitude = Math.abs(actual.elevation - reference.altitude);
        const azimuth = Math.abs(((actual.azimuth - reference.azimuth + 540) % 360) - 180);
        maxAltitude = Math.max(maxAltitude, altitude);
        assert.ok(altitude <= 0.05, `${name} ${date.toISOString()} altitude ${altitude}`);
        // Azimuth is undefined at the zenith/nadir; exclude within 5° of either.
        if (Math.abs(reference.altitude) < 85) {
          maxAzimuth = Math.max(maxAzimuth, azimuth);
          assert.ok(azimuth <= 0.1, `${name} ${date.toISOString()} azimuth ${azimuth}`);
        }
      }
      const date = new Date(`${year}-${day}T12:00:00Z`);
      const actual = getSolarTimes(lat, lng, date);
      for (const [field, direction] of [['sunrise', 1], ['sunset', -1]]) {
        if (!actual[field]) continue;
        // Align the same solar day, including Sydney events on the preceding UTC date.
        const reference = SearchRiseSet(Body.Sun, observer, direction, new Date(actual[field].getTime() - 12 * 3600000), 1);
        assert.ok(reference, `${name} missing reference ${field}`);
        const minutes = Math.abs(reference.date - actual[field]) / 60000;
        maxEventMinutes = Math.max(maxEventMinutes, minutes); eventCount++;
        assert.ok(minutes <= 3, `${name} ${date.toISOString()} ${field}: ${minutes} minutes`);
      }
      if (actual.isPolarDay || actual.isPolarNight) {
        for (const direction of [1, -1]) assert.equal(SearchRiseSet(Body.Sun, observer, direction,
          new Date(`${year}-${day}T00:00:00Z`), 1), null);
      }
    }
  }
  console.log(`Reference maxima: altitude ${maxAltitude.toFixed(4)}°, azimuth ${maxAzimuth.toFixed(4)}°, rise/set ${maxEventMinutes.toFixed(3)} min (${eventCount} events; 480 positions).`);
});

test('lunar searches and illumination match published new/full phase fixtures', () => {
  const phases = [
    ['2000-01-06T18:14:00Z', 'new'], ['2000-01-21T04:40:00Z', 'full'],
    ['2024-03-25T07:00:00Z', 'full'], ['2024-04-08T18:21:00Z', 'new'],
    ['2024-04-23T23:49:00Z', 'full'], ['2025-03-14T06:55:00Z', 'full'],
    ['2025-03-29T10:58:00Z', 'new'],
  ];
  let maxMinutes = 0;
  for (const [instant, kind] of phases) {
    const event = new Date(instant);
    const before = getLunarPhase(new Date(event.getTime() - 2 * 86400000));
    const found = kind === 'new' ? before.nextNewMoonDate : before.nextFullMoonDate;
    const minutes = Math.abs(found - event) / 60000;
    maxMinutes = Math.max(maxMinutes, minutes);
    assert.ok(minutes <= 2, `${instant} ${kind}: ${minutes} minutes`);
    const at = getLunarPhase(event);
    assert.ok(Math.abs(at.illumination - (kind === 'new' ? 0 : 100)) <= 0.2, `${instant} illumination ${at.illumination}`);
  }
  for (const year of [1900, 2000, 2024, 2026, 2100]) {
    const date = new Date(`${year}-01-01T00:00:00Z`), phase = getLunarPhase(date);
    assert.ok(phase.nextNewMoonDate > date && phase.nextNewMoonDate - date < 31 * 86400000);
    assert.ok(phase.nextFullMoonDate > date && phase.nextFullMoonDate - date < 31 * 86400000);
    assert.ok(phase.ageDays >= 0 && phase.ageDays < 31);
  }
  console.log(`Published lunar fixture maximum: ${maxMinutes.toFixed(3)} min.`);
});
