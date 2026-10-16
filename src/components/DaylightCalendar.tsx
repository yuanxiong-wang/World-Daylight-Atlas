import React, { useMemo, useState } from 'react';
import type { CityData } from '../types';
import { getDaylightCalendar, formatDaylight } from '../utils/daylightCalendar';
import { Dialog } from './Dialog';

export function DaylightCalendar({ city, currentDate, onSelectDate, onClose }: {
  city: CityData; currentDate: Date; onSelectDate: (date: Date) => void; onClose: () => void;
}) {
  const [year, setYear] = useState(Math.max(1900, Math.min(2100, currentDate.getUTCFullYear())));
  const days = useMemo(() => getDaylightCalendar(city.lat, city.lng, year), [city.lat, city.lng, year]);
  const longest = Math.max(...days.map(day => day.minutes));
  const shortest = Math.min(...days.map(day => day.minutes));
  const polarDays = days.filter(day => day.polarDay).length;
  const polarNights = days.filter(day => day.polarNight).length;
  const selected = currentDate.toISOString().slice(0, 10);
  return (
    <Dialog title={`Annual daylight · ${city.name}`} onClose={onClose}>
      <div className="flex flex-wrap justify-between gap-4 items-center mb-5">
        <p className="text-sm text-slate-400 max-w-xl">Explore daylight through the year. Select a day to return to that date in the atlas. Dates use UTC.</p>
        <div className="flex items-center gap-3">
          <button aria-label="Previous year" disabled={year <= 1900} onClick={() => setYear(year - 1)}
            className="rounded-lg px-3 py-2 bg-slate-800 disabled:opacity-30 cursor-pointer">←</button>
          <span className="font-mono text-lg text-sky-300">{year}</span>
          <button aria-label="Next year" disabled={year >= 2100} onClick={() => setYear(year + 1)}
            className="rounded-lg px-3 py-2 bg-slate-800 disabled:opacity-30 cursor-pointer">→</button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[['Longest day', formatDaylight(longest)], ['Shortest day', formatDaylight(shortest)],
          ['Polar daylight', `${polarDays} days`], ['Polar night', `${polarNights} days`]].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
            <div className="text-xs text-slate-400">{label}</div>
            <div className="font-mono font-semibold text-amber-300 mt-1">{value}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-400 mb-5">
        <span>0h</span><div className="w-40 h-2 rounded-full" style={{ background: 'linear-gradient(to right, hsl(220 80% 20%), hsl(130 80% 35%), hsl(40 80% 50%))' }} /><span>24h daylight</span>
        <span className="ml-auto">Hover or focus a day for its duration</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 12 }, (_, month) => {
          const monthDays = days.filter(day => day.date.getUTCMonth() === month);
          const offset = (monthDays[0].date.getUTCDay() + 6) % 7;
          const monthName = monthDays[0].date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
          return (
            <section key={month} aria-label={`${monthName} ${year}`} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <h3 className="font-semibold mb-3">{monthName}</h3>
              <div className="grid grid-cols-7 gap-1">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => <span key={i} className="text-center text-[10px] text-slate-500">{day}</span>)}
                {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
                {monthDays.map(day => {
                  const iso = day.date.toISOString().slice(0, 10);
                  const label = `${iso}: ${formatDaylight(day.minutes)} daylight${day.polarDay ? ', polar day' : day.polarNight ? ', polar night' : ''}`;
                  return <button key={iso} title={label} aria-label={label} aria-pressed={iso === selected}
                    onClick={() => onSelectDate(day.date)}
                    className={`aspect-square rounded text-xs font-mono cursor-pointer focus-visible:outline-2 focus-visible:outline-white hover:ring-2 hover:ring-sky-300 ${iso === selected ? 'ring-2 ring-white' : ''}`}
                    style={{ backgroundColor: `hsl(${220 - day.minutes / 8} 80% ${20 + day.minutes / 48}%)`, color: day.minutes > 720 ? '#0f172a' : '#f8fafc' }}>
                    {day.date.getUTCDate()}
                  </button>;
                })}
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 mt-5">Calculated sunrise-to-sunset duration includes the standard solar-disc and refraction correction. Terrain and weather are not modeled.</p>
    </Dialog>
  );
}
