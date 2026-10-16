import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ViewMode, GlobeLayerSettings, CityData } from './types';
import { WORLD_CITIES } from './data/cities';
import { getSubsolarPoint } from './utils/solarCalculator';
import { EarthGlobe } from './components/EarthGlobe';
import { Daylight2DMap } from './components/Daylight2DMap';
import { SolarHUD } from './components/SolarHUD';
import { DaylightAnalytics } from './components/DaylightAnalytics';
import { CityInspectorModal } from './components/CityInspectorModal';

export default function App() {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(300); // 5 min/sec by default for visible movement
  const [viewMode, setViewMode] = useState<ViewMode>('3d-globe');
  // Default to London (or first city) so the 3D sun trajectory sky dome is immediately visible!
  const [selectedCity, setSelectedCity] = useState<CityData | null>(() => WORLD_CITIES[6]);
  const [isCityModalOpen, setIsCityModalOpen] = useState<boolean>(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState<boolean>(false);
  const [activeCameraPreset, setActiveCameraPreset] = useState<string | null>('focus-trajectory');

  // Globe Layers configuration
  const [layers, setLayers] = useState<GlobeLayerSettings>({
    showAtmosphere: true,
    showClouds: true,
    showNightLights: true,
    showTerminator: true,
    showTwilightBands: true,
    showSubsolarPoint: true,
    showSunTrajectory: true,
    showSeasonalPaths: true,
    showCities: true,
    showGraticule: true,
    showSunRays: true,
    cloudOpacity: 1.0,
    rotationSpeed: 0.5,
    autoRotate: false,
  });

  const updateLayers = useCallback((partial: Partial<GlobeLayerSettings>) => {
    setLayers((prev) => ({ ...prev, ...partial }));
  }, []);

  // Compute Subsolar Point in real-time
  const subsolarPoint = useMemo(() => getSubsolarPoint(currentDate), [currentDate]);

  // Simulation loop for playback or live ticking
  const lastTickRef = useRef<number>(performance.now());
  useEffect(() => {
    let animId: number;

    const tick = (time: number) => {
      const delta = (time - lastTickRef.current) / 1000;
      lastTickRef.current = time;

      if (isPlaying) {
        // Advance time by delta * playbackSpeed seconds
        setCurrentDate((prev) => new Date(prev.getTime() + delta * playbackSpeed * 1000));
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playbackSpeed]);

  // Real-time ticking when not playing (updates every 10 seconds to keep live accurate)
  useEffect(() => {
    if (isPlaying) return;
    const interval = setInterval(() => {
      // If within 1 minute of real current time, sync
      const now = new Date();
      if (Math.abs(now.getTime() - currentDate.getTime()) < 60000) {
        setCurrentDate(now);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, currentDate]);

  // Select city handler
  const handleSelectCity = useCallback((city: CityData | null) => {
    setSelectedCity(city);
  }, []);

  // Reset to current time
  const handleResetToNow = useCallback(() => {
    setCurrentDate(new Date());
    setIsPlaying(false);
  }, []);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [handleResetToNow]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* 3D Globe or 2D Map View */}
      {viewMode === '3d-globe' ? (
        <EarthGlobe
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

      {/* Ergonomic Collapsible Bottom Control Dock */}
      <SolarHUD
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
    </div>
  );
}

