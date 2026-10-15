import { LunarPhaseData, LunarPhaseType } from '../types';
import { getJulianDate, getJulianCentury } from './solarCalculator';

const DEG2RAD = Math.PI / 180;

/**
 * Calculates high-accuracy Lunar Phase data for a given date
 * Uses astronomical mean elongation and anomaly formulas (Meeus Astronomical Algorithms)
 */
export function getLunarPhase(date: Date): LunarPhaseData {
  const jd = getJulianDate(date);
  const t = getJulianCentury(jd);

  // Mean elongation of the Moon (degrees)
  let d =
    297.8501921 +
    445267.1114034 * t -
    0.0018819 * t * t +
    (t * t * t) / 545868 -
    (t * t * t * t) / 113065000;
  d = ((d % 360) + 360) % 360;

  // Sun's mean anomaly (degrees)
  const m = ((357.5291092 + 35999.0502909 * t - 0.0001536 * t * t) % 360 + 360) % 360;

  // Moon's mean anomaly (degrees)
  const mPrime = ((134.9633964 + 477198.8675055 * t + 0.0087414 * t * t) % 360 + 360) % 360;

  // Phase angle i (degrees) between Sun and Earth as seen from Moon
  const dRad = d * DEG2RAD;
  const mRad = m * DEG2RAD;
  const mpRad = mPrime * DEG2RAD;

  const phaseAngle =
    180 -
    d -
    6.289 * Math.sin(mpRad) +
    2.1 * Math.sin(mRad) -
    1.274 * Math.sin(2 * dRad - mpRad) -
    0.658 * Math.sin(2 * dRad) -
    0.214 * Math.sin(2 * mpRad) -
    0.11 * Math.sin(dRad);

  // Illuminated fraction k (0.0 to 1.0)
  const k = (1 + Math.cos(phaseAngle * DEG2RAD)) / 2;
  const illumination = Math.round(Math.max(0, Math.min(1, k)) * 1000) / 10; // e.g. 78.4%

  // Synodic month length (days)
  const SYNODIC_MONTH = 29.53058867;
  const ageDays = Math.round(((d / 360) * SYNODIC_MONTH) * 10) / 10;

  // Determine Lunar Phase category & glyph
  let phase: LunarPhaseType;
  let phaseName: string;
  let glyph: string;

  if (d >= 348.75 || d < 11.25) {
    phase = 'new-moon';
    phaseName = 'New Moon';
    glyph = '🌑';
  } else if (d >= 11.25 && d < 78.75) {
    phase = 'waxing-crescent';
    phaseName = 'Waxing Crescent';
    glyph = '🌒';
  } else if (d >= 78.75 && d < 101.25) {
    phase = 'first-quarter';
    phaseName = 'First Quarter';
    glyph = '🌓';
  } else if (d >= 101.25 && d < 168.75) {
    phase = 'waxing-gibbous';
    phaseName = 'Waxing Gibbous';
    glyph = '🌔';
  } else if (d >= 168.75 && d < 191.25) {
    phase = 'full-moon';
    phaseName = 'Full Moon';
    glyph = '🌕';
  } else if (d >= 191.25 && d < 258.75) {
    phase = 'waning-gibbous';
    phaseName = 'Waning Gibbous';
    glyph = '🌖';
  } else if (d >= 258.75 && d < 281.25) {
    phase = 'last-quarter';
    phaseName = 'Third Quarter';
    glyph = '🌗';
  } else {
    phase = 'waning-crescent';
    phaseName = 'Waning Crescent';
    glyph = '🌘';
  }

  // Days to next Full Moon (d = 180°)
  let deltaFullDeg = 180 - d;
  if (deltaFullDeg < 0) deltaFullDeg += 360;
  const daysToFullMoon = Math.round((deltaFullDeg / 360) * SYNODIC_MONTH * 10) / 10;
  const nextFullMoonDate = new Date(date.getTime() + daysToFullMoon * 86400000);

  // Days to next New Moon (d = 360°)
  const deltaNewDeg = 360 - d;
  const daysToNewMoon = Math.round((deltaNewDeg / 360) * SYNODIC_MONTH * 10) / 10;
  const nextNewMoonDate = new Date(date.getTime() + daysToNewMoon * 86400000);

  return {
    phase,
    phaseName,
    glyph,
    illumination,
    ageDays,
    elongationDeg: Math.round(d * 10) / 10,
    nextFullMoonDate,
    nextNewMoonDate,
    daysToFullMoon,
    daysToNewMoon,
  };
}
