import { Seasons } from 'astronomy-engine';
import type { SubsolarPoint, SolarPosition, DaylightPhase, SolarTimes, LatitudeDaylightData } from '../types';

export interface SolarMilestone {
  id: 'march-equinox' | 'june-solstice' | 'september-equinox' | 'december-solstice';
  name: string;
  color: string;
}

// Month names remain correct in both hemispheres. Dates are computed per year below.
export const SOLAR_MILESTONES: readonly SolarMilestone[] = [
  { id: 'march-equinox', name: 'March Equinox', color: '#10b981' },
  { id: 'june-solstice', name: 'June Solstice', color: '#f59e0b' },
  { id: 'september-equinox', name: 'September Equinox', color: '#a78bfa' },
  { id: 'december-solstice', name: 'December Solstice', color: '#38bdf8' },
];

const seasonCache = new Map<number, readonly number[]>();
export function getSolarMilestones(year: number) {
  if (!Number.isInteger(year)) throw new RangeError('Season year must be an integer');
  let instants = seasonCache.get(year);
  if (!instants) {
    const events = Seasons(year);
    instants = [events.mar_equinox, events.jun_solstice, events.sep_equinox, events.dec_solstice].map(event => event.date.getTime());
    seasonCache.set(year, instants);
  }
  return SOLAR_MILESTONES.map((milestone, i) => {
    const date = new Date(instants[i]);
    return { ...milestone, date, month: date.getUTCMonth(), day: date.getUTCDate() };
  });
}

export function getDailySolarCurve(latitude: number, longitude: number, date: Date) {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Array.from({ length: 49 }, (_, index) => ({
    hour: index / 2,
    elevation: getSolarPosition(latitude, longitude, new Date(midnight + index * 1800000)).elevation,
  }));
}

/** Geometric solar-noon altitude extrema, including zenith crossings in the tropics. */
export function getAnnualSolarAltitudeRange(latitude: number, year: number) {
  let minDeclination = 90;
  let maxDeclination = -90;
  const end = Date.UTC(year + 1, 0, 1);
  for (let time = Date.UTC(year, 0, 1, 12); time < end; time += 86400000) {
    const declination = getSunDeclination(new Date(time));
    minDeclination = Math.min(minDeclination, declination);
    maxDeclination = Math.max(maxDeclination, declination);
  }
  // Noon altitude is 90 - |latitude - declination|. Declination varies
  // continuously, so any latitude between its extrema reaches the zenith.
  const nearestDeclination = Math.max(minDeclination, Math.min(maxDeclination, latitude));
  const maxElevation = 90 - Math.abs(latitude - nearestDeclination);
  const minElevation = 90 - Math.max(
    Math.abs(latitude - minDeclination), Math.abs(latitude - maxDeclination),
  );
  return { minElevation, maxElevation, range: maxElevation - minElevation };
}

/** Preserve time continuity instead of joining points across the opposite phase. */
export function splitSolarPath<T extends { elev: number }>(samples: T[]) {
  const daySegments: T[][] = [];
  const nightSegments: T[][] = [];
  let previousDay: boolean | undefined;
  for (const sample of samples) {
    const isDay = sample.elev >= 0;
    const segments = isDay ? daySegments : nightSegments;
    if (isDay !== previousDay) segments.push([]);
    segments[segments.length - 1].push(sample);
    previousDay = isDay;
  }
  return { daySegments, nightSegments };
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Calculates the Julian Date for a given UTC Date
 */
export function getJulianDate(date: Date): number {
  const time = date.getTime();
  return time / 86400000 + 2440587.5;
}

/**
 * Calculates Julian Century from Julian Date
 */
export function getJulianCentury(jd: number): number {
  return (jd - 2451545.0) / 36525.0;
}

/**
 * Calculates Sun's geometric mean longitude (degrees)
 */
function getSunGeometricMeanLongitude(t: number): number {
  let l0 = 280.46646 + t * (36000.76983 + 0.0003032 * t);
  l0 = l0 % 360;
  if (l0 < 0) l0 += 360;
  return l0;
}

/**
 * Calculates Sun's mean anomaly (degrees)
 */
function getSunMeanAnomaly(t: number): number {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t);
}

/**
 * Calculates Earth's orbit eccentricity
 */
function getEarthOrbitEccentricity(t: number): number {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
}

/**
 * Calculates Sun's equation of center (degrees)
 */
