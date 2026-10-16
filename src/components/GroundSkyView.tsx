import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CityData } from '../types';
import { getSolarMilestones, getSolarPosition, getSolarTimes } from '../utils/solarCalculator';
import { clampSkyPitch, normalizeHeading, projectSkyPoint } from '../utils/skyProjection';
import { Dialog } from './Dialog';

export function GroundSkyView({ city, currentDate, onUpdateDate, onClose }: {
  city: CityData; currentDate: Date; onUpdateDate: (date: Date) => void; onClose: () => void;
}) {
  const position = useMemo(() => getSolarPosition(city.lat, city.lng, currentDate), [city, currentDate]);
  const [view, setView] = useState(() => ({ heading: position.azimuth, pitch: clampSkyPitch(Math.max(10, position.elevation)) }));
  const [seasonal, setSeasonal] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 800, height: 400 });
  const dayKey = currentDate.toISOString().slice(0, 10);
  const year = currentDate.getUTCFullYear();
  const paths = useMemo(() => {
    const definitions = [{ id: 'today', name: 'Selected day', date: new Date(`${dayKey}T12:00:00Z`), color: '#fde047' },
      ...getSolarMilestones(year)];
    return definitions.map(definition => {
      const midnight = new Date(definition.date);
      midnight.setUTCHours(0, 0, 0, 0);
      const points = Array.from({ length: 145 }, (_, i) => getSolarPosition(city.lat, city.lng,
        new Date(midnight.getTime() + i * 600000)));
      return { ...definition, points };
    });
  }, [city.lat, city.lng, dayKey, year]);
  const horizonEvents = useMemo(() => {
    const times = getSolarTimes(city.lat, city.lng, new Date(`${dayKey}T12:00:00Z`));
    return [{ name: 'Sunrise', date: times.sunrise }, { name: 'Sunset', date: times.sunset }]
      .filter(event => event.date !== null).map(event => ({ name: event.name,
        azimuth: getSolarPosition(city.lat, city.lng, event.date!).azimuth }));
  }, [city.lat, city.lng, dayKey]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const update = () => setSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(size.width * ratio)) canvas.width = Math.round(size.width * ratio);
    if (canvas.height !== Math.round(size.height * ratio)) canvas.height = Math.round(size.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const { width, height } = size;
    const project = (azimuth: number, elevation: number) => projectSkyPoint(azimuth, elevation,
      view.heading, view.pitch, width, height);
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, position.elevation > 0 ? '#09264c' : '#020617');
    sky.addColorStop(1, position.elevation > 6 ? '#82c4e8' : position.elevation > -12 ? '#875441' : '#0f172a');
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
    const horizonY = height / 2 + width / 2 * Math.tan(view.pitch * Math.PI / 180);
    context.fillStyle = '#14201e';
    context.fillRect(0, Math.max(0, horizonY), width, Math.max(0, height - horizonY));

    const line = (points: { azimuth: number; elevation: number }[], color: string, thickness: number,
      aboveHorizon = false) => {
      context.beginPath();
      let penDown = false;
      for (const point of points) {
        const projected = project(point.azimuth, point.elevation);
        if ((aboveHorizon && point.elevation < 0) || !projected || projected.x < -width || projected.x > width * 2 ||
            projected.y < -height || projected.y > height * 2) { penDown = false; continue; }
        if (penDown) context.lineTo(projected.x, projected.y);
        else context.moveTo(projected.x, projected.y);
        penDown = true;
      }
      context.strokeStyle = color;
      context.lineWidth = thickness;
      context.stroke();
    };
    for (const altitude of [0, 15, 30, 45, 60, 75]) {
      line(Array.from({ length: 181 }, (_, i) => ({ azimuth: i * 2, elevation: altitude })),
        altitude === 0 ? '#94a3b8' : '#ffffff25', 1);
    }
    for (let azimuth = 0; azimuth < 360; azimuth += 45) {
      line(Array.from({ length: 31 }, (_, i) => ({ azimuth, elevation: i * 3 })), '#ffffff20', 1);
    }
    for (const path of paths) {
      if (path.id === 'today' || seasonal) line(path.points, path.color, path.id === 'today' ? 3 : 1.5, true);
    }
    const label = (text: string, azimuth: number, elevation: number, color: string, offset = 0) => {
      const point = project(azimuth, elevation);
      if (!point || point.x < 0 || point.x > width || point.y < -20 || point.y > height + 20) return;
      context.font = '12px monospace';
      const half = context.measureText(text).width / 2;
      context.textAlign = 'center';
      context.fillStyle = color;
      context.fillText(text, Math.max(half + 8, Math.min(width - half - 8, point.x)),
        Math.max(18, Math.min(height - 10, point.y + offset)));
    };
    ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].forEach((name, i) => label(name, i * 45, 0, '#e2e8f0', 22));
    for (const event of horizonEvents) label(event.name, event.azimuth, 0, '#fbbf24', -12);
    const sun = project(position.azimuth, position.elevation);
    if (sun && position.elevation >= 0 && sun.x >= -30 && sun.x <= width + 30 && sun.y >= -30 && sun.y <= height + 30) {
      const glow = context.createRadialGradient(sun.x, sun.y, 3, sun.x, sun.y, 35);
      glow.addColorStop(0, '#fffbdc'); glow.addColorStop(0.3, '#fbbf24aa'); glow.addColorStop(1, '#fbbf2400');
      context.fillStyle = glow;
      context.beginPath(); context.arc(sun.x, sun.y, 35, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#fffbeb';
      context.beginPath(); context.arc(sun.x, sun.y, 7, 0, Math.PI * 2); context.fill();
      label(`Sun ${position.elevation.toFixed(1)}°`, position.azimuth, position.elevation, '#fffbeb', -18);
    }
  }, [size, view, position, paths, seasonal, horizonEvents]);

  const shiftTime = (hours: number) => onUpdateDate(new Date(currentDate.getTime() + hours * 3600000));
  return (
    <Dialog title={`Ground-level sky · ${city.name}`} onClose={onClose}>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div>
          <p className="text-sm text-slate-300">{currentDate.toLocaleString('en-US', { timeZone: city.timezone })} · {city.timezone}</p>
          <p className="text-xs text-slate-400">Sun altitude {position.elevation.toFixed(1)}° · azimuth {position.azimuth.toFixed(1)}° · {position.elevation < 0 ? 'Sun below the horizon' : position.phaseLabel}</p>
        </div>
        <button onClick={() => setView({ heading: position.azimuth, pitch: clampSkyPitch(Math.max(5, position.elevation)) })}
          className="rounded-lg bg-amber-500/20 px-3 py-2 text-sm text-amber-300 cursor-pointer">Face the Sun</button>
      </div>
      <canvas ref={canvasRef} tabIndex={0} aria-label="Perspective sky from the selected location. Drag or use arrow keys to look around."
        className="w-full rounded-xl border border-slate-700 cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-sky-300"
        style={{ height: 'min(52vh, 440px)', minHeight: 260, touchAction: 'none' }}
        onPointerDown={event => { event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY }; }}
        onPointerMove={event => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
          dragRef.current = { x: event.clientX, y: event.clientY };
          setView(previous => ({ heading: normalizeHeading(previous.heading - dx * 0.25), pitch: clampSkyPitch(previous.pitch + dy * 0.25) }));
        }}
        onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          setView(previous => ({ heading: normalizeHeading(previous.heading + (event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0)),
            pitch: clampSkyPitch(previous.pitch + (event.key === 'ArrowUp' ? 5 : event.key === 'ArrowDown' ? -5 : 0)) }));
        }}>
        Your browser does not support the sky canvas.
      </canvas>
      <p className="text-xs text-slate-400 mt-2">Drag or use arrow keys to look around. North is 0°, east 90°, south 180°, west 270°. The view spans 90° horizontally.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <label className="text-sm">Heading <span className="text-sky-300 font-mono">{Math.round(view.heading) % 360}°</span>
          <input type="range" min="0" max="359" value={Math.round(view.heading) % 360}
            onChange={event => setView({ ...view, heading: Number(event.target.value) })} className="block w-full mt-2 accent-sky-400" />
        </label>
        <label className="text-sm">Look up <span className="text-sky-300 font-mono">{Math.round(view.pitch)}°</span>
          <input type="range" min="-10" max="80" value={Math.round(view.pitch)}
            onChange={event => setView({ ...view, pitch: Number(event.target.value) })} className="block w-full mt-2 accent-sky-400" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 my-4">
        {[['−1 day', -24], ['−1 hour', -1], ['+1 hour', 1], ['+1 day', 24]].map(([name, hours]) => (
          <button key={name} onClick={() => shiftTime(Number(hours))} className="bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 text-xs cursor-pointer">{name}</button>
        ))}
        <span className="text-xs font-mono text-slate-400 ml-auto">{currentDate.toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
      </div>
      <label className="text-sm flex gap-2 items-center mb-3"><input type="checkbox" checked={seasonal}
        onChange={event => setSeasonal(event.target.checked)} className="accent-sky-400" /> Show seasonal paths</label>
      <div className="flex flex-wrap gap-3 text-xs">{paths.filter(path => seasonal || path.id === 'today').map(path => (
        <span key={path.id} style={{ color: path.color }}>● {path.name}</span>
      ))}</div>
      <p className="mt-4 text-xs text-slate-500">An ideal, level horizon with perspective solar paths. Buildings, terrain, clouds, and atmospheric distortion are not shown.</p>
    </Dialog>
  );
}
