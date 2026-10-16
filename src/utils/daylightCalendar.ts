import { getSolarTimes } from './solarCalculator.ts';

export function getDaylightCalendar(latitude: number, longitude: number, year: number) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw new RangeError('Choose a year from 1900 to 2100.');
  const days = [];
  const end = Date.UTC(year + 1, 0, 1);
  for (let time = Date.UTC(year, 0, 1, 12); time < end; time += 86400000) {
    const date = new Date(time);
    const times = getSolarTimes(latitude, longitude, date);
    days.push({ date, minutes: times.dayLengthMinutes, polarDay: times.isPolarDay, polarNight: times.isPolarNight });
  }
  return days;
}

export function formatDaylight(minutes: number): string {
  const rounded = Math.max(0, Math.min(1440, Math.round(minutes)));
  return `${Math.floor(rounded / 60)}h ${String(rounded % 60).padStart(2, '0')}m`;
}
