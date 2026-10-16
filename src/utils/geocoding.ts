import type { CityData } from '../types';

export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
export function parseGeocodingResults(data: unknown): CityData[] {
  const results = (data as { results?: unknown[] })?.results;
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  return results.slice(0, 20).flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const r = value as Record<string, unknown>;
    if (!Number.isSafeInteger(r.id) || typeof r.name !== 'string' || !r.name.trim() ||
      typeof r.latitude !== 'number' || !Number.isFinite(r.latitude) || Math.abs(r.latitude) > 90 ||
      typeof r.longitude !== 'number' || !Number.isFinite(r.longitude) || Math.abs(r.longitude) > 180 ||
      typeof r.timezone !== 'string') return [];
    try { new Intl.DateTimeFormat('en', { timeZone: r.timezone }); } catch { return []; }
    const id = `open-meteo-${r.id}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const region = [r.admin1, r.country].filter(v => typeof v === 'string' && v.trim()).join(', ');
    return [{ id, name: r.name.slice(0, 100), country: (region || 'Unknown region').slice(0, 100), lat: r.latitude,
      lng: r.longitude, timezone: r.timezone, ...(typeof r.population === 'number' && Number.isFinite(r.population) && r.population >= 0 ? { population: r.population } : {}) }];
  });
}
