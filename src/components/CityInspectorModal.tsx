import React, { useMemo } from 'react';
import { CityData } from '../types';
import { getSolarPosition, getSolarTimes } from '../utils/solarCalculator';

interface CityInspectorModalProps {
  city: CityData;
  currentDate: Date;
  onClose: () => void;
  onFocusCityIn3D: () => void;
}

export const CityInspectorModal: React.FC<CityInspectorModalProps> = ({
  city,
  currentDate,
  onClose,
  onFocusCityIn3D,
}) => {
  // Current solar position at city
  const solarPos = useMemo(() => getSolarPosition(city.lat, city.lng, currentDate), [city, currentDate]);

  // Solar daily times (sunrise, sunset, noon, twilights)
  const solarTimes = useMemo(() => getSolarTimes(city.lat, city.lng, currentDate), [city, currentDate]);

  // Generate 24-hour elevation curve points for today
  const dailyCurve = useMemo(() => {
    const points: { hour: number; elevation: number }[] = [];
    const baseDate = new Date(currentDate);
    baseDate.setUTCHours(0, 0, 0, 0);

    for (let h = 0; h <= 24; h += 0.5) {
      const sampleDate = new Date(baseDate.getTime() + h * 3600000);
      const pos = getSolarPosition(city.lat, city.lng, sampleDate);
      points.push({ hour: h, elevation: pos.elevation });
    }
    return points;
  }, [city, currentDate]);

  // Helper to format local city time
  const formatCityTime = (d: Date | null) => {
    if (!d) return '--:--';
    return d.toLocaleTimeString('en-US', {
      timeZone: city.timezone,
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // SVG dimensions for 24h solar path
  const svgWidth = 460;
  const svgHeight = 170;
  const pad = { top: 15, right: 20, bottom: 25, left: 35 };
  const plotW = svgWidth - pad.left - pad.right;
  const plotH = svgHeight - pad.top - pad.bottom;

  // Map hour (0-24) to X, elevation (-90 to +90) to Y
  const getX = (hour: number) => pad.left + (hour / 24) * plotW;
  const getY = (elev: number) => pad.top + plotH * (1 - (elev + 90) / 180);
  const horizonY = getY(0);

  // Build SVG path
  const curveD = useMemo(() => {
    return dailyCurve.reduce((acc, pt, idx) => {
      const x = getX(pt.hour);
      const y = getY(pt.elevation);
      return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');
  }, [dailyCurve]);

  // Current time position in UTC hours
  const currentUtcHour = currentDate.getUTCHours() + currentDate.getUTCMinutes() / 60;
  const currentDotX = getX(currentUtcHour);
  const currentDotY = getY(solarPos.elevation);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">{city.name}</h2>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                solarPos.phase === 'day' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                solarPos.phase === 'golden-hour' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' :
                solarPos.phase.includes('twilight') ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' :
                'bg-slate-800 text-slate-300 border border-slate-700'
              }`}>
                {solarPos.phaseLabel}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {city.country} • {Math.abs(city.lat).toFixed(2)}°{city.lat >= 0 ? 'N' : 'S'},{' '}
              {Math.abs(city.lng).toFixed(2)}°{city.lng >= 0 ? 'E' : 'W'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onFocusCityIn3D}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5"
            >
              <span>🧭</span> Orbit In 3D
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-slate-200 text-xs">
          {/* Times Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-center">
              <span className="text-slate-400 block text-[11px]">🌅 Sunrise</span>
              <span className="text-base font-mono font-bold text-amber-400">
                {formatCityTime(solarTimes.sunrise)}
              </span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-center">
              <span className="text-slate-400 block text-[11px]">☀️ Solar Noon</span>
              <span className="text-base font-mono font-bold text-yellow-300">
                {formatCityTime(solarTimes.solarNoon)}
              </span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-center">
              <span className="text-slate-400 block text-[11px]">🌇 Sunset</span>
              <span className="text-base font-mono font-bold text-orange-400">
                {formatCityTime(solarTimes.sunset)}
              </span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-center">
              <span className="text-slate-400 block text-[11px]">⏱ Daylight Length</span>
              <span className="text-base font-mono font-bold text-emerald-400">
                {solarTimes.isPolarDay ? '24h (Polar Day)' :
                 solarTimes.isPolarNight ? '0h (Polar Night)' :
                 `${Math.floor(solarTimes.dayLengthMinutes / 60)}h ${Math.floor(solarTimes.dayLengthMinutes % 60)}m`}
              </span>
            </div>
          </div>

          {/* 24-Hour Solar Trajectory Chart */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white">24-Hour Solar Altitude Trajectory</span>
              <span className="font-mono text-slate-400">
                Current Elevation: <strong className="text-amber-400">{solarPos.elevation.toFixed(1)}°</strong>
              </span>
            </div>

            <div className="w-full flex justify-center">
              <svg width={svgWidth} height={svgHeight} className="overflow-visible select-none">
                {/* Twilight Zone fills */}
                {/* Day zone (above 0°) */}
                <rect
                  x={pad.left}
                  y={pad.top}
                  width={plotW}
                  height={horizonY - pad.top}
                  fill="#fef08a"
                  opacity={0.06}
                />
                {/* Night zone (below 0°) */}
                <rect
                  x={pad.left}
                  y={horizonY}
                  width={plotW}
                  height={pad.top + plotH - horizonY}
                  fill="#1e1b4b"
                  opacity={0.2}
                />

                {/* Horizon Line (0° Elevation) */}
                <line
                  x1={pad.left}
                  y1={horizonY}
                  x2={svgWidth - pad.right}
                  y2={horizonY}
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                />
                <text
                  x={pad.left - 6}
                  y={horizonY + 3}
                  fill="#38bdf8"
                  fontSize={9}
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  0°
                </text>

                {/* Vertical Hour markers */}
                {[0, 6, 12, 18, 24].map((hr) => {
                  const x = getX(hr);
                  return (
                    <g key={hr}>
                      <line
                        x1={x}
                        y1={pad.top}
                        x2={x}
                        y2={pad.top + plotH}
                        stroke="#334155"
                        strokeDasharray="2 3"
                        strokeWidth={1}
                      />
                      <text
                        x={x}
                        y={pad.top + plotH + 14}
                        fill="#64748b"
                        fontSize={9}
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {String(hr).padStart(2, '0')}:00
                      </text>
                    </g>
                  );
                })}

                {/* Solar Trajectory Curve */}
                <path d={curveD} fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeLinecap="round" />

                {/* Current Time Dot */}
                <circle cx={currentDotX} cy={currentDotY} r={5} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
              </svg>
            </div>
          </div>

          {/* Twilight Periods */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 space-y-1.5 text-[11px]">
            <div className="text-slate-400 font-semibold mb-1">Twilight Transitions (Local Time):</div>
            <div className="flex justify-between text-slate-300">
              <span>Civil Twilight (-6°):</span>
              <span className="font-mono text-sky-400">
                Dawn {formatCityTime(solarTimes.civilDawn)} • Dusk {formatCityTime(solarTimes.civilDusk)}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Nautical Twilight (-12°):</span>
              <span className="font-mono text-indigo-400">
                Dawn {formatCityTime(solarTimes.nauticalDawn)} • Dusk {formatCityTime(solarTimes.nauticalDusk)}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Astronomical Twilight (-18°):</span>
              <span className="font-mono text-purple-400">
                Dawn {formatCityTime(solarTimes.astronomicalDawn)} • Dusk {formatCityTime(solarTimes.astronomicalDusk)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
