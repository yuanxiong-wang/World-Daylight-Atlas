export type ViewMode = '3d-globe' | '2d-map';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface SubsolarPoint extends Coordinates {
  declination: number; // in degrees
  equationOfTime: number; // in minutes
  rightAscension: number; // in degrees
  solarNoonUtc: string;
}

export interface CityData {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  timezone: string;
  population?: number;
}

export interface SolarPosition {
  elevation: number; // degrees above horizon
  azimuth: number; // degrees from North clockwise
  zenith: number; // degrees from zenith
  phase: DaylightPhase;
  phaseLabel: string;
}

export type DaylightPhase = 
  | 'day' 
  | 'golden-hour' 
  | 'civil-twilight' 
  | 'nautical-twilight' 
  | 'astronomical-twilight' 
  | 'night';

export interface SolarTimes {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  dayLengthMinutes: number;
  civilDawn: Date | null;
  civilDusk: Date | null;
  nauticalDawn: Date | null;
  nauticalDusk: Date | null;
  astronomicalDawn: Date | null;
  astronomicalDusk: Date | null;
  isPolarDay: boolean;
  isPolarNight: boolean;
}

export interface GlobeLayerSettings {
  showAtmosphere: boolean;
  showClouds: boolean;
  showNightLights: boolean;
  showTerminator: boolean;
  showTwilightBands: boolean;
  showSubsolarPoint: boolean;
  showCities: boolean;
  showGraticule: boolean;
  showSunRays: boolean;
  showSunTrajectory: boolean;
  cloudOpacity: number;
  rotationSpeed: number; // auto-rotation when not playing
  autoRotate: boolean;
}

export interface LatitudeDaylightData {
  latitude: number;
  daylightHours: number;
  isPolarDay: boolean;
  isPolarNight: boolean;
}

export type LunarPhaseType = 
  | 'new-moon' 
  | 'waxing-crescent' 
  | 'first-quarter' 
  | 'waxing-gibbous' 
  | 'full-moon' 
  | 'waning-gibbous' 
  | 'last-quarter' 
  | 'waning-crescent';

export interface LunarPhaseData {
  phase: LunarPhaseType;
  phaseName: string;
  glyph: string;
  illumination: number; // 0 to 100 percentage
  ageDays: number; // 0 to 29.53 days
  elongationDeg: number; // angle from sun (0° to 360°)
  nextFullMoonDate: Date;
  nextNewMoonDate: Date;
  daysToFullMoon: number;
  daysToNewMoon: number;
}

