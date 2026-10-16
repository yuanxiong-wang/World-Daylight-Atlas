import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Layers, MapPin, Menu, Pause, Play } from 'lucide-react';
import type { CityData, GlobeLayerSettings, ViewMode } from '../types';
import { getSolarPosition, getSolarTimes, getSolarMilestones } from '../utils/solarCalculator';
import { getLunarPhase } from '../utils/lunarCalculator';
import { formatDaylight } from '../utils/daylightCalendar';
import { MoonDiskSVG } from './MoonPhaseBadge';
import { LocalClock } from './LocalClock';
import { Dialog } from './Dialog';

export type MobileTool = 'tour' | 'share' | 'calendar' | 'compare' | 'sky' | 'analytics' | 'inspector';
type Sheet = 'cities' | 'city' | 'time' | 'layers' | 'tools' | 'moon';

const LAYER_OPTIONS = [
  ['showSunTrajectory', "Today's solar path"], ['showSeasonalPaths', 'Seasonal solar paths'],
  ['showCities', 'City markers'], ['showAtmosphere', 'Atmosphere'], ['showClouds', 'Clouds'],
  ['showNightLights', 'Night lights'], ['showTerminator', 'Daylight boundary'],
  ['showTwilightBands', 'Twilight boundaries'], ['showSubsolarPoint', 'Subsolar point'],
  ['showSunRays', 'Sun rays'], ['showGraticule', 'Latitude / longitude grid'], ['autoRotate', 'Auto-rotate globe'],
] as const;

