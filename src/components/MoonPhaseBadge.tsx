import React, { useState, useMemo } from 'react';
import { getLunarPhase } from '../utils/lunarCalculator';

interface MoonPhaseBadgeProps {
  currentDate: Date;
}

export const MoonDiskSVG: React.FC<{
  illumination: number;
  elongationDeg: number;
  size?: number;
}> = ({ illumination, elongationDeg, size = 30 }) => {
  const r = size / 2;
  const isWaxing = elongationDeg < 180;
  const cosD = Math.cos(elongationDeg * (Math.PI / 180));
  const rX = Math.max(0.1, Math.abs(cosD) * (r - 1));

  // Determine path for lit portion of Moon
  let litPath = '';
  if (illumination > 1 && illumination < 99) {
    if (isWaxing) {
      if (cosD <= 0) {
        // Waxing Gibbous: right half is lit + left crescent bulge
        litPath = `M ${r} 1 A ${r - 1} ${r - 1} 0 0 1 ${r} ${size - 1} A ${rX} ${r - 1} 0 0 1 ${r} 1 Z`;
      } else {
        // Waxing Crescent: right side lit up to ellipse curve
        litPath = `M ${r} 1 A ${r - 1} ${r - 1} 0 0 1 ${r} ${size - 1} A ${rX} ${r - 1} 0 0 0 ${r} 1 Z`;
      }
    } else {
      if (cosD <= 0) {
        // Waning Gibbous: left half is lit + right crescent bulge
        litPath = `M ${r} 1 A ${r - 1} ${r - 1} 0 0 0 ${r} ${size - 1} A ${rX} ${r - 1} 0 0 0 ${r} 1 Z`;
      } else {
        // Waning Crescent: left side lit up to ellipse curve
        litPath = `M ${r} 1 A ${r - 1} ${r - 1} 0 0 0 ${r} ${size - 1} A ${rX} ${r - 1} 0 0 1 ${r} 1 Z`;
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="overflow-visible select-none drop-shadow-md flex-shrink-0"
    >
      <defs>
        <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="85%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </radialGradient>
      </defs>

      {/* Unlit Dark Moon Disk */}
      <circle cx={r} cy={r} r={r - 1} fill="#111827" stroke="#334155" strokeWidth="1.2" />

      {/* Lit Moon Fraction */}
      {illumination >= 99 ? (
        <circle cx={r} cy={r} r={r - 1} fill="url(#moonGlow)" />
      ) : litPath ? (
        <path d={litPath} fill="url(#moonGlow)" />
      ) : null}
    </svg>
  );
};

export const MoonPhaseBadge: React.FC<MoonPhaseBadgeProps> = ({ currentDate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const lunar = useMemo(() => getLunarPhase(currentDate), [currentDate]);

  return (
    <div className="relative">
      {/* Clickable Badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="pointer-events-auto bg-slate-900/85 backdrop-blur-md hover:bg-slate-850 border border-slate-700/80 rounded-xl px-3 py-2 shadow-xl flex items-center gap-2.5 text-white transition-all cursor-pointer group"
        title="View Lunar Phase and Moon Ephemeris"
      >
        <MoonDiskSVG
          illumination={lunar.illumination}
          elongationDeg={lunar.elongationDeg}
          size={24}
        />
        <div className="text-left leading-tight hidden xs:block">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-100 group-hover:text-amber-300 transition-colors">
              {lunar.phaseName}
            </span>
            <span className="text-[10px] text-amber-400 font-mono font-bold">
              {lunar.illumination}%
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono block">
            Day {lunar.ageDays} / 29.5d
          </span>
        </div>
      </button>

      {/* Expandable Lunar Details Popover */}
      {isOpen && (
        <div className="absolute top-12 right-0 sm:left-0 sm:right-auto z-40 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-white w-72 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <MoonDiskSVG
                illumination={lunar.illumination}
                elongationDeg={lunar.elongationDeg}
                size={34}
              />
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>{lunar.glyph}</span> {lunar.phaseName}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {lunar.illumination}% Illuminated • {lunar.ageDays}d Moon Age
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-xs font-mono"
            >
              ✕
            </button>
          </div>

          <div className="py-2.5 space-y-2 text-xs">
            {/* Cycle Progress Bar */}
            <div>
              <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>New Moon</span>
                <span>Full Moon</span>
                <span>New Moon</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-slate-700 via-amber-400 to-slate-700 rounded-full transition-all"
                  style={{ width: `${(lunar.ageDays / 29.53) * 100}%` }}
                />
              </div>
            </div>

            {/* Upcoming Milestones */}
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
              <div className="bg-slate-800/60 rounded-lg p-2 border border-slate-700/50">
                <span className="text-[10px] text-slate-400 block font-sans">🌕 Next Full Moon</span>
                <span className="text-amber-300 font-semibold">
                  {lunar.daysToFullMoon === 0 ? 'Today' : `in ${lunar.daysToFullMoon}d`}
                </span>
                <span className="text-[9px] text-slate-400 block mt-0.5 font-sans">
                  {lunar.nextFullMoonDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>

              <div className="bg-slate-800/60 rounded-lg p-2 border border-slate-700/50">
                <span className="text-[10px] text-slate-400 block font-sans">🌑 Next New Moon</span>
                <span className="text-sky-300 font-semibold">
                  {lunar.daysToNewMoon === 0 ? 'Today' : `in ${lunar.daysToNewMoon}d`}
                </span>
                <span className="text-[9px] text-slate-400 block mt-0.5 font-sans">
                  {lunar.nextNewMoonDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>

            {/* Solar-Lunar Elongation */}
            <div className="flex justify-between items-center pt-1 text-[11px] text-slate-300 border-t border-slate-800">
              <span className="text-slate-400">Sun-Moon Elongation:</span>
              <span className="font-mono text-emerald-400 font-semibold">{lunar.elongationDeg}°</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
