import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ViewMode, GlobeLayerSettings, CityData } from './types';
import { WORLD_CITIES } from './data/cities';
import { getSubsolarPoint } from './utils/solarCalculator';
import { EarthGlobe } from './components/EarthGlobe';
import { Daylight2DMap } from './components/Daylight2DMap';
import { SolarHUD } from './components/SolarHUD';
import { DaylightAnalytics } from './components/DaylightAnalytics';
import { CityInspectorModal } from './components/CityInspectorModal';
import { DaylightCalendar } from './components/DaylightCalendar';
import { ShareViewDialog } from './components/ShareViewDialog';
import { CompareCities } from './components/CompareCities';
import { GroundSkyView } from './components/GroundSkyView';
import { GlobeTour } from './components/GlobeTour';
import { TOUR_CITY_IDS } from './utils/globeTour';
import { MobileControls } from './components/MobileControls';
import type { MobileTool } from './components/MobileControls';
import { createShareUrl, DEFAULT_LAYERS, readSharedView } from './utils/viewState';

export default function App() {
  const [tourProgress, setTourProgress] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const tourStops = useMemo(() => TOUR_CITY_IDS.map(id => WORLD_CITIES.find(city => city.id === id)!), []);
  const tourReturnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const startTour = () => {
    tourReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsPlaying(false); setFollowLive(false); setViewMode('3d-globe');
    setActiveCameraPreset(null); setTourProgress(0);
  };
  const closeTour = () => {
    setTourProgress(null); setActiveCameraPreset(selectedCity ? 'focus-city' : 'equator-view');
    requestAnimationFrame(() => {
      const previous = tourReturnFocus.current;
      if (previous?.isConnected) previous.focus();
      else (document.querySelector(window.matchMedia('(min-width: 1024px)').matches
        ? '[data-testid="desktop-tour-launch"]' : '[data-testid="mobile-navigation"] button:last-child') as HTMLElement)?.focus();
    });
  };
  const [initialView] = useState(() => readSharedView(window.location.hash));
  const [currentDate, setCurrentDate] = useState<Date>(() => initialView?.date ?? new Date());
  const [followLive, setFollowLive] = useState(!initialView);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [isGroundSkyOpen, setIsGroundSkyOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(300); // 5 min/sec by default for visible movement
  const [viewMode, setViewMode] = useState<ViewMode>(initialView?.view ?? '3d-globe');
  // Default to London (or first city) so the 3D sun trajectory sky dome is immediately visible!
  const [selectedCity, setSelectedCity] = useState<CityData | null>(() => initialView ? initialView.city : WORLD_CITIES.find(city => city.id === 'london')!);
  const [isCityModalOpen, setIsCityModalOpen] = useState<boolean>(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState<boolean>(false);
  const [activeCameraPreset, setActiveCameraPreset] = useState<string | null>(() => window.matchMedia('(max-width: 1023px)').matches ? 'focus-city' : 'focus-trajectory');

  // Globe Layers configuration
  const [layers, setLayers] = useState<GlobeLayerSettings>(() => initialView?.layers ?? { ...DEFAULT_LAYERS });

  const updateLayers = useCallback((partial: Partial<GlobeLayerSettings>) => {
    setLayers((prev) => ({ ...prev, ...partial }));
  }, []);

  // Follow shared links even when navigation only changes the URL fragment.
  useEffect(() => {
    const restore = () => {
      const state = readSharedView(window.location.hash);
      if (!state) return;
      setTourProgress(null);
      setCurrentDate(state.date);
      setSelectedCity(state.city);
      setViewMode(state.view);
      setLayers(state.layers);
      setFollowLive(false);
      setIsPlaying(false);
      setActiveCameraPreset(state.city ? 'focus-city' : null);
      setIsCalendarOpen(false);
      setIsComparisonOpen(false);
      setIsGroundSkyOpen(false);
      setShareUrl(null);
    };
    window.addEventListener('hashchange', restore);
    return () => window.removeEventListener('hashchange', restore);
  }, []);

  // Compute Subsolar Point in real-time
  const subsolarPoint = useMemo(() => getSubsolarPoint(currentDate), [currentDate]);

  // Reduced motion uses explicit one-second steps instead of continuous animation.
  // Hidden tabs pause playback, and resuming never catches up elapsed hidden time.
  useEffect(() => { setIsPlaying(false); }, [reducedMotion]);
  useEffect(() => {
    if (!isPlaying) return;
    let frame: number | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let previous = performance.now();
    const tick = (time: number) => {
      const elapsed = Math.min(0.1, (time - previous) / 1000);
      previous = time;
      setCurrentDate(date => new Date(date.getTime() + elapsed * playbackSpeed * 1000));
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) clearInterval(timer);
      frame = null; timer = null;
    };
    const sync = () => {
      stop();
      if (document.hidden) return;
      previous = performance.now();
      if (reducedMotion) timer = setInterval(() => {
        setCurrentDate(date => new Date(date.getTime() + playbackSpeed * 1000));
      }, 1000);
      else frame = requestAnimationFrame(tick);
    };
    sync(); document.addEventListener('visibilitychange', sync);
    return () => { stop(); document.removeEventListener('visibilitychange', sync); };
  }, [isPlaying, playbackSpeed, reducedMotion]);

  // Real-time ticking when not playing (updates every 10 seconds to keep live accurate)
  useEffect(() => {
    if (isPlaying || !followLive) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      // If within 1 minute of real current time, sync
      const now = new Date();
      if (Math.abs(now.getTime() - currentDate.getTime()) < 60000) {
        setCurrentDate(now);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, currentDate, followLive]);

  // Select city handler
  const handleSelectCity = useCallback((city: CityData | null) => {
    setSelectedCity(city);
    setActiveCameraPreset(city ? 'focus-city' : null);
  }, []);

  // Reset to current time
  const handleResetToNow = useCallback(() => {
    setCurrentDate(new Date());
    setIsPlaying(false);
    setFollowLive(true);
  }, []);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (tourProgress !== null) return;
      // Keep native keyboard controls working inside dialogs.
      if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return;
      // Ignore if user is typing in search input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === 'm' || e.key === 'M') {
        setViewMode((prev) => (prev === '3d-globe' ? '2d-map' : '3d-globe'));
      } else if (e.key === 'r' || e.key === 'R') {
        handleResetToNow();
      } else if (e.key === 'a' || e.key === 'A') {
        setIsAnalyticsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleResetToNow, tourProgress]);

  const openTool = (tool: MobileTool) => {
    setIsPlaying(false);
    if (tool === 'tour') startTour();
    if (tool === 'share') setShareUrl(createShareUrl(window.location.href, { date: currentDate, city: selectedCity, view: viewMode, layers }));
    if (tool === 'calendar' && selectedCity) setIsCalendarOpen(true);
    if (tool === 'compare') setIsComparisonOpen(true);
    if (tool === 'sky' && selectedCity) setIsGroundSkyOpen(true);
    if (tool === 'analytics') setIsAnalyticsOpen(true);
    if (tool === 'inspector' && selectedCity) setIsCityModalOpen(true);
  };

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* 3D Globe or 2D Map View */}
      {viewMode === '3d-globe' ? (
        <EarthGlobe
          renderActive={!isCalendarOpen && !isComparisonOpen && !isGroundSkyOpen && !shareUrl && !isCityModalOpen && !isAnalyticsOpen}
          reducedMotion={reducedMotion}
          tour={tourProgress === null ? null : { progress: tourProgress, stops: tourStops, reducedMotion }}
          currentDate={currentDate}
          subsolarPoint={subsolarPoint}
          cities={WORLD_CITIES}
          selectedCity={selectedCity}
          onSelectCity={handleSelectCity}
          onSelectDate={setCurrentDate}
          onOpenDetails={() => setIsCityModalOpen(true)}
          layers={layers}
          onUpdateLayers={updateLayers}
          activeCameraPreset={activeCameraPreset}
          onResetCameraPreset={() => setActiveCameraPreset(null)}
          onTriggerCameraPreset={setActiveCameraPreset}
        />
      ) : (
        <Daylight2DMap
          currentDate={currentDate}
          subsolarPoint={subsolarPoint}
          cities={WORLD_CITIES}
          selectedCity={selectedCity}
          onSelectCity={handleSelectCity}
        />
      )}

      {tourProgress !== null && <GlobeTour stops={tourStops} progress={tourProgress} reducedMotion={reducedMotion}
        currentDate={currentDate} onProgress={setTourProgress} onClose={closeTour} />}
      {tourProgress === null && <>
      <div className="hidden lg:flex absolute top-24 left-4 z-20 flex-wrap gap-2 max-w-[calc(100vw-2rem)]">
        <button data-testid="desktop-tour-launch" onClick={startTour} className="shrink-0 rounded-xl border border-sky-700 bg-slate-900/90 px-3 py-2 text-xs text-sky-300 cursor-pointer">Helix globe tour</button>
        <button onClick={() => setShareUrl(createShareUrl(window.location.href, {
          date: currentDate, city: selectedCity, view: viewMode, layers,
        }))} className="shrink-0 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-sky-300 hover:bg-slate-800 cursor-pointer">
          Share view
        </button>
        <button disabled={!selectedCity} onClick={() => { setIsPlaying(false); setIsCalendarOpen(true); }}
          title={selectedCity ? `Annual daylight for ${selectedCity.name}` : 'Select a city first'}
          className="shrink-0 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-amber-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer">
          Annual daylight
        </button>
        <button onClick={() => { setIsPlaying(false); setIsComparisonOpen(true); }}
          className="shrink-0 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-violet-300 hover:bg-slate-800 cursor-pointer">
          Compare cities
        </button>
        <button disabled={!selectedCity} onClick={() => { setIsPlaying(false); setIsGroundSkyOpen(true); }}
          title={selectedCity ? `Sky seen from ${selectedCity.name}` : 'Select a city first'}
          className="shrink-0 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-emerald-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer">
          Ground-level sky
        </button>
      </div>
      {shareUrl && <ShareViewDialog url={shareUrl} onClose={() => setShareUrl(null)} />}
      {isCalendarOpen && selectedCity && <DaylightCalendar city={selectedCity} currentDate={currentDate}
        onClose={() => setIsCalendarOpen(false)} onSelectDate={date => {
          const nextDate = new Date(date);
          nextDate.setUTCHours(currentDate.getUTCHours(), currentDate.getUTCMinutes(), currentDate.getUTCSeconds(), 0);
          setCurrentDate(nextDate);
          setFollowLive(false);
          setIsPlaying(false);
          setIsCalendarOpen(false);
        }} />}

      {isComparisonOpen && <CompareCities cities={WORLD_CITIES} selectedCity={selectedCity} currentDate={currentDate}
        onClose={() => setIsComparisonOpen(false)} onFocusCity={city => {
          handleSelectCity(city);
          setViewMode('3d-globe');
          setIsComparisonOpen(false);
        }} />}
      {isGroundSkyOpen && selectedCity && <GroundSkyView city={selectedCity} currentDate={currentDate}
        onClose={() => setIsGroundSkyOpen(false)} onUpdateDate={date => {
          setCurrentDate(date);
          setFollowLive(false);
          setIsPlaying(false);
        }} />}

      <MobileControls currentDate={currentDate} cities={WORLD_CITIES} selectedCity={selectedCity}
        reducedMotion={reducedMotion} layers={layers} viewMode={viewMode} isPlaying={isPlaying} playbackSpeed={playbackSpeed}
        onSelectCity={handleSelectCity} onUpdateDate={date => {
          setCurrentDate(date); setFollowLive(false); setIsPlaying(false);
        }} onUpdateLayers={updateLayers} onChangeViewMode={setViewMode}
        onTogglePlay={() => setIsPlaying(playing => !playing)} onChangeSpeed={setPlaybackSpeed}
        onResetToNow={handleResetToNow} onCameraPreset={setActiveCameraPreset} onOpenTool={openTool} />

      {/* Ergonomic Collapsible Bottom Control Dock */}
      <SolarHUD
        reducedMotion={reducedMotion}
        currentDate={currentDate}
        onUpdateDate={setCurrentDate}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        playbackSpeed={playbackSpeed}
        onChangeSpeed={setPlaybackSpeed}
        onResetToNow={handleResetToNow}
        subsolarPoint={subsolarPoint}
        layers={layers}
        onUpdateLayers={updateLayers}
        cities={WORLD_CITIES}
        selectedCity={selectedCity}
        onSelectCity={handleSelectCity}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onTriggerCameraPreset={setActiveCameraPreset}
        onOpenAnalytics={() => setIsAnalyticsOpen(true)}
      />

      {/* Global Analytics Modal */}
      {isAnalyticsOpen && (
        <DaylightAnalytics
          currentDate={currentDate}
          subsolarPoint={subsolarPoint}
          onSelectDate={(newDate) => {
            setCurrentDate(newDate);
            setIsAnalyticsOpen(false);
          }}
          onClose={() => setIsAnalyticsOpen(false)}
        />
      )}

      {/* Detailed City Solar Trajectory Modal */}
      {isCityModalOpen && selectedCity && (
        <CityInspectorModal
          city={selectedCity}
          currentDate={currentDate}
          onClose={() => setIsCityModalOpen(false)}
          onFocusCityIn3D={() => {
            setViewMode('3d-globe');
            setActiveCameraPreset('focus-city');
            setIsCityModalOpen(false);
          }}
        />
      )}
      </>}
    </div>
  );
}