export function MobileControls({ reducedMotion, currentDate, cities, selectedCity, layers, viewMode, isPlaying,
  playbackSpeed, onSelectCity, onUpdateDate, onUpdateLayers, onChangeViewMode, onTogglePlay,
  onChangeSpeed, onResetToNow, onCameraPreset, onOpenTool }: {
  reducedMotion: boolean; currentDate: Date; cities: CityData[]; selectedCity: CityData | null;
  layers: GlobeLayerSettings; viewMode: ViewMode; isPlaying: boolean; playbackSpeed: number;
  onSelectCity: (city: CityData | null) => void; onUpdateDate: (date: Date) => void;
  onUpdateLayers: (layers: Partial<GlobeLayerSettings>) => void;
  onChangeViewMode: (mode: ViewMode) => void; onTogglePlay: () => void;
  onChangeSpeed: (speed: number) => void; onResetToNow: () => void;
  onCameraPreset: (preset: string) => void; onOpenTool: (tool: MobileTool) => void;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [search, setSearch] = useState('');
  const toolsRef = useRef<HTMLButtonElement>(null);
  const solar = selectedCity ? getSolarPosition(selectedCity.lat, selectedCity.lng, currentDate) : null;
  const times = useMemo(() => selectedCity ? getSolarTimes(selectedCity.lat, selectedCity.lng, currentDate) : null,
    [selectedCity, currentDate]);
  const lunar = useMemo(() => getLunarPhase(currentDate), [currentDate]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setSheet(null); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  const openTool = (tool: MobileTool) => {
    // Restore focus to a persistent control after the next dialog closes.
    toolsRef.current?.focus();
    setSheet(null);
    onOpenTool(tool);
  };
  const focus = (preset: string) => {
    onChangeViewMode('3d-globe');
    onCameraPreset(preset);
    setSheet(null);
  };
  const button = 'min-h-11 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-left hover:bg-slate-700 disabled:opacity-40 cursor-pointer';
  const titles: Record<Sheet, string> = {
    cities: 'Choose a city', city: selectedCity?.name ?? 'Location details', time: 'Time & playback',
    layers: 'Globe layers', tools: 'Atlas tools', moon: 'Moon phases',
  };
  const clock = (date: Date | null) => date && selectedCity ? date.toLocaleTimeString('en-US', {
    timeZone: selectedCity.timezone, hour: '2-digit', minute: '2-digit',
  }) : '—';
  return (
    <div className="lg:hidden">
      <header data-testid="mobile-header" className="fixed top-0 inset-x-0 z-20 flex items-center justify-between gap-2 border-b border-slate-700/60 bg-slate-950/85 backdrop-blur-md px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <h1 className="text-xs font-semibold text-white truncate">World Daylight Atlas</h1>
          <p data-testid="utc-clock" className="text-[10px] font-mono text-slate-400">{currentDate.toISOString().slice(0, 10)} · {currentDate.toISOString().slice(11, 16)} UTC</p>
          <LocalClock date={currentDate} />
        </div>
        <button onClick={() => { onChangeViewMode(viewMode === '3d-globe' ? '2d-map' : '3d-globe'); setSheet(null); }}
          aria-label={viewMode === '3d-globe' ? 'Switch to 2D map' : 'Switch to 3D globe'}
          className="shrink-0 min-h-11 min-w-11 rounded-xl bg-slate-800 text-xs text-sky-300 cursor-pointer">
          {viewMode === '3d-globe' ? '2D' : '3D'}
        </button>
      </header>

      <nav data-testid="mobile-navigation" aria-label="Mobile atlas controls"
        className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-700/70 bg-slate-950/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        {selectedCity && solar && <button onClick={() => setSheet('city')}
          aria-label={`City details for ${selectedCity.name}`} aria-expanded={sheet === 'city'}
          className="w-full min-h-11 px-4 flex items-center justify-between gap-3 border-b border-slate-800 text-xs cursor-pointer">
          <span className="truncate font-semibold text-sky-300">{selectedCity.name}</span>
          <span className="shrink-0 text-slate-400">{solar.elevation.toFixed(1)}° · Details ↑</span>
        </button>}
        <div className="grid grid-cols-5 gap-1 px-1">
          {[
            { id: 'cities', label: 'Cities', icon: MapPin }, { id: 'time', label: 'Time', icon: Clock },
          ].map(item => <button key={item.id} onClick={() => setSheet(item.id as Sheet)} aria-expanded={sheet === item.id}
            className="min-h-14 flex flex-col items-center justify-center gap-1 text-[10px] text-slate-300 cursor-pointer">
            <item.icon size={18} /><span>{item.label}</span>
          </button>)}
          <button onClick={onTogglePlay} aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
            className="min-h-14 flex flex-col items-center justify-center gap-1 text-[10px] text-amber-300 cursor-pointer">
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}<span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button onClick={() => setSheet('layers')} aria-expanded={sheet === 'layers'}
            className="min-h-14 flex flex-col items-center justify-center gap-1 text-[10px] text-slate-300 cursor-pointer">
            <Layers size={18} /><span>Layers</span>
          </button>
          <button ref={toolsRef} onClick={() => setSheet('tools')} aria-expanded={sheet === 'tools'}
            className="min-h-14 flex flex-col items-center justify-center gap-1 text-[10px] text-slate-300 cursor-pointer">
            <Menu size={18} /><span>Tools</span>
          </button>
        </div>
      </nav>

      {sheet && <Dialog title={titles[sheet]} placement="bottom" onClose={() => setSheet(null)}>
        {sheet === 'cities' && <div className="space-y-3">
          <label className="block text-sm text-slate-400">Search cities
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="City or country"
              className="block w-full mt-2 rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-base" />
          </label>
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2">
            {cities.filter(city => `${city.name} ${city.country}`.toLowerCase().includes(search.toLowerCase())).map(city => (
              <button key={city.id} className={button} onClick={() => { onSelectCity(city); onChangeViewMode('3d-globe'); setSheet(null); }}>
                <span className="block text-sky-300 font-medium">{city.name}</span><span className="text-xs text-slate-400">{city.country}</span>
              </button>
            ))}
          </div>
        </div>}

        {sheet === 'city' && selectedCity && solar && times && <div className="space-y-4">
          <p className="text-sm text-slate-400">{selectedCity.country} · {Math.abs(selectedCity.lat).toFixed(1)}°{selectedCity.lat >= 0 ? 'N' : 'S'}, {Math.abs(selectedCity.lng).toFixed(1)}°{selectedCity.lng >= 0 ? 'E' : 'W'}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-400">Sun altitude</dt><dd className="text-amber-300">{solar.elevation.toFixed(1)}° · {solar.phaseLabel}</dd></div>
            <div><dt className="text-slate-400">Daylight</dt><dd>{formatDaylight(times.dayLengthMinutes)}</dd></div>
            <div><dt className="text-slate-400">Sunrise</dt><dd>{clock(times.sunrise)}</dd></div>
            <div><dt className="text-slate-400">Sunset</dt><dd>{clock(times.sunset)}</dd></div>
          </dl>
          <div className="grid grid-cols-2 gap-2">
            <button className={button} onClick={() => focus('focus-trajectory')}>3D Sky Dome</button>
            <button className={button} onClick={() => openTool('inspector')}>Trajectory chart</button>
            <button className={button} onClick={() => openTool('calendar')}>Annual daylight</button>
            <button className={button} onClick={() => openTool('sky')}>Ground-level sky</button>
          </div>
          <button onClick={() => { onSelectCity(null); setSheet(null); }} className="min-h-11 text-xs text-slate-400 underline cursor-pointer">Clear selected location</button>
        </div>}

        {sheet === 'time' && <div className="space-y-5">
          {reducedMotion && <p className="text-xs text-slate-400">Reduced motion: playback steps once per second; automatic rotation is off.</p>}
          <label className="block text-sm">Simulation time (UTC)
            <input type="datetime-local" value={currentDate.toISOString().slice(0, 16)} min="1900-01-01T00:00" max="2100-12-31T23:59"
              onChange={event => { const date = new Date(`${event.target.value}Z`); if (Number.isFinite(date.getTime())) onUpdateDate(date); }}
              className="mt-2 w-full min-w-0 rounded-xl bg-slate-950 border border-slate-600 p-3 text-base" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button className={button} onClick={() => onUpdateDate(new Date(currentDate.getTime() - 86400000))}>−1 day</button>
            <button className={button} onClick={() => { onResetToNow(); setSheet(null); }}>Now</button>
            <button className={button} onClick={() => onUpdateDate(new Date(currentDate.getTime() + 86400000))}>+1 day</button>
          </div>
          <fieldset><legend className="text-sm mb-2">Playback speed</legend>
            <div className="grid grid-cols-3 gap-2">{[[1, '1×'], [60, '1 min/s'], [300, '5 min/s'], [1800, '30 min/s'], [3600, '1 hour/s']].map(([value, label]) => (
              <button key={value} aria-pressed={playbackSpeed === value} className={`${button} ${playbackSpeed === value ? 'border-sky-400 text-sky-300' : ''}`}
                onClick={() => onChangeSpeed(Number(value))}>{label}</button>
            ))}</div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2">{getSolarMilestones(currentDate.getUTCFullYear()).map(milestone => <button key={milestone.id} className={button}
            style={{ color: milestone.color }} onClick={() => {
              onUpdateDate(new Date(milestone.date)); setSheet(null);
            }}>{milestone.name}</button>)}</div>
        </div>}

        {sheet === 'layers' && <div className="space-y-1">
          {LAYER_OPTIONS.map(([key, label]) => <label key={key} className="min-h-12 flex items-center justify-between gap-3 border-b border-slate-800 py-2 text-sm cursor-pointer">
            {label}<input type="checkbox" disabled={key === 'autoRotate' && reducedMotion} checked={key === 'autoRotate' && reducedMotion ? false : layers[key]} onChange={event => onUpdateLayers({ [key]: event.target.checked })} className="w-5 h-5 accent-sky-400 shrink-0" />
          </label>)}
          <label className="block pt-4 text-sm">Cloud opacity
            <input type="range" min="0" max="1" step="0.1" value={layers.cloudOpacity} onChange={event => onUpdateLayers({ cloudOpacity: Number(event.target.value) })} className="mt-3 w-full accent-sky-400" />
          </label>
        </div>}

        {sheet === 'tools' && <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">{([
            ['tour', 'Helix globe tour'], ['share', 'Share view'], ['calendar', 'Annual daylight'], ['compare', 'Compare cities'],
            ['sky', 'Ground-level sky'], ['analytics', 'Solar analytics'], ['inspector', 'Trajectory chart'],
          ] as const).map(([tool, label]) => <button key={tool} className={button}
            disabled={!selectedCity && ['calendar', 'sky', 'inspector'].includes(tool)} onClick={() => openTool(tool)}>{label}</button>)}
            <button className={button} onClick={() => setSheet('moon')}>Moon phases</button>
          </div>
          <fieldset><legend className="mb-2 text-xs text-slate-400 uppercase tracking-wide">Camera views</legend>
            <div className="grid grid-cols-2 gap-2">{[
              ['focus-city', 'Selected city'], ['focus-trajectory', '3D Sky Dome'], ['solar-view', 'Sun-facing Earth'],
              ['north-pole', 'North Pole'], ['south-pole', 'South Pole'], ['equator-view', 'Equator'],
            ].map(([preset, label]) => <button key={preset} className={button}
              disabled={!selectedCity && preset.startsWith('focus-')} onClick={() => focus(preset)}>{label}</button>)}</div>
          </fieldset>
        </div>}

        {sheet === 'moon' && <div className="space-y-4">
          <div className="flex items-center gap-4"><MoonDiskSVG illumination={lunar.illumination} elongationDeg={lunar.elongationDeg} size={64} />
            <div><p className="text-lg text-amber-300">{lunar.phaseName}</p><p className="text-sm text-slate-400">{lunar.illumination.toFixed(1)}% illuminated · age {lunar.ageDays.toFixed(1)} days</p></div>
          </div>
          <button className={`${button} w-full`} onClick={() => { onUpdateDate(lunar.nextFullMoonDate); setSheet(null); }}>Next full moon · {lunar.nextFullMoonDate.toLocaleDateString()}</button>
          <button className={`${button} w-full`} onClick={() => { onUpdateDate(lunar.nextNewMoonDate); setSheet(null); }}>Next new moon · {lunar.nextNewMoonDate.toLocaleDateString()}</button>
        </div>}
      </Dialog>}
    </div>
  );
}