function getSunEquationOfCenter(t: number, m: number): number {
  const mRad = m * DEG2RAD;
  return (
    Math.sin(mRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mRad) * 0.000289
  );
}

/**
 * Calculates Mean Obliquity of the Ecliptic (degrees)
 */
function getMeanObliquityOfEcliptic(t: number): number {
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  return 23.0 + (26.0 + seconds / 60.0) / 60.0;
}

/**
 * Calculates Obliquity Correction (degrees)
 */
function getObliquityCorrection(t: number): number {
  const e0 = getMeanObliquityOfEcliptic(t);
  const omega = 125.04 - 1934.136 * t;
  return e0 + 0.00256 * Math.cos(omega * DEG2RAD);
}

/**
 * Calculates Sun's True Longitude (degrees)
 */
function getSunTrueLongitude(t: number): number {
  const l0 = getSunGeometricMeanLongitude(t);
  const m = getSunMeanAnomaly(t);
  const c = getSunEquationOfCenter(t, m);
  return l0 + c;
}

/**
 * Calculates Sun's Apparent Longitude (degrees)
 */
function getSunApparentLongitude(t: number): number {
  const o = getSunTrueLongitude(t);
  const omega = 125.04 - 1934.136 * t;
  return o - 0.00569 - 0.00478 * Math.sin(omega * DEG2RAD);
}

/**
 * Calculates Sun's Declination (degrees)
 */
export function getSunDeclination(date: Date): number {
  const jd = getJulianDate(date);
  const t = getJulianCentury(jd);
  const lambda = getSunApparentLongitude(t);
  const epsilon = getObliquityCorrection(t);
  const sint = Math.sin(epsilon * DEG2RAD) * Math.sin(lambda * DEG2RAD);
  return Math.asin(sint) * RAD2DEG;
}

/**
 * Calculates Equation of Time (minutes)
 */
export function getEquationOfTime(date: Date): number {
  const jd = getJulianDate(date);
  const t = getJulianCentury(jd);
  const l0 = getSunGeometricMeanLongitude(t);
  const m = getSunMeanAnomaly(t);
  const e = getEarthOrbitEccentricity(t);
  const eps = getObliquityCorrection(t);

  const y = Math.tan((eps * DEG2RAD) / 2.0) ** 2;
  const l0Rad = l0 * DEG2RAD;
  const mRad = m * DEG2RAD;

  const sin2l0 = Math.sin(2.0 * l0Rad);
  const sinm = Math.sin(mRad);
  const cos2l0 = Math.cos(2.0 * l0Rad);
  const sin4l0 = Math.sin(4.0 * l0Rad);
  const sin2m = Math.sin(2.0 * mRad);

  const eot =
    y * sin2l0 -
    2.0 * e * sinm +
    4.0 * e * y * sinm * cos2l0 -
    0.5 * y * y * sin4l0 -
    1.25 * e * e * sin2m;

  return 4.0 * eot * RAD2DEG;
}

/**
 * Calculates the Subsolar Point (where the Sun is directly overhead at zenith)
 */
export function getSubsolarPoint(date: Date): SubsolarPoint {
  const declination = getSunDeclination(date);
  const eot = getEquationOfTime(date);

  // UTC time in decimal hours
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000;

  // The subsolar longitude is when the local solar time is 12:00
  // Local Solar Time = UTC_hours + (lon / 15) + (EoT / 60)
  // 12 = UTC_hours + (lon / 15) + (EoT / 60)
  // lon = (12 - UTC_hours - EoT / 60) * 15
  let subsolarLon = (12 - utcHours - eot / 60) * 15;

  // Normalize longitude to [-180, 180]
  while (subsolarLon > 180) subsolarLon -= 360;
  while (subsolarLon < -180) subsolarLon += 360;

  // Right Ascension
  const jd = getJulianDate(date);
  const t = getJulianCentury(jd);
  const lambda = getSunApparentLongitude(t);
  const epsilon = getObliquityCorrection(t);
  const alpha = Math.atan2(
    Math.cos(epsilon * DEG2RAD) * Math.sin(lambda * DEG2RAD),
    Math.cos(lambda * DEG2RAD)
  ) * RAD2DEG;

  // Solar noon at Prime Meridian in UTC
  const solarNoonMinutes = 720 - eot; // 720 min = 12:00
  const noonHour = Math.floor(solarNoonMinutes / 60);
  const noonMin = Math.floor(solarNoonMinutes % 60);
  const solarNoonUtc = `${String(noonHour).padStart(2, '0')}:${String(noonMin).padStart(2, '0')} UTC`;

  return {
    lat: declination,
    lng: subsolarLon,
    declination,
    equationOfTime: eot,
    rightAscension: (alpha + 360) % 360,
    solarNoonUtc,
  };
}

