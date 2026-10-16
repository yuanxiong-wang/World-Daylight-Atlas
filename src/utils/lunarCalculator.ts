import type { LunarPhaseData, LunarPhaseType } from '../types';
import { Body, Illumination, MoonPhase, SearchMoonPhase } from 'astronomy-engine';

// Reuse event searches while the instant stays within the same new/full interval.
let events: { from: number; until: number; full: number; nextNew: number; lastNew: number } | null = null;
function getEvents(date: Date) {
  const now = date.getTime();
  if (!events || now < events.from || now >= events.until) {
    const start = new Date(now + 1000); // next means strictly after this instant
    const full = SearchMoonPhase(180, start, 40)!.date.getTime();
    const nextNew = SearchMoonPhase(0, start, 40)!.date.getTime();
    const lastNew = SearchMoonPhase(0, date, -40)!.date.getTime();
    events = { from: now, until: Math.min(full, nextNew), full, nextNew, lastNew };
  }
  return events;
}

/** Geocentric phase, illuminated fraction and searched event times from Astronomy Engine. */
export function getLunarPhase(date: Date): LunarPhaseData {
  const d = MoonPhase(date);
  const illumination = Math.round(Illumination(Body.Moon, date).phase_fraction * 1000) / 10;
  const event = getEvents(date);
  const ageDays = Math.round((date.getTime() - event.lastNew) / 8640000) / 10;

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

  const nextFullMoonDate = new Date(event.full);
  const nextNewMoonDate = new Date(event.nextNew);
  const daysToFullMoon = Math.round((event.full - date.getTime()) / 8640000) / 10;
  const daysToNewMoon = Math.round((event.nextNew - date.getTime()) / 8640000) / 10;

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

