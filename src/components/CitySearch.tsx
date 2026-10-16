import React, { useEffect, useId, useState } from 'react';
import type { CityData } from '../types';
import { GEOCODING_URL, parseGeocodingResults } from '../utils/geocoding';

const cache = new Map<string, CityData[]>();
export function CitySearch({ cities, onSelect, selectedId, excludedCities = [] }: {
  cities: CityData[]; onSelect: (city: CityData) => void; selectedId?: string; excludedCities?: CityData[];
}) {
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<CityData[]>([]);
  const [status, setStatus] = useState('');
  const id = useId();
  const search = query.trim().slice(0, 100);
  const local = cities.filter(city => `${city.name} ${city.country}`.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => {
    setRemote([]);
    if (search.length < 2) { setStatus('Type at least 2 characters to search worldwide.'); return; }
    const key = search.toLowerCase();
    if (cache.has(key)) { setRemote(cache.get(key)!); setStatus(cache.get(key)!.length ? '' : 'No worldwide matches. Try a nearby city or another spelling.'); return; }
    let active = true;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    setStatus('Searching worldwide…');
    const debounce = setTimeout(async () => {
      timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const url = new URL(GEOCODING_URL);
        url.search = new URLSearchParams({ name: search, count: '10', language: 'en', format: 'json' }).toString();
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error(response.status === 429 ? 'Search limit reached. Please try again shortly.' : 'Worldwide search is unavailable. Try again; saved cities still work.');
        const payload = await response.json();
        if (payload?.error) throw new Error('Worldwide search is unavailable. Try again; saved cities still work.');
        const results = parseGeocodingResults(payload);
        if (!active) return;
        cache.set(key, results);
        if (cache.size > 50) cache.delete(cache.keys().next().value!);
        setRemote(results); setStatus(results.length ? '' : 'No worldwide matches. Try a nearby city or another spelling.');
      } catch (error) {
        if (active) setStatus(controller.signal.aborted ? 'Search timed out. Try again; saved cities still work.' : error instanceof Error && error.message !== 'Failed to fetch' ? error.message : 'Worldwide search is unavailable. Saved cities still work.');
      } finally { clearTimeout(timeout); }
    }, 400);
    return () => { active = false; clearTimeout(debounce); clearTimeout(timeout); controller.abort(); };
  }, [search, attempt]);
  // Hide duplicate coordinates when a saved city is also found online.
  const matches = [...local, ...remote.filter(r => !local.some(l => l.id === r.id ||
    l.name.toLowerCase() === r.name.toLowerCase() && Math.abs(l.lat - r.lat) < 0.05 && Math.abs(l.lng - r.lng) < 0.05))]
    .filter(city => !excludedCities.some(excluded => excluded.id === city.id || excluded.name.toLowerCase() === city.name.toLowerCase() &&
      Math.abs(excluded.lat - city.lat) < 0.05 && Math.abs(excluded.lng - city.lng) < 0.05));
  return <div className="space-y-3">
    <label htmlFor={id} className="block text-sm text-slate-400">Search cities</label>
    <input id={id} value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Any city, worldwide"
      className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-base" autoComplete="off" spellCheck={false} />
    <p role="status" className="text-xs text-slate-400">{status}</p>
    {/unavailable|timed out|limit reached/.test(status) && <button onClick={() => setAttempt(value => value + 1)} className="min-h-11 text-xs text-sky-300 underline cursor-pointer">Retry search</button>}
    <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2 max-h-72 overflow-y-auto overscroll-contain">
      {matches.map(city => <button key={city.id} onClick={() => onSelect(city)} aria-pressed={selectedId === city.id}
        className="min-h-11 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-left hover:bg-slate-700 cursor-pointer">
        <span className="block text-sky-300 font-medium break-words">{city.name}</span>
        <span className="block text-xs text-slate-400 break-words">{city.country}</span>
      </button>)}
    </div>
    <p className="text-[10px] text-slate-500">Worldwide search: <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · <a className="underline" href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>. Queries are sent to Open-Meteo; saved cities work offline.</p>
  </div>;
}
