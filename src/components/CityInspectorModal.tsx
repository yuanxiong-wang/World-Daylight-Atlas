import React, { useState, useMemo } from 'react';
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
  const [showSeasonalCurves, setShowSeasonalCurves] = useState<boolean>(true);

  // Current solar position at city
  const solarPos = useMemo(() => getSolarPosition(city.lat, city.lng, currentDate), [city, currentDate]);

  // Solar daily times (sunrise, sunset, noon, twilights)
  const solarTimes = useMemo(() => getSolarTimes(city.lat, city.lng, currentDate), [city, currentDate]);

  // Helper to generate 24-hour solar curve for a specific day
  const generate24hCurve = (d: Date) => {
    const points: { hour: number; elevation: number }[] = [];
    const baseDate = new Date(d);
    baseDate.setUTCHours(0, 0, 0, 0);

    for (let h = 0; h <= 24; h += 0.5) {
      const sampleDate = new Date(baseDate.getTime() + h * 3600000);
      const pos = getSolarPosition(city.lat, city.lng, sampleDate);
      points.push({ hour: h, elevation: pos.elevation });
    }
    return points;
  };

  // Generate 24-hour elevation curve points for today
  const dailyCurve = useMemo(() => generate24hCurve(currentDate), [city, currentDate]);

  // Generate seasonal benchmark curves (Solstices & Equinox)
  const seasonalData = useMemo(() => {
    const year = currentDate.getUTCFullYear();
    const summerDate = new Date(Date.UTC(year, 5, 21, 12, 0, 0));
    const equinoxDate = new Date(Date.UTC(year, 2, 20, 12, 0, 0));
    const winterDate = new Date(Date.UTC(year, 11, 21, 12, 0, 0));

    const summerCurve = generate24hCurve(summerDate);
    const equinoxCurve = generate24hCurve(equinoxDate);
    const winterCurve = generate24hCurve(winterDate);

    const summerTimes = getSolarTimes(city.lat, city.lng, summerDate);
    const equinoxTimes = getSolarTimes(city.lat, city.lng, equinoxDate);
    const winterTimes = getSolarTimes(city.lat, city.lng, winterDate);

    const summerPeak = Math.max(...summerCurve.map((p) => p.elevation));
    const equinoxPeak = Math.max(...equinoxCurve.map((p) => p.elevation));
    const winterPeak = Math.max(...winterCurve.map((p) => p.elevation));

    return {
      summerCurve,
      equinoxCurve,
      winterCurve,
      summerTimes,
      equinoxTimes,
      winterTimes,
      summerPeak,
      equinoxPeak,
      winterPeak,
      deltaPeak: Math.max(0, summerPeak - winterPeak),
    };
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

  const formatDayLength = (st: typeof solarTimes) => {
    if (st.isPolarDay) return '24h 00m (Polar Day)';
    if (st.isPolarNight) return '0h 00m (Polar Night)';
    return `${Math.floor(st.dayLengthMinutes / 60)}h ${Math.floor(st.dayLengthMinutes % 60)}m`;
  };

  // SVG dimensions for 24h solar path
  const svgWidth = 480;
  const svgHeight = 175;
  const pad = { top: 15, right: 20, bottom: 25, left: 35 };
  const plotW = svgWidth - pad.left - pad.right;
  const plotH = svgHeight - pad.top - pad.bottom;

  // Map hour (0-24) to X, elevation (-90 to +90) to Y
  const getX = (hour: number) => pad.left + (hour / 24) * plotW;
  const getY = (elev: number) => pad.top + plotH * (1 - (elev + 90) / 180);
  const horizonY = getY(0);

  // Build SVG path strings
  const buildSvgPath = (points: { hour: number; elevation: number }[]) => {
    return points.reduce((acc, pt, idx) => {
      const x = getX(pt.hour);
      const y = getY(pt.elevation);
      return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');
  };

  const curveD = useMemo(() => buildSvgPath(dailyCurve), [dailyCurve]);
  const summerCurveD = useMemo(() => buildSvgPath(seasonalData.summerCurve), [seasonalData]);
  const equinoxCurveD = useMemo(() => buildSvgPath(seasonalData.equinoxCurve), [seasonalData]);
  const winterCurveD = useMemo(() => buildSvgPath(seasonalData.winterCurve), [seasonalData]);

  // Current time position in UTC hours
  const currentUtcHour = currentDate.getUTCHours() + currentDate.getUTCMinutes() / 60;
  const currentDotX = getX(currentUtcHour);
  const currentDotY = getY(solarPos.elevation);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] overflow-y-auto">
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
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>🧭</span> Orbit In 3D
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-slate-200 text-xs">
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
                {formatDayLength(solarTimes)}
              </span>
            </div>
          </div>

          {/* 24-Hour Solar Trajectory Chart with Seasonal Benchmark Overlays */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-white block">24-Hour Sun Trajectory &amp; Seasonal Variation</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  Current Alt: <strong className="text-amber-400">{solarPos.elevation.toFixed(1)}°</strong> • Az: {solarPos.azimuth.toFixed(1)}°
                </span>
              </div>
              <button
                onClick={() => setShowSeasonalCurves(!showSeasonalCurves)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border ${
                  showSeasonalCurves
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {showSeasonalCurves ? '🌿 Solstices Overlay Active' : '+ Show Solstices Overlay'}
              </button>
            </div>

            <div className="w-full flex justify-center overflow-x-auto py-1">
              <svg width={svgWidth} height={svgHeight} className="overflow-visible select-none max-w-full">
                {/* Daylight zone (above 0°) */}
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
                  opacity={0.25}
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

                {/* Seasonal Benchmark Curves */}
                {showSeasonalCurves && (
                  <>
                    {/* Summer Solstice (Amber dashed) */}
                    <path
                      d={summerCurveD}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={1.75}
                      strokeDasharray="4 3"
                      opacity={0.85}
                    />
                    {/* Equinox (Emerald dashed) */}
                    <path
                      d={equinoxCurveD}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={1.75}
                      strokeDasharray="4 3"
                      opacity={0.85}
                    />
                    {/* Winter Solstice (Cyan dashed) */}
                    <path
                      d={winterCurveD}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth={1.75}
                      strokeDasharray="4 3"
                      opacity={0.85}
                    />
                  </>
                )}

                {/* Today's Solar Trajectory Curve (Thick glowing gold) */}
                <path d={curveD} fill="none" stroke="#fde047" strokeWidth={3} strokeLinecap="round" />

                {/* Current Time Dot */}
                <circle cx={currentDotX} cy={currentDotY} r={5} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] border-t border-slate-800">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-amber-300 font-semibold">
                  <span className="w-3 h-1 bg-yellow-300 rounded-full inline-block"></span> Today's Path
                </span>
                {showSeasonalCurves && (
                  <>
                    <span className="flex items-center gap-1 text-amber-400">
                      <span className="w-3 h-0.5 border-t border-amber-500 border-dashed inline-block"></span> Summer (Jun 21)
                    </span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span className="w-3 h-0.5 border-t border-emerald-500 border-dashed inline-block"></span> Equinox (Mar 20)
                    </span>
                    <span className="flex items-center gap-1 text-sky-400">
                      <span className="w-3 h-0.5 border-t border-sky-400 border-dashed inline-block"></span> Winter (Dec 21)
                    </span>
                  </>
                )}
              </div>
              <span className="text-slate-400 font-mono">
                Annual Swing: <strong className="text-amber-400">Δ {seasonalData.deltaPeak.toFixed(1)}°</strong>
              </span>
            </div>
          </div>

          {/* Seasonal Daylight & Solar Elevation Comparison Table */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 space-y-2">
            <div className="font-semibold text-slate-300 flex items-center justify-between">
              <span>Seasonal Variation Profile (Solstices &amp; Equinoxes)</span>
              <span className="text-[10px] text-amber-400 font-mono font-normal">
                Latitude: {Math.abs(city.lat).toFixed(1)}°
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-left">
                    <th className="pb-1">Season</th>
                    <th className="pb-1">Date</th>
                    <th className="pb-1 text-right">Solar Noon Peak</th>
                    <th className="pb-1 text-right">Day Length</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  <tr className="hover:bg-amber-500/5">
                    <td className="py-1 text-amber-300 font-semibold">☀️ Summer Solstice</td>
                    <td className="py-1 text-slate-400">June 21</td>
                    <td className="py-1 text-right text-amber-400 font-bold">
                      {seasonalData.summerPeak > 0 ? `+${seasonalData.summerPeak.toFixed(1)}°` : `${seasonalData.summerPeak.toFixed(1)}°`}
                    </td>
                    <td className="py-1 text-right text-emerald-400">
                      {formatDayLength(seasonalData.summerTimes)}
                    </td>
                  </tr>
                  <tr className="hover:bg-emerald-500/5">
                    <td className="py-1 text-emerald-300 font-semibold">🌿 Equinox</td>
                    <td className="py-1 text-slate-400">March 20</td>
                    <td className="py-1 text-right text-emerald-400 font-bold">
                      {seasonalData.equinoxPeak > 0 ? `+${seasonalData.equinoxPeak.toFixed(1)}°` : `${seasonalData.equinoxPeak.toFixed(1)}°`}
                    </td>
                    <td className="py-1 text-right text-emerald-400">
                      {formatDayLength(seasonalData.equinoxTimes)}
                    </td>
                  </tr>
                  <tr className="hover:bg-sky-500/5">
                    <td className="py-1 text-sky-300 font-semibold">❄️ Winter Solstice</td>
                    <td className="py-1 text-slate-400">December 21</td>
                    <td className="py-1 text-right text-sky-400 font-bold">
                      {seasonalData.winterPeak > 0 ? `+${seasonalData.winterPeak.toFixed(1)}°` : `${seasonalData.winterPeak.toFixed(1)}°`}
                    </td>
                    <td className="py-1 text-right text-sky-400">
                      {formatDayLength(seasonalData.winterTimes)}
                    </td>
                  </tr>
                  <tr className="bg-slate-900/40">
                    <td className="py-1 text-yellow-300 font-bold">📍 Current Day</td>
                    <td className="py-1 text-slate-400">
                      {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-1 text-right text-yellow-300 font-bold">
                      {solarPos.elevation > 0 ? `+${solarPos.elevation.toFixed(1)}°` : `${solarPos.elevation.toFixed(1)}°`}
                    </td>
                    <td className="py-1 text-right text-emerald-400 font-bold">
                      {formatDayLength(solarTimes)}
                    </td>
                  </tr>
                </tbody>
              </table>
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
