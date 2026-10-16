import type { CityData } from '../types';
import { getSolarPosition, getSolarTimes } from './solarCalculator.ts';

export const getLocalDayKey = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
};
export interface LightWindow { start: Date; end: Date; clipped: boolean; }
/** Golden: geometric Sun −4°..+6°; blue: −6°..−4°. Local solar day, centered at noon. */
export function getPhotographyWindows(city: Pick<CityData, 'lat' | 'lng' | 'timezone'>, date: Date) {
  const day = getLocalDayKey(date, city.timezone);
  let noon = getSolarTimes(city.lat, city.lng, new Date(`${day}T12:00:00Z`)).solarNoon.getTime();
  // Political time zones can lie on the opposite side of the date line from longitude.
  noon += new Date(`${day}T00:00:00Z`).getTime() - new Date(`${getLocalDayKey(new Date(noon), city.timezone)}T00:00:00Z`).getTime();
  const start = noon - 43200000, end = noon + 43200000;
  const altitude = (time: number) => getSolarPosition(city.lat, city.lng, new Date(time)).elevation;
  const samples = Array.from({ length: 289 }, (_, i) => ({ time: start + i * 300000, altitude: altitude(start + i * 300000) }));
  const cuts = [start, end];
  for (const threshold of [-6, -4, 6]) for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if ((a.altitude < threshold) === (b.altitude < threshold)) continue;
    let lo = a.time, hi = b.time;
    for (let n = 0; n < 22; n++) {
      const middle = (lo + hi) / 2;
      if ((altitude(middle) < threshold) === (a.altitude < threshold)) lo = middle; else hi = middle;
    }
    cuts.push((lo + hi) / 2);
  }
  cuts.sort((a, b) => a - b);
  const windows = (low: number, high: number): LightWindow[] => {
    const result: LightWindow[] = [];
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1], b = cuts[i], elev = altitude((a + b) / 2);
      if (elev < low || elev > high || b - a < 1) continue;
      const previous = result[result.length - 1];
      if (previous && Math.abs(previous.end.getTime() - a) < 2) {
        previous.end = new Date(b); previous.clipped ||= b === end;
      } else result.push({ start: new Date(a), end: new Date(b), clipped: a === start || b === end });
    }
    return result;
  };
  return { day, golden: windows(-4, 6), blue: windows(-6, -4) };
}
