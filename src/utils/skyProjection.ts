/** Perspective projection from an observer on the ground. Azimuth runs north → east. */
export function projectSkyPoint(azimuth: number, elevation: number, heading: number, pitch: number,
  width: number, height: number) {
  const rad = Math.PI / 180;
  const relative = (azimuth - heading) * rad;
  const altitude = elevation * rad;
  const tilt = pitch * rad;
  const horizontal = Math.cos(altitude);
  const right = horizontal * Math.sin(relative);
  const up = Math.sin(altitude) * Math.cos(tilt) - horizontal * Math.cos(relative) * Math.sin(tilt);
  const forward = Math.sin(altitude) * Math.sin(tilt) + horizontal * Math.cos(relative) * Math.cos(tilt);
  if (forward <= 0.02) return null;
  const focal = width / 2; // 90-degree horizontal field of view
  return { x: width / 2 + focal * right / forward, y: height / 2 - focal * up / forward };
}

export function clampSkyPitch(pitch: number) { return Math.max(-10, Math.min(80, pitch)); }
export function normalizeHeading(heading: number) { return ((heading % 360) + 360) % 360; }
