import React, { useMemo } from 'react';
import { SubsolarPoint } from '../types';
import {
  getLatitudeDaylightCurve,
  getGlobalDaylightDistribution,
  getSeasonalDates,
} from '../utils/solarCalculator';

interface DaylightAnalyticsProps {
  currentDate: Date;
  subsolarPoint: SubsolarPoint;
  onSelectDate: (date: Date) => void;
  onClose: () => void;
}

export const DaylightAnalytics: React.FC<DaylightAnalyticsProps> = ({
  currentDate,
  subsolarPoint,
  onSelectDate,
  onClose,
}) => {
  // Compute daylight vs latitude curve
  const latitudeCurve = useMemo(() => getLatitudeDaylightCurve(currentDate, 3), [currentDate]);

  // Compute global distribution percentages
  const distribution = useMemo(() => getGlobalDaylightDistribution(currentDate), [currentDate]);

  // Seasonal key events
  const seasonalEvents = useMemo(() => getSeasonalDates(currentDate.getUTCFullYear()), [currentDate]);

  // SVG dimensions for Latitude curve
  const chartWidth = 520;
  const chartHeight = 220;
  const padding = { top: 20, right: 30, bottom: 40, left: 45 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  // Map latitude (-90 to 90) to X, and hours (0 to 24) to Y
  const getX = (lat: number) => padding.left + ((lat + 90) / 180) * innerW;
  const getY = (hours: number) => padding.top + innerH - (hours / 24) * innerH;

  // Build SVG path
  const pathD = useMemo(() => {
    return latitudeCurve.reduce((acc, pt, idx) => {
      const x = getX(pt.latitude);
      const y = getY(pt.daylightHours);
      return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');
  }, [latitudeCurve]);

  // Polar circle latitudes
  const arcticCircleX = getX(66.56);
  const antarcticCircleX = getX(-66.56);
  const equatorX = getX(0);

  return (
    <div className="atlas-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-amber-400">📊</span> Global Daylight & Solar Analytics
            </h2>
            <p className="text-xs text-slate-400">
              Astronomical irradiance metrics for {currentDate.toUTCString().slice(0, 16)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-200 text-sm">
          {/* Key Astronomical Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
              <span className="text-xs text-slate-400 block">Solar Declination (δ)</span>
              <span className="text-lg font-mono font-bold text-amber-400">
                {subsolarPoint.declination >= 0 ? '+' : ''}
                {subsolarPoint.declination.toFixed(2)}°
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                {subsolarPoint.declination > 0 ? 'Tilted toward North' : 'Tilted toward South'}
              </span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
              <span className="text-xs text-slate-400 block">Equation of Time (EoT)</span>
              <span className="text-lg font-mono font-bold text-sky-400">
                {subsolarPoint.equationOfTime >= 0 ? '+' : ''}
                {subsolarPoint.equationOfTime.toFixed(1)} min
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">Orbital speed deviation</span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
              <span className="text-xs text-slate-400 block">Subsolar Longitude</span>
              <span className="text-lg font-mono font-bold text-emerald-400">
                {Math.abs(subsolarPoint.lng).toFixed(1)}°{subsolarPoint.lng >= 0 ? 'E' : 'W'}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">Solar Noon Meridian</span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
              <span className="text-xs text-slate-400 block">Daylight Area Coverage</span>
              <span className="text-lg font-mono font-bold text-amber-300">
                {(distribution.daylightPercent + distribution.civilTwilightPercent).toFixed(1)}%
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">Direct + Civil Twilight</span>
            </div>
          </div>

          {/* Latitude Daylight Hours Curve */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold text-white">Daylight Hours vs Latitude Profile</h3>
                <p className="text-xs text-slate-400">
                  Length of photoperiod from South Pole (-90°) to North Pole (+90°)
                </p>
              </div>
              <div className="text-xs font-mono text-slate-400">
                Equator: <span className="text-emerald-400 font-semibold">12.1h</span>
              </div>
            </div>

            <div className="w-full overflow-x-auto flex justify-center">
              <svg width={chartWidth} height={chartHeight} className="overflow-visible select-none">
                {/* Horizontal grid lines for hours */}
                {[0, 6, 12, 18, 24].map((hr) => {
                  const y = getY(hr);
                  return (
                    <g key={hr}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={chartWidth - padding.right}
                        y2={y}
                        stroke="#334155"
                        strokeDasharray={hr === 12 ? 'none' : '3 3'}
                        strokeWidth={hr === 12 ? 1.5 : 1}
                      />
                      <text
                        x={padding.left - 8}
                        y={y + 4}
                        fill="#94a3b8"
                        fontSize={10}
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        {hr}h
                      </text>
                    </g>
                  );
                })}

                {/* Vertical markers for Equator & Polar Circles */}
                <line
                  x1={equatorX}
                  y1={padding.top}
                  x2={equatorX}
                  y2={chartHeight - padding.bottom}
                  stroke="#22c55e"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
                <line
                  x1={arcticCircleX}
                  y1={padding.top}
                  x2={arcticCircleX}
                  y2={chartHeight - padding.bottom}
                  stroke="#38bdf8"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                />
                <line
                  x1={antarcticCircleX}
                  y1={padding.top}
                  x2={antarcticCircleX}
                  y2={chartHeight - padding.bottom}
                  stroke="#38bdf8"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                />

                {/* Area under curve fill */}
                <path
                  d={`${pathD} L ${getX(90)} ${getY(0)} L ${getX(-90)} ${getY(0)} Z`}
                  fill="url(#daylightGradient)"
                  opacity={0.35}
                />

                {/* Primary Daylight Curve */}
                <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth={3} strokeLinecap="round" />

                {/* Gradient definition */}
                <defs>
                  <linearGradient id="daylightGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* X Axis Labels */}
                <text x={getX(-90)} y={chartHeight - 15} fill="#94a3b8" fontSize={9} textAnchor="start">
                  -90° (SP)
                </text>
                <text x={antarcticCircleX} y={chartHeight - 15} fill="#38bdf8" fontSize={9} textAnchor="middle">
                  -66.5°
                </text>
                <text x={equatorX} y={chartHeight - 15} fill="#22c55e" fontSize={9} textAnchor="middle">
                  0° (Eq)
                </text>
                <text x={arcticCircleX} y={chartHeight - 15} fill="#38bdf8" fontSize={9} textAnchor="middle">
                  +66.5°
                </text>
                <text x={getX(90)} y={chartHeight - 15} fill="#94a3b8" fontSize={9} textAnchor="end">
                  +90° (NP)
                </text>
              </svg>
            </div>
          </div>

          {/* Global Lighting Area Breakdown */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-2">Global Surface Lighting Balance</h3>
            
            {/* Multi-segment progress bar */}
            <div className="h-4 w-full rounded-full overflow-hidden flex bg-slate-800 mb-3">
              <div
                style={{ width: `${distribution.daylightPercent}%` }}
                className="bg-amber-400"
                title={`Daylight: ${distribution.daylightPercent}%`}
              />
              <div
                style={{ width: `${distribution.civilTwilightPercent}%` }}
                className="bg-sky-400"
                title={`Civil Twilight: ${distribution.civilTwilightPercent}%`}
              />
              <div
                style={{ width: `${distribution.nauticalTwilightPercent}%` }}
                className="bg-indigo-500"
                title={`Nautical Twilight: ${distribution.nauticalTwilightPercent}%`}
              />
              <div
                style={{ width: `${distribution.astronomicalTwilightPercent}%` }}
                className="bg-purple-600"
                title={`Astronomical Twilight: ${distribution.astronomicalTwilightPercent}%`}
              />
              <div
                style={{ width: `${distribution.nightPercent}%` }}
                className="bg-slate-900 border-l border-slate-700"
                title={`Night: ${distribution.nightPercent}%`}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-amber-400 flex-shrink-0" />
                <span>Daylight: <strong>{distribution.daylightPercent}%</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-sky-400 flex-shrink-0" />
                <span>Civil: <strong>{distribution.civilTwilightPercent}%</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-indigo-500 flex-shrink-0" />
                <span>Nautical: <strong>{distribution.nauticalTwilightPercent}%</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-purple-600 flex-shrink-0" />
                <span>Astro: <strong>{distribution.astronomicalTwilightPercent}%</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-slate-900 border border-slate-700 flex-shrink-0" />
                <span>Night: <strong>{distribution.nightPercent}%</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Jump to Key Solstices & Equinoxes */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2.5">Celestial Solstice & Equinox Benchmarks</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {seasonalEvents.map((evt) => (
                <button
                  key={evt.label}
                  onClick={() => onSelectDate(evt.date)}
                  className="text-left bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-3 transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <h4 className="font-semibold text-sky-400 group-hover:text-sky-300 text-xs">
                      {evt.label}
                    </h4>
                    <p className="text-[11px] text-slate-400">{evt.desc}</p>
                  </div>
                  <span className="text-xs font-mono text-slate-400 group-hover:text-white px-2 py-1 rounded bg-slate-900 border border-slate-700">
                    Jump →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