/**
 * Calculates Solar Position (Elevation, Azimuth, Zenith) for any point on Earth
 */
export function getSolarPosition(lat: number, lng: number, date: Date): SolarPosition {
  const subsolar = getSubsolarPoint(date);
  const phi = lat * DEG2RAD;
  const delta = subsolar.declination * DEG2RAD;
  
  // Hour angle H in radians:
  // H = (Local Solar Time - 12h) * 15°
  // Or H = (lng - subsolar.lng)
  let deltaLon = lng - subsolar.lng;
  while (deltaLon > 180) deltaLon -= 360;
  while (deltaLon < -180) deltaLon += 360;
  const h = deltaLon * DEG2RAD;

  // Elevation angle alpha:
  // sin(alpha) = sin(phi)*sin(delta) + cos(phi)*cos(delta)*cos(h)
  const sinAlpha =
    Math.sin(phi) * Math.sin(delta) +
    Math.cos(phi) * Math.cos(delta) * Math.cos(h);
  
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinAlpha))) * RAD2DEG;
  const zenith = 90 - elevation;

  // Azimuth angle gamma (from North clockwise):
  // cos(gamma) = (sin(delta) - sin(elevation)*sin(phi)) / (cos(elevation)*cos(phi))
  const cosElevation = Math.cos(elevation * DEG2RAD);
  const cosPhi = Math.cos(phi);
  
  let azimuth = 0;
  if (cosElevation * cosPhi !== 0) {
    const cosAzimuth =
      (Math.sin(delta) - Math.sin(elevation * DEG2RAD) * Math.sin(phi)) /
      (cosElevation * cosPhi);
    const clampedCos = Math.max(-1, Math.min(1, cosAzimuth));
    let rawAzimuth = Math.acos(clampedCos) * RAD2DEG;
    
    // Check if afternoon / morning
    if (Math.sin(h) > 0) {
      azimuth = (360 - rawAzimuth) % 360;
    } else {
      azimuth = rawAzimuth;
    }
  }

  // Determine Daylight Phase
  let phase: DaylightPhase = 'night';
  let phaseLabel = 'Night';

  if (elevation >= 6) {
    phase = 'day';
    phaseLabel = 'Daylight';
  } else if (elevation >= 0 && elevation < 6) {
    phase = 'golden-hour';
    phaseLabel = 'Golden Hour';
  } else if (elevation >= -6 && elevation < 0) {
    phase = 'civil-twilight';
    phaseLabel = 'Civil Twilight';
  } else if (elevation >= -12 && elevation < -6) {
    phase = 'nautical-twilight';
    phaseLabel = 'Nautical Twilight';
  } else if (elevation >= -18 && elevation < -12) {
    phase = 'astronomical-twilight';
    phaseLabel = 'Astronomical Twilight';
  } else {
    phase = 'night';
    phaseLabel = 'Night';
  }

  return {
    elevation,
    azimuth,
    zenith,
    phase,
    phaseLabel,
  };
}

/**
 * Calculates Great Circle Angular Distance in degrees from Subsolar point
 */
