import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SubsolarPoint, CityData } from '../types';
import { getSolarPosition, getTerminatorLatitude } from '../utils/solarCalculator';

interface Daylight2DMapProps {
  currentDate: Date;
  subsolarPoint: SubsolarPoint;
  cities: CityData[];
  selectedCity: CityData | null;
  onSelectCity: (city: CityData | null) => void;
}

export const Daylight2DMap: React.FC<Daylight2DMapProps> = ({
  currentDate,
  subsolarPoint,
  cities,
  selectedCity,
  onSelectCity,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredCoords, setHoveredCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Helper: Lat/Lng to Canvas pixels
  const toPixels = useCallback((lat: number, lng: number, width: number, height: number): [number, number] => {
    const x = ((lng + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;
    return [x, y];
  }, []);

  // Helper: Canvas pixels to Lat/Lng
  const toLatLng = useCallback((x: number, y: number, width: number, height: number): [number, number] => {
    const lng = (x / width) * 360 - 180;
    const lat = 90 - (y / height) * 180;
    return [lat, lng];
  }, []);

  // Render 2D Daylight Atlas Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Draw Ocean Background
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
    oceanGrad.addColorStop(0, '#0c1a2e');
    oceanGrad.addColorStop(0.5, '#0e2340');
    oceanGrad.addColorStop(1, '#081220');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Graticule Lines (every 30° lat & lng)
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.setLineDash([4, 6]);

    // Parallels
    for (let lat = -60; lat <= 60; lat += 30) {
      const [, y] = toPixels(lat, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Equator (Solid Green/Emerald)
    const [, eqY] = toPixels(0, 0, width, height);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, eqY);
    ctx.lineTo(width, eqY);
    ctx.stroke();

    // Tropics of Cancer & Capricorn (Golden dashed)
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
    ctx.setLineDash([6, 4]);
    const [, canY] = toPixels(23.44, 0, width, height);
    const [, capY] = toPixels(-23.44, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(0, canY);
    ctx.lineTo(width, canY);
    ctx.moveTo(0, capY);
    ctx.lineTo(width, capY);
    ctx.stroke();

    // Arctic & Antarctic Circles (Cyan dashed)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    const [, arcY] = toPixels(66.56, 0, width, height);
    const [, antY] = toPixels(-66.56, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(0, arcY);
    ctx.lineTo(width, arcY);
    ctx.moveTo(0, antY);
    ctx.lineTo(width, antY);
    ctx.stroke();

    // Meridians
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.setLineDash([4, 6]);
    for (let lng = -150; lng <= 180; lng += 30) {
      const [x] = toPixels(0, lng, width, height);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Prime Meridian (Blue)
    const [pmX] = toPixels(0, 0, width, height);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pmX, 0);
    ctx.lineTo(pmX, height);
    ctx.stroke();

    // 3. Compute Daylight / Night Mask via Solar Zenith Calculation
    // For fast crisp rendering, we calculate shading on a grid and draw smooth twilight transitions
    const stepX = 2; // pixel resolution
    const numCols = Math.ceil(width / stepX);

    // We can evaluate twilight zones across longitude columns
    // Daylight is where Sun elevation > 0°
    // Twilight is -18° to 0°
    // Night is < -18°
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    // Convert subsolar point to radians
    const deltaRad = subsolarPoint.declination * (Math.PI / 180);
    const subLonRad = subsolarPoint.lng * (Math.PI / 180);
    const sinDelta = Math.sin(deltaRad);
    const cosDelta = Math.cos(deltaRad);

    // Precompute cos(dLon) for each x column
    const cosDLon = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      const lng = (x / width) * 360 - 180;
      const dLon = lng * (Math.PI / 180) - subLonRad;
      cosDLon[x] = Math.cos(dLon);
    }

    // Precompute sin/cos lat for each y row
    const sinPhi = new Float32Array(height);
    const cosPhi = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      const lat = 90 - (y / height) * 180;
      const phi = lat * (Math.PI / 180);
      sinPhi[y] = Math.sin(phi);
      cosPhi[y] = Math.cos(phi);
    }

    // Fill pixel buffers for daylight/night atmosphere overlay
    for (let y = 0; y < height; y++) {
      const sPhi = sinPhi[y];
      const cPhi = cosPhi[y];
      const termA = sPhi * sinDelta;
      const termB = cPhi * cosDelta;

      for (let x = 0; x < width; x++) {
        // sin(elevation) = sin(phi)*sin(delta) + cos(phi)*cos(delta)*cos(dLon)
        const sinElevation = termA + termB * cosDLon[x];
        const idx = (y * width + x) * 4;

        if (sinElevation > 0.1) {
          // Direct daylight: warm soft illumination
          data[idx] = 255;
          data[idx + 1] = 245;
          data[idx + 2] = 200;
          data[idx + 3] = 40; // Alpha
        } else if (sinElevation > 0.0) {
          // Golden hour / sunrise-sunset edge
          data[idx] = 255;
          data[idx + 1] = 160;
          data[idx + 2] = 60;
          data[idx + 3] = 85;
        } else if (sinElevation > -0.1045) {
          // Civil Twilight (0° to -6°)
          data[idx] = 60;
          data[idx + 1] = 130;
          data[idx + 2] = 220;
          data[idx + 3] = 80;
        } else if (sinElevation > -0.2079) {
          // Nautical Twilight (-6° to -12°)
          data[idx] = 25;
          data[idx + 1] = 60;
          data[idx + 2] = 150;
          data[idx + 3] = 120;
        } else if (sinElevation > -0.3090) {
          // Astronomical Twilight (-12° to -18°)
          data[idx] = 15;
          data[idx + 1] = 30;
          data[idx + 2] = 90;
          data[idx + 3] = 160;
        } else {
          // Night: dark shadow
          data[idx] = 3;
          data[idx + 1] = 6;
          data[idx + 2] = 14;
          data[idx + 3] = 205;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // 4. Draw Daylight Terminator Wave Curve (Golden/Cyan Line)
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    let started = false;

    for (let x = 0; x <= width; x += 2) {
      const lng = (x / width) * 360 - 180;
      const termLat = getTerminatorLatitude(lng, subsolarPoint);
      const [, y] = toPixels(termLat, lng, width, height);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // 5. Draw Solar Noon Meridian (where local solar time is 12:00)
    const [subX, subY] = toPixels(subsolarPoint.lat, subsolarPoint.lng, width, height);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 220, 80, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(subX, 0);
    ctx.lineTo(subX, height);
    ctx.stroke();
    ctx.setLineDash([]);

    // 6. Draw Subsolar Point (The Zenith Sun)
    // Outer pulse rings
    ctx.fillStyle = 'rgba(255, 230, 80, 0.25)';
    ctx.beginPath();
    ctx.arc(subX, subY, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 230, 80, 0.6)';
    ctx.beginPath();
    ctx.arc(subX, subY, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(subX, subY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Sun Label
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#fde047';
    ctx.fillText('☉ Subsolar Zenith', subX + 14, subY - 8);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`${subsolarPoint.declination.toFixed(1)}°N, ${subsolarPoint.lng.toFixed(1)}°E`, subX + 14, subY + 6);

    // 7. Draw World Cities
    cities.forEach((city) => {
      const [cx, cy] = toPixels(city.lat, city.lng, width, height);
      const isSelected = selectedCity?.id === city.id;
      const citySolar = getSolarPosition(city.lat, city.lng, currentDate);

      // Status indicator color
      const statusColor =
        citySolar.phase === 'day' ? '#f59e0b' :
        citySolar.phase === 'golden-hour' ? '#ea580c' :
        citySolar.phase.includes('twilight') ? '#38bdf8' : '#818cf8';

      // Pin
      ctx.fillStyle = isSelected ? '#ef4444' : statusColor;
      ctx.beginPath();
      ctx.arc(cx, cy, isSelected ? 5.5 : 3, 0, Math.PI * 2);
      ctx.fill();

      // Border ring for selected
      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // City Name text
      ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
      ctx.fillStyle = isSelected ? '#ffffff' : '#94a3b8';
      ctx.fillText(city.name, cx + 6, cy + 3);
    });

  }, [currentDate, subsolarPoint, cities, selectedCity, toPixels]);

  // Handle Canvas Click to Select City or Inspect Location
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    // Check if clicked near any city (15px threshold)
    let foundCity: CityData | null = null;
    let minDistance = 20;

    cities.forEach((city) => {
      const [cx, cy] = toPixels(city.lat, city.lng, canvas.width, canvas.height);
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < minDistance) {
        minDistance = dist;
        foundCity = city;
      }
    });

    onSelectCity(foundCity);
  };

  // Handle Mouse Hover Coordinates
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const [lat, lng] = toLatLng(x, y, canvas.width, canvas.height);
    setHoveredCoords({ lat, lng });
  };

  const hoveredSolar = hoveredCoords ? getSolarPosition(hoveredCoords.lat, hoveredCoords.lng, currentDate) : null;

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col items-center justify-center p-4 bg-slate-950 overflow-hidden">
      {/* 2D Canvas */}
      <div className="relative max-w-5xl w-full aspect-[2/1] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900">
        <canvas
          ref={canvasRef}
          width={1800}
          height={900}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredCoords(null)}
          className="w-full h-full object-cover cursor-crosshair"
        />

        {/* Legend bar */}
        <div className="absolute bottom-3 left-3 bg-slate-900/85 backdrop-blur-md border border-slate-700/70 rounded-lg px-3 py-1.5 flex items-center gap-3 text-[11px] text-slate-300 pointer-events-none">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Day
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> Golden Hour
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span> Civil Twil. (-6°)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Naut. Twil. (-12°)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span> Astro. Twil. (-18°)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-600"></span> Night
          </span>
        </div>

        {/* Hover Inspector Crosshair Info */}
        {hoveredCoords && hoveredSolar && (
          <div className="absolute top-3 right-3 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white pointer-events-none shadow-xl flex items-center gap-4">
            <div>
              <span className="text-slate-400 block text-[10px]">Position</span>
              <span className="font-mono text-sky-400">
                {Math.abs(hoveredCoords.lat).toFixed(1)}°{hoveredCoords.lat >= 0 ? 'N' : 'S'},{' '}
                {Math.abs(hoveredCoords.lng).toFixed(1)}°{hoveredCoords.lng >= 0 ? 'E' : 'W'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Sun Elevation</span>
              <span className="font-mono text-amber-400">{hoveredSolar.elevation.toFixed(1)}°</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Status</span>
              <span className="font-semibold text-slate-200">{hoveredSolar.phaseLabel}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
