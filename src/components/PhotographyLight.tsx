import React, { useMemo } from 'react';
import type { CityData } from '../types';
import { getSolarPosition } from '../utils/solarCalculator';
import { getLocalDayKey, getPhotographyWindows } from '../utils/photography';

export function PhotographyLight({ city, currentDate }: { city: CityData; currentDate: Date }) {
  const day = getLocalDayKey(currentDate, city.timezone);
  const windows = useMemo(() => getPhotographyWindows(city, currentDate), [city.lat, city.lng, city.timezone, day]);
  const elevation = getSolarPosition(city.lat, city.lng, currentDate).elevation;
  const phase = elevation >= -4 && elevation <= 6 ? 'Golden hour' : elevation >= -6 && elevation < -4 ? 'Blue hour' : 'Outside golden / blue hour';
  const clock = (date: Date) => date.toLocaleTimeString('en-GB', { timeZone: city.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const stamp = (date: Date) => `${getLocalDayKey(date, city.timezone) === day ? '' : `${getLocalDayKey(date, city.timezone).slice(5)} `}${clock(date)}`;
  return <section aria-label="Photography light" className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3 space-y-2 text-xs">
    <h3 className="font-semibold text-slate-200">Photography light</h3>
    <p className="text-[10px] text-slate-400">{day} · {city.timezone} · local times</p>
    <p className="text-slate-300">At simulation time: {phase}</p>
    {([['golden', 'Golden hour', '−4° to +6°', 'text-amber-300'], ['blue', 'Blue hour', '−6° to −4°', 'text-sky-300']] as const).map(([key, label, range, color]) => <div key={key}>
      <p className={`${color} font-medium`}>{label} <span className="font-normal text-slate-500">({range})</span></p>
      {windows[key].length ? windows[key].map((window, i) => <p key={i} className="font-mono text-slate-300 mt-1 break-words">
        {stamp(window.start)} – {stamp(window.end)}{window.clipped ? ' †' : ''}
      </p>) : <p className="text-slate-400 mt-1">No {label.toLowerCase()} this solar day.</p>}
    </div>)}
    <p className="text-[10px] text-slate-500">Sun-angle estimates around local solar noon; weather and terrain affect the light. † Continues at the solar-day boundary.</p>
  </section>;
}
