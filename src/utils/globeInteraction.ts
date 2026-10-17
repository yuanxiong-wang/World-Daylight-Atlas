import { getSolarPosition } from './solarCalculator.ts';
import type { CityData } from '../types';

export interface GlobeInteractionOptions { spiral: boolean; snapping: boolean; idleDrift: boolean; }
export const DEFAULT_INTERACTIONS: GlobeInteractionOptions = { spiral: true, snapping: true, idleDrift: true };
export const clampSimulationDate = (date: Date) => new Date(Math.max(Date.UTC(1900, 0, 1), Math.min(Date.UTC(2101, 0, 1) - 1, date.getTime())));
export function stepUtcMonth(date: Date, delta: number) {
  const next = new Date(date), day = next.getUTCDate();
  next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + delta);
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return clampSimulationDate(next);
}
const distance = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180, p = a.lat * rad, q = b.lat * rad;
  return Math.acos(Math.max(-1, Math.min(1, Math.sin(p) * Math.sin(q) + Math.cos(p) * Math.cos(q) * Math.cos((a.lng - b.lng) * rad)))) / rad;
};
export function findMagneticSnap(point: { lat: number; lng: number }, cities: readonly CityData[], date: Date) {
  const meridian = ((Math.round(point.lng / 30) * 30 + 540) % 360) - 180;
  const candidates: { lat: number; lng: number; label: string; kind: 'meridian' | 'city'; distance: number }[] = [];
  const meridianDistance = distance(point, { lat: point.lat, lng: meridian });
  if (Math.abs(point.lat) < 85 && meridianDistance <= 2) candidates.push({ lat: point.lat, lng: meridian,
    label: `${Math.abs(meridian)}°${meridian < 0 ? 'W' : 'E'} meridian`, kind: 'meridian', distance: meridianDistance });
  for (const city of cities) {
    const separation = distance(point, city);
    if (separation > 3) continue;
    const altitude = getSolarPosition(city.lat, city.lng, date).elevation;
    if ([0, -6, -12, -18].some(boundary => Math.abs(altitude - boundary) <= 1)) candidates.push({ ...city,
      label: `${city.name} · twilight boundary`, kind: 'city', distance: separation });
  }
  return candidates.sort((a, b) => a.distance - b.distance)[0] ?? null;
}

export interface ProjectedCity { id: string; x: number; y: number; }
/** Stable screen-space Fibonacci placement, only for overlapping connected clusters. */
export function unfoldCities(points: readonly ProjectedCity[], width: number, height: number) {
  const parents = points.map((_, i) => i);
  const root = (i: number): number => parents[i] === i ? i : (parents[i] = root(parents[i]));
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < 22) parents[root(j)] = root(i);
  }
  const clusters = new Map<number, ProjectedCity[]>();
  points.forEach((point, i) => { const key = root(i); clusters.set(key, [...(clusters.get(key) ?? []), point]); });
  const result = new Map<string, ProjectedCity & { expanded: boolean }>();
  const ordered = [...clusters.values()].map(cluster => cluster.sort((a, b) => a.id.localeCompare(b.id)))
    .sort((a, b) => a[0].id.localeCompare(b[0].id));
  const occupied = ordered.filter(cluster => cluster.length === 1).map(cluster => cluster[0]);
  for (const cluster of ordered) {
    if (cluster.length < 2) { const point = cluster[0]; result.set(point.id, { ...point, expanded: false }); continue; }
    const radius = 18 * Math.sqrt(cluster.length), margin = radius + 12;
    const cx = Math.max(margin, Math.min(width - margin, cluster.reduce((sum, point) => sum + point.x, 0) / cluster.length));
    const cy = Math.max(margin, Math.min(height - margin, cluster.reduce((sum, point) => sum + point.y, 0) / cluster.length));
    let seed = 0;
    for (const point of cluster) {
      let x = point.x, y = point.y;
      for (let attempt = 0; attempt < 512; attempt++) {
        const angle = seed * Math.PI * (3 - Math.sqrt(5)), r = 18 * Math.sqrt(++seed);
        x = cx + r * Math.cos(angle); y = cy + r * Math.sin(angle);
        if (x >= 10 && x <= width - 10 && y >= 10 && y <= height - 10 && occupied.every(p => Math.hypot(x - p.x, y - p.y) >= 22)) break;
      }
      const placed = { id: point.id, x, y, expanded: true };
      result.set(point.id, placed); occupied.push(placed);
    }
  }
  return result;
}
export function canIdleDrift(now: number, lastActivity: number, options: {
  enabled: boolean; reducedMotion: boolean; locked: boolean; playing: boolean; tour: boolean; dragging: boolean;
}) {
  return options.enabled && !options.reducedMotion && !options.locked && !options.playing && !options.tour && !options.dragging && now - lastActivity >= 30000;
}
