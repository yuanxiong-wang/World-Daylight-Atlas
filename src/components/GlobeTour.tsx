import React, { useEffect, useRef } from 'react';
import type { CityData } from '../types';
import { getSolarPosition, getSolarTimes } from '../utils/solarCalculator';
import { formatDaylight } from '../utils/daylightCalendar';
import { sampleTour, TOUR_NOTES } from '../utils/globeTour';

export function GlobeTour({ stops, progress, reducedMotion, currentDate, onProgress, onClose }: {
  stops: CityData[]; progress: number; reducedMotion: boolean; currentDate: Date;
  onProgress: (progress: number) => void; onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  const { stopIndex, vortex } = sampleTour(progress, stops, reducedMotion);
  const city = stops[stopIndex];
  const solar = getSolarPosition(city.lat, city.lng, currentDate);
  const times = getSolarTimes(city.lat, city.lng, currentDate);
  useEffect(() => { exitRef.current?.focus(); }, []);
  const go = (index: number) => {
    const node = scrollRef.current;
    if (node) node.scrollTop = index / (stops.length - 1) * (node.scrollHeight - node.clientHeight);
  };
  // Preserve the current stop when rotating a phone or resizing a window.
  const progressRef = useRef(progress);
  progressRef.current = progress;
  useEffect(() => {
    const resize = () => {
      const node = scrollRef.current;
      if (node) node.scrollTop = progressRef.current / (stops.length - 1) * (node.scrollHeight - node.clientHeight);
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [stops.length]);
  return <div className="fixed inset-0 z-40" role="region" aria-label="Helix globe tour"
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.target instanceof HTMLInputElement || event.key === 'Tab' || event.key === 'Enter' || event.key === ' ') return;
      if (['ArrowDown', 'ArrowRight', 'PageDown', 'ArrowUp', 'ArrowLeft', 'PageUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        go(event.key === 'Home' ? 0 : event.key === 'End' ? stops.length - 1 : Math.max(0, Math.min(stops.length - 1,
          stopIndex + (['ArrowDown', 'ArrowRight', 'PageDown'].includes(event.key) ? 1 : -1))));
      }
    }}>
    {!reducedMotion && <svg data-testid="tour-vortex" aria-hidden="true" className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice"
      style={{ opacity: vortex * 0.45, transform: `rotate(${progress * 240}deg)` }}>
      <defs><radialGradient id="tour-glow"><stop stopColor="#38bdf8" stopOpacity="0"/><stop offset="1" stopColor="#8b5cf6" stopOpacity="0.6"/></radialGradient></defs>
      {Array.from({ length: 12 }, (_, i) => <ellipse key={i} cx="500" cy="500" rx={100 + i * 43} ry={65 + i * 34}
        fill="none" stroke={i % 2 ? '#a78bfa' : '#38bdf8'} strokeWidth="2" transform={`rotate(${i * 17} 500 500)`} />)}
      <circle cx="500" cy="500" r="650" fill="url(#tour-glow)" />
    </svg>}
    <div ref={scrollRef} data-testid="tour-scroll" tabIndex={0} aria-label="Scroll to travel between cities"
      className="absolute inset-0 overflow-y-auto overscroll-contain outline-none touch-pan-y"
      onScroll={event => { const node = event.currentTarget; onProgress(node.scrollTop / Math.max(1, node.scrollHeight - node.clientHeight) * (stops.length - 1)); }}>
      <div style={{ height: `${stops.length * 110}dvh` }} aria-hidden="true" />
    </div>
    <header className="absolute top-0 inset-x-0 pointer-events-none flex items-start justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="rounded-xl bg-slate-950/85 px-3 py-2"><h1 className="text-sm font-semibold text-sky-300">Helix globe tour</h1>
        <p className="text-xs text-slate-300">{reducedMotion ? 'Reduced motion · city steps' : 'Scroll or swipe to travel'} · {currentDate.toISOString().slice(0, 10)} UTC</p></div>
      <button ref={exitRef} onClick={onClose} className="pointer-events-auto min-h-11 rounded-xl border border-slate-600 bg-slate-950/90 px-4 text-sm cursor-pointer">Exit tour</button>
    </header>
    <section aria-label="Tour stop" className="absolute bottom-0 inset-x-0 mx-auto max-w-xl rounded-t-2xl border border-slate-700 bg-slate-950/90 p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div aria-live="polite" aria-atomic="true"><p className="text-xs text-sky-300">Stop {stopIndex + 1} of {stops.length} · {city.country}</p>
        <h2 className="text-lg font-semibold">{city.name}</h2></div>
      <p className="text-xs text-slate-300 mt-1">{TOUR_NOTES[stopIndex]}</p>
      <p className="text-xs text-amber-300 mt-2">{formatDaylight(times.dayLengthMinutes)} daylight · Sun {solar.elevation.toFixed(1)}° · {solar.phaseLabel}</p>
      <label className="block text-xs text-slate-400 mt-2">Tour progress
        <input aria-label="Tour progress" type="range" min="0" max={stops.length - 1} step="0.01" value={progress}
          onChange={event => go(Number(event.target.value))} className="block w-full min-h-8 accent-sky-400" /></label>
      <div className="flex justify-between items-center gap-3 text-xs">
        <button disabled={stopIndex === 0} onClick={() => go(stopIndex - 1)} className="min-h-11 px-3 rounded-lg bg-slate-800 disabled:opacity-30 cursor-pointer">Previous stop</button>
        <span className="text-slate-400">{Math.round(progress / (stops.length - 1) * 100)}%</span>
        <button disabled={stopIndex === stops.length - 1} onClick={() => go(stopIndex + 1)} className="min-h-11 px-3 rounded-lg bg-slate-800 disabled:opacity-30 cursor-pointer">Next stop</button>
      </div>
    </section>
  </div>;
}
