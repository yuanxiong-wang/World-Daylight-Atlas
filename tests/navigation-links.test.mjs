import assert from 'node:assert/strict';
import test from 'node:test';
import { canIdleDrift, findMagneticSnap, stepUtcMonth, unfoldCities } from '../src/utils/globeInteraction.ts';
import { createCoordinateUrl, createShareUrl, DEFAULT_LAYERS, readLocationView } from '../src/utils/viewState.ts';

test('month steps preserve UTC time, clamp month ends and supported year bounds', () => {
  assert.equal(stepUtcMonth(new Date('2024-01-31T09:37:12Z'), 1).toISOString(), '2024-02-29T09:37:12.000Z');
  assert.equal(stepUtcMonth(new Date('2026-03-31T09:37:12Z'), -1).toISOString(), '2026-02-28T09:37:12.000Z');
  assert.equal(stepUtcMonth(new Date('2100-12-31T12:00Z'), 1).toISOString(), '2100-12-31T23:59:59.999Z');
  assert.equal(stepUtcMonth(new Date('1900-01-01T00:00Z'), -1).toISOString(), '1900-01-01T00:00:00.000Z');
});
test('Fibonacci unfolding separates dense dots and leaves isolated locations unchanged', () => {
  const points = Array.from({ length: 8 }, (_, i) => ({ id: String(i), x: 250 + i * 0.2, y: 180 + i * 0.2 }));
  points.push({ id: 'isolated', x: 450, y: 350 });
  const layout = unfoldCities(points, 600, 400);
  assert.equal(layout.get('isolated').expanded, false);
  assert.equal(layout.get('isolated').x, 450);
  const expanded = [...layout.values()].filter(point => point.expanded);
  assert.equal(expanded.length, 8);
  for (const a of expanded) for (const b of expanded) if (a.id !== b.id) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 22);
  const reversed = unfoldCities([...points].reverse(), 600, 400);
  for (const [id, point] of layout) assert.deepEqual(reversed.get(id), point);
});
test('snapping is bounded, handles the date line, and only attracts cities near twilight', () => {
  const date = new Date('2026-03-20T06:00Z');
  const meridian = findMagneticSnap({ lat: 40, lng: 29 }, [], date);
  assert.equal(meridian.kind, 'meridian'); assert.equal(meridian.lng, 30);
  assert.equal(findMagneticSnap({ lat: 40, lng: 14 }, [], date), null);
  assert.equal(findMagneticSnap({ lat: 30, lng: 179.5 }, [], date).lng, -180);
  const city = { id: 'test', name: 'Twilight town', country: '', lat: 0, lng: -4, timezone: 'UTC' };
  // At 06 UTC on the equinox, this longitude lies close to civil dawn.
  const twilight = findMagneticSnap({ lat: 0, lng: -4.1 }, [city], date);
  assert.equal(twilight?.kind, 'city'); assert.match(twilight.label, /Twilight town/);
  assert.equal(findMagneticSnap({ lat: 0, lng: -4.1 }, [city], new Date('2026-03-20T12:00Z')), null);
});
test('idle drift waits thirty seconds and every user-suppression gate takes priority', () => {
  const base = { enabled: true, reducedMotion: false, locked: false, playing: false, tour: false, dragging: false };
  assert.equal(canIdleDrift(29999, 0, base), false); assert.equal(canIdleDrift(30000, 0, base), true);
  assert.equal(canIdleDrift(50000, 40000, base), false);
  for (const key of ['reducedMotion', 'locked', 'playing', 'tour', 'dragging']) assert.equal(canIdleDrift(60000, 0, { ...base, [key]: true }), false);
  assert.equal(canIdleDrift(60000, 0, { ...base, enabled: false }), false);
});
test('coordinate links round-trip Unicode cities, zones and exact UTC instants', () => {
  const state = { city: { id: 'custom', name: '京都 ☀', country: 'Japan', lat: 35.0116, lng: 135.7681, timezone: 'Asia/Tokyo' }, date: new Date('2026-06-20T20:50:58.360Z'), view: '2d-map', layers: { ...DEFAULT_LAYERS } };
  const link = createCoordinateUrl('https://mytest.ccwu.cc/?unrelated=1#old', state);
  assert.equal(new URL(link).hash, ''); assert.equal(new URL(link).searchParams.get('date'), state.date.toISOString());
  const restored = readLocationView(link);
  assert.equal(restored.inspector, true); assert.equal(restored.city.name, state.city.name); assert.equal(restored.city.timezone, 'Asia/Tokyo');
  assert.equal(restored.city.lat, state.city.lat); assert.equal(+restored.date, +state.date);
  assert.deepEqual(readLocationView(createShareUrl('https://mytest.ccwu.cc/', state)), state);
  assert.equal(readLocationView('https://mytest.ccwu.cc/?lat=0&lng=180&date=1900-01-01&inspector=0').inspector, false);
});
test('coordinate links reject malformed dates, duplicate coordinates, invalid zones and bounds', () => {
  for (const query of ['lat=&lng=0&date=2026-01-01', 'lat=91&lng=0&date=2026-01-01', 'lat=0&lng=181&date=2026-01-01',
    'lat=0&lat=1&lng=0&date=2026-01-01', 'lat=0&lng=0&date=2026-02-30', 'lat=0&lng=0&date=2026-01-01T12:00',
    'lat=0&lng=0&date=1800-01-01', 'lat=0&lng=0&date=2026-01-01&timezone=Invalid/Zone']) {
    assert.equal(readLocationView(`https://mytest.ccwu.cc/?${query}`), null, query);
  }
});
