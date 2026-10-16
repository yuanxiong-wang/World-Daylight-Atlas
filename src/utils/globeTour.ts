/** A scroll-scrubbed route. Each leg makes one complete turn before the next stop. */
export const TOUR_CITY_IDS = ['longyearbyen', 'london', 'singapore', 'sydney', 'ushuaia'];
export const TOUR_NOTES = [
  'Above the Arctic Circle, summer can bring midnight Sun and winter can bring polar night.',
  'At mid latitudes, the Sun’s daily arc and daylight hours change markedly through the year.',
  'Near the equator, daylight stays close to twelve hours throughout the year.',
  'In the Southern Hemisphere, the longest days arrive around the December solstice.',
  'Far south, long summer evenings give way to short winter days.',
];
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
export function sampleTour(progress: number, stops: readonly { lat: number; lng: number }[], reducedMotion = false) {
  if (!stops.length) throw new Error('A tour needs at least one stop');
  const p = clamp(progress, stops.length - 1);
  const leg = Math.min(Math.floor(p), Math.max(0, stops.length - 2));
  const t = p - leg;
  const eased = t * t * (3 - 2 * t);
  const from = stops[leg], to = stops[Math.min(leg + 1, stops.length - 1)];
  const longitudeDelta = ((to.lng - from.lng + 540) % 360) - 180;
  // Reduced motion moves directly between discrete city views without orbital spins.
  const stop = stops[Math.round(p)];
  const lat = reducedMotion ? stop.lat : from.lat + (to.lat - from.lat) * eased + 8 * Math.sin(2 * Math.PI * eased);
  const lng = reducedMotion ? stop.lng : from.lng + longitudeDelta * eased + 360 * eased;
  return { lat, lng, radius: reducedMotion ? 155 : 155 + 55 * Math.sin(Math.PI * t) ** 2,
    vortex: reducedMotion ? 0 : Math.sin(Math.PI * t) ** 8, stopIndex: Math.round(p) };
}
