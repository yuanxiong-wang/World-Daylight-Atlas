import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShareUrl, readSharedView, DEFAULT_LAYERS } from '../src/utils/viewState.ts';
import { getDaylightCalendar, formatDaylight } from '../src/utils/daylightCalendar.ts';
import { projectSkyPoint, normalizeHeading, clampSkyPitch } from '../src/utils/skyProjection.ts';

const city = { id: 'custom', name: '上海 · River 🌞', country: 'China', lat: 31.23, lng: 121.47, timezone: 'Asia/Shanghai' };
const snapshot = {
  date: new Date('2026-12-21T03:45:30.123Z'), city, view: '2d-map',
  layers: { ...DEFAULT_LAYERS, showSeasonalPaths: false, cloudOpacity: 0.35 },
};
function decode(value) { return readSharedView('#' + new URLSearchParams({ atlas: JSON.stringify(value) })); }

test('shared links round trip custom Unicode locations, dates and layer settings', () => {
  const url = new URL(createShareUrl('https://example.com/atlas/', snapshot));
  assert.equal(url.pathname, '/atlas/');
  assert.equal(url.search, '');
  assert.deepEqual(readSharedView(url.hash), snapshot);
  assert.equal(readSharedView(new URL(createShareUrl(url.href, { ...snapshot, city: null })).hash).city, null);
});

test('invalid shared input cannot reach date or timezone formatters', () => {
  const raw = { ...snapshot, v: 1 };
  for (const override of [
    { v: 2 }, { date: 'not-a-date' }, { date: '2500-01-01' }, { view: 'invalid' },
    { city: { ...city, lat: 91 } }, { city: { ...city, lng: '121' } },
    { city: { ...city, timezone: 'not/a/zone' } },
  ]) assert.equal(decode({ ...raw, ...override }), null);
  assert.equal(readSharedView('#atlas=%7Bbroken'), null);
  assert.equal(readSharedView('#unrelated-section'), null);
});

test('shared views whitelist settings and do not serialize unrelated fields', () => {
  const url = createShareUrl('https://example.com/', {
    ...snapshot, city: { ...city, privateNote: 'do-not-share' },
    layers: { ...DEFAULT_LAYERS, secret: 'do-not-share', cloudOpacity: 999, rotationSpeed: -5 },
  });
  assert.ok(!decodeURIComponent(url).includes('do-not-share'));
  const state = readSharedView(new URL(url).hash);
  assert.equal(state.layers.cloudOpacity, 1);
  assert.equal(state.layers.rotationSpeed, 0);
  assert.equal('secret' in state.layers, false);
});

test('annual calendar includes every day once, including leap day', () => {
  const days = getDaylightCalendar(51.5074, -0.1278, 2024);
  assert.equal(days.length, 366);
  assert.equal(new Set(days.map(d => d.date.toISOString().slice(0, 10))).size, 366);
  assert.ok(days.some(d => d.date.toISOString().startsWith('2024-02-29')));
  assert.ok(days.every(d => Number.isFinite(d.minutes) && d.minutes >= 0 && d.minutes <= 1440));
  assert.equal(getDaylightCalendar(51.5, 0, 2026).length, 365);
});

test('calendar tracks southern seasons and polar day/night', () => {
  const south = getDaylightCalendar(-33.8688, 151.2093, 2026);
  const june = south.find(d => d.date.toISOString().startsWith('2026-06-21'));
  const december = south.find(d => d.date.toISOString().startsWith('2026-12-21'));
  assert.ok(december.minutes - june.minutes > 240);
  const polar = getDaylightCalendar(80, 0, 2026);
  assert.ok(polar.some(d => d.polarDay && d.minutes === 1440));
  assert.ok(polar.some(d => d.polarNight && d.minutes === 0));
  assert.equal(formatDaylight(119.8), '2h 00m');
  assert.equal(formatDaylight(1440), '24h 00m');
});

test('ground-level projection respects compass direction, altitude and observer pitch', () => {
  const north = projectSkyPoint(0, 0, 0, 0, 800, 400);
  assert.deepEqual(north, { x: 400, y: 200 });
  assert.equal(projectSkyPoint(180, 0, 0, 0, 800, 400), null);
  assert.ok(projectSkyPoint(30, 0, 0, 0, 800, 400).x > 400);
  assert.ok(projectSkyPoint(0, 30, 0, 0, 800, 400).y < 200);
  assert.ok(Math.abs(projectSkyPoint(90, 20, 90, 20, 800, 400).y - 200) < 1e-8);
  assert.deepEqual(projectSkyPoint(360, 0, 360, 0, 800, 400), north);
  assert.equal(normalizeHeading(-5), 355);
  assert.equal(clampSkyPitch(100), 80);
  assert.equal(clampSkyPitch(-90), -10);
});
