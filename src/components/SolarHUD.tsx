import React, { useState, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Layers,
  Clock,
  Compass,
  MapPin,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Calendar,
  Globe2,
  Moon,
} from 'lucide-react';
import { SubsolarPoint, GlobeLayerSettings, CityData, ViewMode, LunarPhaseType } from '../types';
import { getSolarPosition, getSolarMilestones } from '../utils/solarCalculator';
import { getLunarPhase } from '../utils/lunarCalculator';
import { LocalClock } from './LocalClock';
import { MoonPhaseBadge, MoonDiskSVG } from './MoonPhaseBadge';

interface SolarHUDProps {
  reducedMotion: boolean;
  currentDate: Date;
  onUpdateDate: (date: Date) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playbackSpeed: number;
  onChangeSpeed: (speed: number) => void;
  onResetToNow: () => void;
  subsolarPoint: SubsolarPoint;
  layers: GlobeLayerSettings;
  onUpdateLayers: (newLayers: Partial<GlobeLayerSettings>) => void;
  cities: CityData[];
  selectedCity: CityData | null;
  onSelectCity: (city: CityData | null) => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onTriggerCameraPreset: (preset: string) => void;
  onOpenAnalytics: () => void;
}

export const SolarHUD: React.FC<SolarHUDProps> = ({
  reducedMotion,
  currentDate,
  onUpdateDate,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onChangeSpeed,
  onResetToNow,
  subsolarPoint,
  layers,
  onUpdateLayers,
  cities,
  selectedCity,
  onSelectCity,
  viewMode,
  onChangeViewMode,
  onTriggerCameraPreset,
  onOpenAnalytics,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'timeline' | 'layers' | 'camera' | 'cities' | 'lunar'>('timeline');
  const [citySearchQuery, setCitySearchQuery] = useState('');

  // Real-time Lunar Phase Calculation
  const lunarPhase = useMemo(() => getLunarPhase(currentDate), [currentDate]);

  // Timeline slider value (minutes from UTC midnight: 0 to 1440)
  const currentMinutesFromMidnight =
    currentDate.getUTCHours() * 60 +
    currentDate.getUTCMinutes() +
    currentDate.getUTCSeconds() / 60;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const minutes = parseFloat(e.target.value);
    const newDate = new Date(currentDate);
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.floor((minutes * 60) % 60);
    newDate.setUTCHours(hours, mins, secs);
    onUpdateDate(newDate);
  };

  const handleDayStep = (days: number) => {
    const newDate = new Date(currentDate.getTime() + days * 86400000);
    onUpdateDate(newDate);
  };

  // Jump to the computed astronomical event instant.
  const handleJumpToSeason = (date: Date) => onUpdateDate(new Date(date));

  // Filter cities by search
  const filteredCities = cities.filter(
    (c) =>
      c.name.toLowerCase().includes(citySearchQuery.toLowerCase()) ||
      c.country.toLowerCase().includes(citySearchQuery.toLowerCase())
  );

  return (
    <>
      {/* Top Bar Header (Compact & Minimal) */}
      <header className="absolute top-4 left-4 right-4 z-20 hidden lg:flex items-center justify-between pointer-events-none gap-2">
        {/* Brand & Real-time Subsolar Metrics */}
        <div className="pointer-events-auto bg-slate-900/85 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 sm:px-4 py-2.5 shadow-xl flex items-center gap-3 sm:gap-4 text-white w-full sm:w-auto min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-sm">
              ☉
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white leading-none">
                World Daylight Atlas
              </h1>
              <span className="text-[10px] text-slate-400 font-mono">
                Subsolar: {Math.abs(subsolarPoint.lat).toFixed(1)}°{subsolarPoint.lat >= 0 ? 'N' : 'S'},{' '}
                {Math.abs(subsolarPoint.lng).toFixed(1)}°{subsolarPoint.lng >= 0 ? 'E' : 'W'} (δ={subsolarPoint.declination.toFixed(1)}°)
              </span>
            </div>
          </div>

          <div className="hidden sm:block h-6 w-px bg-slate-800" />

          {/* UTC & Local Clock */}
          <div className="hidden sm:grid grid-cols-2 items-center gap-x-3 gap-y-1 text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">UTC Time</span>
              <span data-testid="utc-clock" className="text-sky-300 font-semibold">
                {currentDate.toISOString().slice(11, 19)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Date</span>
              <span className="text-slate-300 font-semibold">
                {currentDate.toISOString().slice(0, 10)}
              </span>
            </div>
            <LocalClock date={currentDate} className="col-span-2 whitespace-nowrap text-xs font-mono font-semibold text-sky-300" />
          </div>
        </div>

        {/* Real-time Lunar Phase Indicator Badge */}
        <div className="pointer-events-auto hidden lg:block">
          <MoonPhaseBadge currentDate={currentDate} />
        </div>

        {/* View Toggle & Analytics Trigger */}
        <div className="pointer-events-auto flex items-center justify-end gap-2 w-full sm:w-auto">
          {/* View Mode Toggle */}
          <div className="bg-slate-900/85 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-xl flex items-center text-xs">
            <button
              onClick={() => onChangeViewMode('3d-globe')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                viewMode === '3d-globe'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>3D Globe</span>
            </button>
            <button
              onClick={() => onChangeViewMode('2d-map')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                viewMode === '2d-map'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>2D Atlas Map</span>
            </button>
          </div>

          {/* Solar Analytics Button */}
          <button
            onClick={onOpenAnalytics}
            className="pointer-events-auto bg-slate-900/85 backdrop-blur-md hover:bg-slate-800 border border-slate-700/80 text-amber-400 hover:text-amber-300 px-3.5 py-2 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Solar Analytics</span>
          </button>
        </div>
      </header>

      {/* Unified Bottom Control Dock (Adheres strictly to Three.js Ergonomic Bottom Dock Specification) */}
      <div
        className={`hidden lg:block fixed bottom-5 left-1/2 -translate-x-1/2 z-30 w-full max-w-4xl px-4 transition-transform duration-300 ease-in-out ${
          isCollapsed ? 'translate-y-[calc(100%-38px)]' : 'translate-y-0'
        }`}
      >
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200">
          {/* Dock Header Bar with Collapse Toggle & Navigation Tabs */}
          <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
            {/* Tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setActiveTab('timeline');
                  setIsCollapsed(false);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'timeline' && !isCollapsed
                    ? 'bg-slate-800 text-sky-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Timeline &amp; Time</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('layers');
                  setIsCollapsed(false);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'layers' && !isCollapsed
                    ? 'bg-slate-800 text-sky-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Earth Layers</span>
              </button>

              {viewMode === '3d-globe' && (
                <button
                  onClick={() => {
                    setActiveTab('camera');
                    setIsCollapsed(false);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    activeTab === 'camera' && !isCollapsed
                      ? 'bg-slate-800 text-sky-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Camera Presets</span>
                </button>
              )}

              <button
                onClick={() => {
                  setActiveTab('cities');
                  setIsCollapsed(false);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'cities' && !isCollapsed
                    ? 'bg-slate-800 text-sky-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Cities ({cities.length})</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('lunar');
                  setIsCollapsed(false);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'lunar' && !isCollapsed
                    ? 'bg-slate-800 text-amber-300 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-amber-300" />
                <span>Moon ({lunarPhase.glyph})</span>
              </button>
            </div>

            {/* Collapse / Expand Toggle Button */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 flex items-center gap-1 text-xs cursor-pointer"
              title={isCollapsed ? 'Show Controls (H)' : 'Hide Controls (H)'}
            >
              {isCollapsed ? (
                <>
                  <ChevronUp className="w-4 h-4 text-sky-400" />
                  <span className="hidden sm:inline">Show Controls</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  <span className="hidden sm:inline">Zen View</span>
                </>
              )}
            </button>
          </div>

          {/* Dock Content Body */}
          <div className="p-4">
            {/* TAB 1: TIMELINE & SIMULATION */}
            {activeTab === 'timeline' && (
              <div className="space-y-3">
                {/* 24-Hour Scrubber Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span>00:00 UTC</span>
                    <span className="text-amber-400 font-semibold">
                      Current Solar Time: {currentDate.toISOString().slice(11, 16)} UTC
                    </span>
                    <span>24:00 UTC</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1440"
                    step="1"
                    value={currentMinutesFromMidnight}
                    onChange={handleSliderChange}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400"
                  />
                </div>

                {/* Controls Row: Play/Pause, Speeds, Day Jumps */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  {/* Playback Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onTogglePlay}
                      className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isPlaying
                          ? 'bg-amber-600 hover:bg-amber-500 text-white'
                          : 'bg-sky-600 hover:bg-sky-500 text-white'
                      }`}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isPlaying ? 'Pause' : 'Play Solar Loop'}</span>
                    </button>

                    {/* Speeds */}
                    <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/60 font-mono">
                      {[1, 60, 300, 1800, 3600].map((s) => (
                        <button
                          key={s}
                          onClick={() => onChangeSpeed(s)}
                          className={`px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                            playbackSpeed === s
                              ? 'bg-sky-500 text-white font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {s === 1 ? '1x' : s === 60 ? '1m/s' : s === 300 ? '5m/s' : s === 1800 ? '30m/s' : '1h/s'}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={onResetToNow}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                      title="Sync with current real-time UTC"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                      <span>Now</span>
                    </button>
                  </div>

                  {/* Date Navigation & Shortcuts */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-800/80 rounded-lg border border-slate-700/60 px-1 py-0.5">
                      <button
                        onClick={() => handleDayStep(-1)}
                        className="px-2 py-0.5 text-slate-400 hover:text-white font-bold cursor-pointer"
                        title="Step backward 1 day"
                      >
                        -1d
                      </button>
                      <span className="px-2 font-mono text-slate-200 text-xs">
                        {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <button
                        onClick={() => handleDayStep(1)}
                        className="px-2 py-0.5 text-slate-400 hover:text-white font-bold cursor-pointer"
                        title="Step forward 1 day"
                      >
                        +1d
                      </button>
                    </div>
                  </div>
                </div>

                {reducedMotion && <p className="text-xs text-slate-400">Reduced motion: playback steps once per second; automatic rotation is off.</p>}
                {/* Seasonal Solstices & Equinoxes Milestones Bar */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400 font-medium">
                    <span className="text-amber-400">🍂</span>
                    <span className="text-[11px] uppercase tracking-wider font-semibold">Seasonal Paths:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {getSolarMilestones(currentDate.getUTCFullYear()).map(milestone => (
                      <button
                        key={milestone.id}
                        onClick={() => handleJumpToSeason(milestone.date)}
                        className="px-2 py-1 rounded-lg bg-slate-800/70 hover:bg-slate-700 border font-medium transition-colors cursor-pointer"
                        style={{ color: milestone.color, borderColor: milestone.color }}
                        title={`Jump to ${milestone.name}: ${milestone.date.toISOString()} (UTC)`}
                      >
                        {milestone.name} ({milestone.month + 1}/{milestone.day})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lunar Ephemeris Strip */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <MoonDiskSVG illumination={lunarPhase.illumination} elongationDeg={lunarPhase.elongationDeg} size={22} />
                    <span className="font-semibold text-slate-100 flex items-center gap-1">
                      <span>{lunarPhase.glyph}</span> {lunarPhase.phaseName} ({lunarPhase.illumination}%)
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                      • Age: {lunarPhase.ageDays}d / 29.5d • Elongation: {lunarPhase.elongationDeg}°
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      onClick={() => onUpdateDate(lunarPhase.nextFullMoonDate)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-medium transition-colors cursor-pointer"
                      title="Jump simulation date to Next Full Moon"
                    >
                      🌕 Full Moon ({lunarPhase.daysToFullMoon}d)
                    </button>
                    <button
                      onClick={() => onUpdateDate(lunarPhase.nextNewMoonDate)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 font-medium transition-colors cursor-pointer"
                      title="Jump simulation date to Next New Moon"
                    >
                      🌑 New Moon ({lunarPhase.daysToNewMoon}d)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: EARTH LAYERS */}
            {activeTab === 'layers' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <label className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 p-2 rounded-xl border border-slate-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.showAtmosphere}
                    onChange={(e) => onUpdateLayers({ showAtmosphere: e.target.checked })}
                    className="accent-sky-500 rounded"
                  />
                  <span>Atmosphere Halo</span>
                </label>

                <label className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 p-2 rounded-xl border border-slate-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.showNightLights}
                    onChange={(e) => onUpdateLayers({ showNightLights: e.target.checked })}
                    className="accent-sky-500 rounded"
                  />
                  <span>City Night Lights</span>
                </label>

                <label className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 p-2 rounded-xl border border-slate-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.showClouds}
                    onChange={(e) => onUpdateLayers({ showClouds: e.target.checked })}
                    className="accent-sky-500 rounded"
                  />
                  <span>Cloud Systems</span>
                </label>

                <label className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 p-2 rounded-xl border border-slate-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.showTerminator}
                    onChange={(e) => onUpdateLayers({ showTerminator: e.target.checked })}
                    className="accent-sky-500 rounded"
                  />
                  <span>Terminator Boundary</span>
                </label>

                <label className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 p-2 rounded-xl border border-slate-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.showTwilightBands}
                    onChange={(e) => onUpdateLayers({ showTwilightBands: e.target.checked })}
                    className="accent-sky-500 rounded"
                  />
                  <span>Twilight Circles (-6°/-12°/-18°)</span>
                </label>

                <label className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 p-2 rounded-xl border border-amber-500/40 text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.showSunTrajectory}
                    onChange={(e) => onUpdateLayers({ showSunTrajectory: e.target.checked })}
                    className="accent-amber-400 rounded"
                  />
                  <span className="font-semibold">☀️ Today's Sun Path Arc</span>
                </label>

                <label className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/40 text-emerald-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.showSeasonalPaths}
                    onChange={(e) => onUpdateLayers({ showSeasonalPaths: e.target.checked })}
                    className="accent-emerald-400 rounded"
                  />
                  <span className="font-semibold">🌿 Solstices &amp; Equinoxes</span>
                </label>

                <label className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 p-2 rounded-xl border border-slate-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.showSubsolarPoint}
                    onChange={(e) => onUpdateLayers({ showSubsolarPoint: e.target.checked })}
                    className="accent-sky-500 rounded"
                  />
                  <span>Subsolar Zenith Marker</span>
                </label>

                <label className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 p-2 rounded-xl border border-slate-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.showCities}
                    onChange={(e) => onUpdateLayers({ showCities: e.target.checked })}
                    className="accent-sky-500 rounded"
                  />
                  <span>City Markers</span>
                </label>

                <label className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 p-2 rounded-xl border border-slate-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.showGraticule}
                    onChange={(e) => onUpdateLayers({ showGraticule: e.target.checked })}
                    className="accent-sky-500 rounded"
                  />
                  <span>Lat / Lon Graticule</span>
                </label>
              </div>
            )}

            {/* TAB 3: CAMERA PRESETS (3D Only) */}
            {activeTab === 'camera' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <button
                  onClick={() => onTriggerCameraPreset('focus-trajectory')}
                  className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 p-2.5 rounded-xl text-left transition-colors cursor-pointer group"
                >
                  <span className="font-semibold text-amber-300 group-hover:text-amber-200 block">
                    ☀️ Focus Sun Sky Arc
                  </span>
                  <span className="text-[11px] text-slate-300">View sky dome at selected spot</span>
                </button>

                <button
                  onClick={() => onTriggerCameraPreset('solar-view')}
                  className="bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 p-2.5 rounded-xl text-left transition-colors cursor-pointer group"
                >
                  <span className="font-semibold text-amber-400 group-hover:text-amber-300 block">
                    ☉ Subsolar View
                  </span>
                  <span className="text-[11px] text-slate-400">View from Sun at solar noon</span>
                </button>

                <button
                  onClick={() => onTriggerCameraPreset('north-pole')}
                  className="bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 p-2.5 rounded-xl text-left transition-colors cursor-pointer group"
                >
                  <span className="font-semibold text-sky-400 group-hover:text-sky-300 block">
                    ❄️ Arctic / North Pole
                  </span>
                  <span className="text-[11px] text-slate-400">Inspect midnight sun / polar night</span>
                </button>

                <button
                  onClick={() => onTriggerCameraPreset('south-pole')}
                  className="bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 p-2.5 rounded-xl text-left transition-colors cursor-pointer group"
                >
                  <span className="font-semibold text-sky-400 group-hover:text-sky-300 block">
                    🐧 Antarctic / South Pole
                  </span>
                  <span className="text-[11px] text-slate-400">Southern polar illumination</span>
                </button>

                <button
                  onClick={() => onTriggerCameraPreset('equator-view')}
                  className="bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 p-2.5 rounded-xl text-left transition-colors cursor-pointer group"
                >
                  <span className="font-semibold text-emerald-400 group-hover:text-emerald-300 block">
                    🌐 Equator Profile
                  </span>
                  <span className="text-[11px] text-slate-400">Side view of global terminator</span>
                </button>
              </div>
            )}

            {/* TAB 4: CITIES DIRECTORY */}
            {activeTab === 'cities' && (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Search city or country (e.g. Tokyo, London, Tromsø)..."
                  value={citySearchQuery}
                  onChange={(e) => setCitySearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-sky-500"
                />

                <div className="max-h-36 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-1.5 pr-1">
                  {filteredCities.slice(0, 24).map((city) => {
                    const isSelected = selectedCity?.id === city.id;
                    const citySolar = getSolarPosition(city.lat, city.lng, currentDate);
                    return (
                      <button
                        key={city.id}
                        onClick={() => onSelectCity(city)}
                        className={`text-left p-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-sky-600/30 border border-sky-500/80 text-white'
                            : 'bg-slate-800/40 hover:bg-slate-800 text-slate-300 border border-transparent'
                        }`}
                      >
                        <div className="truncate mr-1">
                          <span className="font-medium block truncate">{city.name}</span>
                          <span className="text-[10px] text-slate-400">{city.country.split(' ')[0]}</span>
                        </div>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium flex-shrink-0 ${
                            citySolar.phase === 'day'
                              ? 'bg-amber-400/20 text-amber-300'
                              : citySolar.phase === 'golden-hour'
                              ? 'bg-orange-500/20 text-orange-300'
                              : citySolar.phase.includes('twilight')
                              ? 'bg-sky-400/20 text-sky-300'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {citySolar.elevation > 0 ? `+${citySolar.elevation.toFixed(0)}°` : `${citySolar.elevation.toFixed(0)}°`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 5: LUNAR CYCLE & EPHEMERIS */}
            {activeTab === 'lunar' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-3">
                    <MoonDiskSVG
                      illumination={lunarPhase.illumination}
                      elongationDeg={lunarPhase.elongationDeg}
                      size={32}
                    />
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                        <span>{lunarPhase.glyph}</span> {lunarPhase.phaseName}{' '}
                        <span className="text-amber-400 font-mono font-semibold">
                          ({lunarPhase.illumination}% Illumination)
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Moon Age: {lunarPhase.ageDays}d / 29.53d • Sun-Moon Angle: {lunarPhase.elongationDeg}°
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => onUpdateDate(lunarPhase.nextFullMoonDate)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>🌕</span> Full Moon in {lunarPhase.daysToFullMoon}d →
                    </button>
                    <button
                      onClick={() => onUpdateDate(lunarPhase.nextNewMoonDate)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 font-semibold transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>🌑</span> New Moon in {lunarPhase.daysToNewMoon}d →
                    </button>
                  </div>
                </div>

                {/* 8 Primary Lunar Phases Grid */}
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 text-center">
                  {[
                    { type: 'new-moon', name: 'New Moon', glyph: '🌑', deg: 0, ill: 0 },
                    { type: 'waxing-crescent', name: 'Waxing Crescent', glyph: '🌒', deg: 45, ill: 25 },
                    { type: 'first-quarter', name: '1st Quarter', glyph: '🌓', deg: 90, ill: 50 },
                    { type: 'waxing-gibbous', name: 'Waxing Gibbous', glyph: '🌔', deg: 135, ill: 75 },
                    { type: 'full-moon', name: 'Full Moon', glyph: '🌕', deg: 180, ill: 100 },
                    { type: 'waning-gibbous', name: 'Waning Gibbous', glyph: '🌖', deg: 225, ill: 75 },
                    { type: 'last-quarter', name: '3rd Quarter', glyph: '🌗', deg: 270, ill: 50 },
                    { type: 'waning-crescent', name: 'Waning Crescent', glyph: '🌘', deg: 315, ill: 25 },
                  ].map((p) => {
                    const isCurrent = lunarPhase.phase === p.type;
                    return (
                      <div
                        key={p.type}
                        className={`p-2 rounded-xl border transition-all flex flex-col items-center justify-center ${
                          isCurrent
                            ? 'bg-amber-500/20 border-amber-500/80 shadow-lg text-amber-300'
                            : 'bg-slate-800/40 border-slate-700/50 text-slate-300'
                        }`}
                      >
                        <MoonDiskSVG illumination={p.ill} elongationDeg={p.deg} size={22} />
                        <span className="text-[11px] font-semibold mt-1 truncate w-full block">
                          {p.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {p.deg}°
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] bg-amber-500 text-slate-950 font-bold px-1.5 py-0.2 rounded-full mt-1">
                            Current
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