export function getAngularDistanceToSubsolar(lat: number, lng: number, subsolar: SubsolarPoint): number {
  const phi1 = lat * DEG2RAD;
  const phi2 = subsolar.lat * DEG2RAD;
  const deltaLambda = (lng - subsolar.lng) * DEG2RAD;

  const cosTheta =
    Math.sin(phi1) * Math.sin(phi2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  return Math.acos(Math.max(-1, Math.min(1, cosTheta))) * RAD2DEG;
}

/**
 * Computes the latitude on the daylight terminator for a given longitude.
 * Formula: tan(phi) = -cot(delta) * cos(lambda - lambda_sun)
 * Or phi = atan( -cos(lambda - lambda_sun) / tan(delta) )
 */
export function getTerminatorLatitude(lng: number, subsolar: SubsolarPoint): number {
  const delta = subsolar.declination * DEG2RAD;
  if (Math.abs(delta) < 1e-6) {
    // Equinox: terminator is straight vertical at subsolar.lng ± 90
    return 0;
  }
  const deltaLon = (lng - subsolar.lng) * DEG2RAD;
  const tanDelta = Math.tan(delta);
  const tanPhi = -Math.cos(deltaLon) / tanDelta;
  return Math.atan(tanPhi) * RAD2DEG;
}

/**
 * Computes twilight border latitude for given twilight depression angle (e.g. -6, -12, -18)
 */
export function getTwilightLatitude(lng: number, subsolar: SubsolarPoint, sunDepressionAngle: number): number | null {
  // Great circle with angular radius = 90 - sunDepressionAngle (e.g., 96° for civil)
  // Distance equation: sin(phi)*sin(delta) + cos(phi)*cos(delta)*cos(dLon) = sin(sunDepressionAngle)
  const delta = subsolar.declination * DEG2RAD;
  const dLon = (lng - subsolar.lng) * DEG2RAD;
  const h0 = sunDepressionAngle * DEG2RAD; // e.g. -6° * DEG2RAD
  
  // A*sin(phi) + B*cos(phi) = C
  // A = sin(delta)
  // B = cos(delta)*cos(dLon)
  // C = sin(h0)
  const A = Math.sin(delta);
  const B = Math.cos(delta) * Math.cos(dLon);
  const C = Math.sin(h0);
  
  const R = Math.sqrt(A * A + B * B);
  if (Math.abs(C) > R) return null; // No point at this longitude reaches this angle
  
  const alpha = Math.atan2(B, A);
  const phiRad = Math.asin(C / R) - alpha;
  return phiRad * RAD2DEG;
}

/**
 * Calculate sunrise, sunset, and twilight times for a specific location and date
 */
export function getSolarTimes(lat: number, lng: number, date: Date): SolarTimes {
  // A daily result must not depend on the simulation's hour within that UTC date.
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
  const eot = getEquationOfTime(day);
  const delta = getSunDeclination(day);
  
  // Solar noon in minutes from midnight UTC
  const solarNoonMinutes = 720 - 4 * lng - eot;
  const solarNoonDate = new Date(date);
  solarNoonDate.setUTCHours(0, 0, 0, 0);
  solarNoonDate.setTime(solarNoonDate.getTime() + solarNoonMinutes * 60000);

  const phi = lat * DEG2RAD;
  const deltaRad = delta * DEG2RAD;

  // Helper to compute time offset for a zenith angle
  const getTimeOffset = (zenithAngleDeg: number): number | 'polar-day' | 'polar-night' => {
    const zenithRad = zenithAngleDeg * DEG2RAD;
    const cosH0 = (Math.cos(zenithRad) - Math.sin(phi) * Math.sin(deltaRad)) / (Math.cos(phi) * Math.cos(deltaRad));
    
    if (cosH0 <= -1) return 'polar-day';
    if (cosH0 >= 1) return 'polar-night';
    
    const H0 = Math.acos(cosH0) * RAD2DEG;
    return H0 * 4; // 4 minutes per degree
  };

  // Standard sunrise/sunset: 90.833° (90° 50' accounting for refraction + solar semi-diameter)
  const sunriseOffset = getTimeOffset(90.8333);
  let sunrise: Date | null = null;
  let sunset: Date | null = null;
  let dayLengthMinutes = 0;
  let isPolarDay = false;
  let isPolarNight = false;

  if (sunriseOffset === 'polar-day') {
    isPolarDay = true;
    dayLengthMinutes = 1440;
  } else if (sunriseOffset === 'polar-night') {
    isPolarNight = true;
    dayLengthMinutes = 0;
  } else {
    sunrise = new Date(solarNoonDate.getTime() - sunriseOffset * 60000);
    sunset = new Date(solarNoonDate.getTime() + sunriseOffset * 60000);
    dayLengthMinutes = sunriseOffset * 2;
  }

  // Civil Twilight: 96°
  const civilOffset = getTimeOffset(96.0);
  let civilDawn: Date | null = null;
  let civilDusk: Date | null = null;
  if (typeof civilOffset === 'number') {
    civilDawn = new Date(solarNoonDate.getTime() - civilOffset * 60000);
    civilDusk = new Date(solarNoonDate.getTime() + civilOffset * 60000);
  }

  // Nautical Twilight: 102°
  const nauticalOffset = getTimeOffset(102.0);
  let nauticalDawn: Date | null = null;
  let nauticalDusk: Date | null = null;
  if (typeof nauticalOffset === 'number') {
    nauticalDawn = new Date(solarNoonDate.getTime() - nauticalOffset * 60000);
    nauticalDusk = new Date(solarNoonDate.getTime() + nauticalOffset * 60000);
  }

  // Astronomical Twilight: 108°
  const astroOffset = getTimeOffset(108.0);
  let astronomicalDawn: Date | null = null;
  let astronomicalDusk: Date | null = null;
  if (typeof astroOffset === 'number') {
    astronomicalDawn = new Date(solarNoonDate.getTime() - astroOffset * 60000);
    astronomicalDusk = new Date(solarNoonDate.getTime() + astroOffset * 60000);
  }

  return {
    sunrise,
    sunset,
    solarNoon: solarNoonDate,
    dayLengthMinutes,
    civilDawn,
    civilDusk,
    nauticalDawn,
    nauticalDusk,
    astronomicalDawn,
    astronomicalDusk,
    isPolarDay,
    isPolarNight,
  };
}

/**
 * Calculates daylight hours for all latitudes from -90° to +90° for a given date
 */
export function getLatitudeDaylightCurve(date: Date, step: number = 2): LatitudeDaylightData[] {
  const delta = getSunDeclination(date) * DEG2RAD;
  const results: LatitudeDaylightData[] = [];
  const zenithRad = 90.8333 * DEG2RAD;

  for (let lat = -90; lat <= 90; lat += step) {
    const phi = lat * DEG2RAD;
    const cosH0 = (Math.cos(zenithRad) - Math.sin(phi) * Math.sin(delta)) / (Math.cos(phi) * Math.cos(delta));

    if (cosH0 <= -1) {
      results.push({ latitude: lat, daylightHours: 24, isPolarDay: true, isPolarNight: false });
    } else if (cosH0 >= 1) {
      results.push({ latitude: lat, daylightHours: 0, isPolarDay: false, isPolarNight: true });
    } else {
      const H0 = Math.acos(cosH0) * RAD2DEG;
      const hours = (2 * H0) / 15;
      results.push({ latitude: lat, daylightHours: hours, isPolarDay: false, isPolarNight: false });
    }
  }

  return results;
}

/**
 * Calculates Global Daylight and Twilight Area Percentages
 */
export function getGlobalDaylightDistribution(date: Date): {
  daylightPercent: number;
  civilTwilightPercent: number;
  nauticalTwilightPercent: number;
  astronomicalTwilightPercent: number;
  nightPercent: number;
} {
  // Geometrically on a sphere:
  // Daylight area = (1 - cos(90.833°)) / 2 = (1 + sin(0.833°)) / 2 ≈ 50.73%
  // Civil twilight = (cos(90.833°) - cos(96°)) / 2 ≈ 4.5%
  // Nautical twilight = (cos(96°) - cos(102°)) / 2 ≈ 4.9%
  // Astronomical twilight = (cos(102°) - cos(108°)) / 2 ≈ 4.9%
  // Deep night = (1 + cos(108°)) / 2 ≈ 34.9%
  const deg2rad = Math.PI / 180;
  const dayCap = (1 - Math.cos(90.8333 * deg2rad)) / 2;
  const civilCap = (1 - Math.cos(96.0 * deg2rad)) / 2;
  const nauticalCap = (1 - Math.cos(102.0 * deg2rad)) / 2;
  const astroCap = (1 - Math.cos(108.0 * deg2rad)) / 2;

  const daylightPercent = dayCap * 100;
  const civilTwilightPercent = (civilCap - dayCap) * 100;
  const nauticalTwilightPercent = (nauticalCap - civilCap) * 100;
  const astronomicalTwilightPercent = (astroCap - nauticalCap) * 100;
  const nightPercent = (1.0 - astroCap) * 100;

  return {
    daylightPercent: Number(daylightPercent.toFixed(1)),
    civilTwilightPercent: Number(civilTwilightPercent.toFixed(1)),
    nauticalTwilightPercent: Number(nauticalTwilightPercent.toFixed(1)),
    astronomicalTwilightPercent: Number(astronomicalTwilightPercent.toFixed(1)),
    nightPercent: Number(nightPercent.toFixed(1)),
  };
}

/**
 * Returns key seasonal dates for the current year
 */
export function getSeasonalDates(year: number) {
  return getSolarMilestones(year).map(milestone => ({
    label: milestone.name,
    date: milestone.date,
    desc: milestone.id.includes('equinox')
      ? 'Computed equinox instant (UTC)'
      : 'Computed solstice instant (UTC)',
  }));
}
