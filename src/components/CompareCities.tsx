import React, { useMemo, useState } from 'react';
import type { CityData } from '../types';
import { getDailySolarCurve, getSolarPosition, getSolarTimes } from '../utils/solarCalculator';
import { formatDaylight } from '../utils/daylightCalendar';
import { CitySearch } from './CitySearch';
import { PhotographyLight } from './PhotographyLight';
import { LocalClock } from './LocalClock';
import { Dialog } from './Dialog';

const COLORS = ['#38bdf8', '#fbbf24', '#c084fc'];

export function CompareCities({ cities, selectedCity, currentDate, onFocusCity, onClose }: {
  cities: CityData[]; selectedCity: CityData | null; currentDate: Date;
  onFocusCity: (city: CityData) => void; onClose: () => void;
}) {
  const [extra, setExtra] = useState<CityData[]>([]);
  const [searchSlot, setSearchSlot] = useState<number | null>(null);
  const available = useMemo(() => {
    const combined = [...cities, ...(selectedCity ? [selectedCity] : []), ...extra];
    return combined.filter((city, index) => combined.findIndex(c => c.id === city.id) === index);
  }, [cities, selectedCity, extra]);
  const [ids, setIds] = useState(() => {
    const first = selectedCity ?? available.find(city => city.id === 'london') ?? available[0];
    const second = available.find(city => city.id === 'shanghai' && city.id !== first.id)
      ?? available.find(city => city.id !== first.id)!;
    return [first.id, second.id];
  });
  const compared = ids.map(id => available.find(city => city.id === id)!);
  const results = useMemo(() => compared.map(city => ({
    city, position: getSolarPosition(city.lat, city.lng, currentDate),
    times: getSolarTimes(city.lat, city.lng, currentDate),
    curve: getDailySolarCurve(city.lat, city.lng, currentDate),
  })), [ids, available, currentDate]);
  const x = (hour: number) => 45 + hour / 24 * 810;
  const y = (altitude: number) => 20 + (90 - altitude) / 180 * 220;
  const hour = currentDate.getUTCHours() + currentDate.getUTCMinutes() / 60;
  const clock = (date: Date | null, city: CityData) => date ? date.toLocaleTimeString('en-US', {
    timeZone: city.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '—';
  return (
    <Dialog title="Compare cities" onClose={onClose}>
      <div className="flex flex-wrap justify-between gap-3 mb-5 items-center">
        <div className="space-y-1">
          <p data-testid="utc-clock" className="text-sm text-slate-400">One moment around the world · {currentDate.toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
          <LocalClock date={currentDate} className="text-sm text-slate-400" />
        </div>
        {ids.length < 3 && <button onClick={() => {
          const next = available.find(city => !ids.includes(city.id));
          if (next) setIds([...ids, next.id]);
        }} className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-2 text-sm cursor-pointer">+ Add a third city</button>}
      </div>
      {searchSlot !== null && <section className="mb-4 rounded-xl border border-slate-700 p-3">
        <div className="flex justify-between items-center gap-3 mb-3"><h3 className="text-sm">Find city {searchSlot + 1} worldwide</h3>
          <button className="min-h-11 px-3 text-xs underline cursor-pointer" onClick={() => setSearchSlot(null)}>Cancel search</button></div>
        <CitySearch excludedCities={compared.filter((_, index) => index !== searchSlot)} cities={available.filter(city => !ids.includes(city.id))} onSelect={city => {
          if (!available.some(saved => saved.id === city.id)) setExtra(previous => [...previous, city]);
          if (!ids.some((id, i) => i !== searchSlot && id === city.id)) setIds(previous => previous.map((id, i) => i === searchSlot ? city.id : id));
          setSearchSlot(null);
        }} />
      </section>}
      <div className={`grid grid-cols-1 gap-4 ${ids.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {results.map(({ city, position, times }, index) => (
          <section key={index} className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
            <div className="flex gap-2 items-center mb-4">
              <label className="flex-1 min-w-0 text-xs text-slate-400">City {index + 1}
                <select value={city.id} onChange={event => setIds(ids.map((id, i) => i === index ? event.target.value : id))}
                  className="mt-1 block w-full rounded-lg bg-slate-800 p-2 text-sm" style={{ color: COLORS[index] }}>
                  {available.map(option => <option key={option.id} value={option.id}
                    disabled={ids.includes(option.id) && option.id !== city.id}>{option.name}, {option.country}</option>)}
                </select>
              </label>
              {ids.length === 3 && <button onClick={() => setIds(ids.filter((_, i) => i !== index))}
                aria-label={`Remove ${city.name}`} className="p-2 text-slate-400 hover:text-white cursor-pointer">✕</button>}
            </div>
            <button onClick={() => setSearchSlot(index)} className="min-h-11 mb-2 text-xs text-sky-300 underline cursor-pointer">Search worldwide for city {index + 1}</button>
            <p className="font-mono text-xl" style={{ color: COLORS[index] }}>{clock(currentDate, city)}</p>
            <p className="text-xs text-slate-400 mb-4">{currentDate.toLocaleDateString('en-US', {
              timeZone: city.timezone, weekday: 'short', month: 'short', day: 'numeric',
            })} · {city.timezone}</p>
            <dl className="text-sm grid grid-cols-2 gap-y-2">
              <dt className="text-slate-400">Lighting</dt><dd className="text-right">{position.phaseLabel}</dd>
              <dt className="text-slate-400">Sun altitude</dt><dd className="text-right font-mono">{position.elevation.toFixed(1)}°</dd>
              <dt className="text-slate-400">Sunrise</dt><dd className="text-right font-mono">{clock(times.sunrise, city)}</dd>
              <dt className="text-slate-400">Sunset</dt><dd className="text-right font-mono">{clock(times.sunset, city)}</dd>
              <dt className="text-slate-400">Daylight</dt><dd className="text-right font-mono text-amber-300">{formatDaylight(times.dayLengthMinutes)}</dd>
            </dl>
            <div className="mt-4"><PhotographyLight city={city} currentDate={currentDate} /></div>
            {(times.isPolarDay || times.isPolarNight) && <p className="text-xs text-sky-300 mt-2">{times.isPolarDay ? 'Polar day: Sun stays above the horizon' : 'Polar night: Sun stays below the horizon'}</p>}
            <button onClick={() => onFocusCity(city)} className="mt-4 text-xs text-sky-300 hover:text-sky-200 underline cursor-pointer">View on globe →</button>
          </section>
        ))}
      </div>
      <section className="mt-5 rounded-xl bg-slate-950/60 border border-slate-800 p-3">
        <h3 className="text-sm font-semibold mb-2">24-hour solar altitude · UTC</h3>
        <svg viewBox="0 0 880 280" role="img" aria-label="Solar altitude curves for the compared cities on the selected UTC date" className="w-full">
          <rect x="45" y={y(90)} width="810" height={y(0) - y(90)} fill="#fbbf24" opacity="0.05" />
          {[-90, -45, 0, 45, 90].map(altitude => <g key={altitude}>
            <line x1="45" x2="855" y1={y(altitude)} y2={y(altitude)} stroke={altitude === 0 ? '#64748b' : '#1e293b'} />
            <text x="38" y={y(altitude) + 4} textAnchor="end" fill="#94a3b8" fontSize="11">{altitude}°</text>
          </g>)}
          {[0, 6, 12, 18, 24].map(hour => <text key={hour} x={x(hour)} y="265" textAnchor="middle" fill="#94a3b8" fontSize="11">{hour}:00</text>)}
          {results.map(({ city, curve }, i) => <path key={city.id}
            d={curve.map((point, j) => `${j ? 'L' : 'M'}${x(point.hour)},${y(point.elevation)}`).join(' ')}
            fill="none" stroke={COLORS[i]} strokeWidth="2.5" />)}
          <line x1={x(hour)} x2={x(hour)} y1="20" y2="240" stroke="#e2e8f0" strokeDasharray="4 4" />
        </svg>
        <div className="flex flex-wrap gap-4 text-xs">{results.map(({ city }, i) => <span key={city.id} style={{ color: COLORS[i] }}>● {city.name}</span>)}</div>
      </section>
      <p className="mt-4 text-xs text-slate-500">Curves and daylight durations use the selected UTC date. Clock and sunrise/sunset readouts use each city's time zone. A dash indicates no sunrise or sunset on a polar day/night.</p>
    </Dialog>
  );
}
