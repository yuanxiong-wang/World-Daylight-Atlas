import type { CityData, GlobeLayerSettings, ViewMode } from '../types';

export const DEFAULT_LAYERS: GlobeLayerSettings = {
  showAtmosphere: true, showClouds: true, showNightLights: true,
  showTerminator: true, showTwilightBands: true, showSubsolarPoint: true,
  showSunTrajectory: true, showSeasonalPaths: true, showCities: true,
  showGraticule: true, showSunRays: true, cloudOpacity: 1,
  rotationSpeed: 0.5, autoRotate: false,
};

export interface SharedView {
  date: Date;
  city: CityData | null;
  view: ViewMode;
  layers: GlobeLayerSettings;
}

function readLayers(value: unknown): GlobeLayerSettings {
  const layers = { ...DEFAULT_LAYERS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return layers;
  const supplied = value as Record<string, unknown>;
  for (const key of Object.keys(layers) as (keyof GlobeLayerSettings)[]) {
    if (typeof layers[key] === 'boolean' && typeof supplied[key] === 'boolean') {
      Object.assign(layers, { [key]: supplied[key] });
    }
  }
  for (const [key, maximum] of [['cloudOpacity', 1], ['rotationSpeed', 10]] as const) {
    const number = supplied[key];
    if (typeof number === 'number' && Number.isFinite(number)) layers[key] = Math.max(0, Math.min(maximum, number));
  }
  return layers;
}

/** A versioned URL fragment works on static hosts without redirects or a server. */
export function createShareUrl(baseUrl: string, state: SharedView): string {
  const url = new URL(baseUrl);
  const city = state.city && {
    id: state.city.id, name: state.city.name, country: state.city.country,
    lat: state.city.lat, lng: state.city.lng, timezone: state.city.timezone,
  };
  url.hash = new URLSearchParams({ atlas: JSON.stringify({
    v: 1, date: state.date.toISOString(), city, view: state.view, layers: readLayers(state.layers),
  }) }).toString();
  return url.href;
}

/** Treat every link as external input; ignore unknown fields and invalid views. */
export function readSharedView(hash: string): SharedView | null {
  try {
    if (hash.length > 12000) return null;
    const text = new URLSearchParams(hash.replace(/^#/, '')).get('atlas');
    if (!text) return null;
    const value = JSON.parse(text);
    if (!value || value.v !== 1 || typeof value.date !== 'string') return null;
    const date = new Date(value.date);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2100) return null;
    if (value.view !== '3d-globe' && value.view !== '2d-map') return null;
    let city: CityData | null = null;
    if (value.city !== null) {
      const c = value.city;
      if (!c || typeof c !== 'object') return null;
      for (const key of ['id', 'name', 'country', 'timezone']) {
        if (typeof c[key] !== 'string' || c[key].length > 120) return null;
      }
      if (typeof c.lat !== 'number' || !Number.isFinite(c.lat) || Math.abs(c.lat) > 90 ||
          typeof c.lng !== 'number' || !Number.isFinite(c.lng) || Math.abs(c.lng) > 180) return null;
      // Reject invalid time zones before they reach city time formatters.
      new Intl.DateTimeFormat('en', { timeZone: c.timezone }).format(date);
      city = { id: c.id, name: c.name, country: c.country, lat: c.lat, lng: c.lng, timezone: c.timezone };
    }
    return { date, city, view: value.view, layers: readLayers(value.layers) };
  } catch {
    return null;
  }
}

/** Readable coordinate links complement the full versioned snapshot link. */
export function createCoordinateUrl(baseUrl: string, state: SharedView): string | null {
  if (!state.city) return null;
  const url = new URL(baseUrl); url.hash = ''; url.search = '';
  url.search = new URLSearchParams({ lat: String(state.city.lat), lng: String(state.city.lng),
    date: state.date.toISOString(), name: state.city.name, country: state.city.country,
    timezone: state.city.timezone, inspector: '1' }).toString();
  return url.href;
}
export function readLocationView(href: string, cities: readonly CityData[] = []): (SharedView & { inspector?: boolean }) | null {
  try {
    const url = new URL(href);
    const snapshot = readSharedView(url.hash);
    if (snapshot) return snapshot;
    const query = url.searchParams;
    for (const key of ['lat', 'lng', 'date']) if (query.getAll(key).length !== 1 || !query.get(key)?.trim()) return null;
    const lat = Number(query.get('lat')), lng = Number(query.get('lng')), rawDate = query.get('date')!;
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) return null;
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(rawDate)) return null;
    const calendarDay = new Date(rawDate.slice(0, 10));
    if (!Number.isFinite(+calendarDay) || calendarDay.toISOString().slice(0, 10) !== rawDate.slice(0, 10)) return null;
    const date = new Date(rawDate);
    if (!Number.isFinite(+date) || date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2100) return null;
    const matched = cities.find(city => Math.abs(city.lat - lat) < 0.01 && Math.abs(city.lng - lng) < 0.01);
    const timezone = query.get('timezone') ?? matched?.timezone ?? 'UTC';
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(date);
    const name = query.get('name') ?? matched?.name ?? 'Observation Point';
    const country = query.get('country') ?? matched?.country ?? `${lat.toFixed(3)}°, ${lng.toFixed(3)}°`;
    if ([timezone, name, country].some(value => value.length > 120)) return null;
    return { date, city: { id: matched?.id ?? `loc-${lat}-${lng}`, name, country, lat, lng, timezone },
      view: '3d-globe', layers: { ...DEFAULT_LAYERS }, inspector: query.get('inspector') !== '0' };
  } catch { return null; }
}
