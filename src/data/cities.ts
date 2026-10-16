import { CityData } from '../types';

export const WORLD_CITIES: CityData[] = [
  // Polar / Extreme Latitudes
  { id: 'tromso', name: 'Tromsø', country: 'Norway', lat: 69.6492, lng: 18.9553, timezone: 'Europe/Oslo', population: 77000 },
  { id: 'fairbanks', name: 'Fairbanks', country: 'United States (Alaska)', lat: 64.8378, lng: -147.7164, timezone: 'America/Anchorage', population: 32000 },
  { id: 'reykjavik', name: 'Reykjavík', country: 'Iceland', lat: 64.1466, lng: -21.9426, timezone: 'Atlantic/Reykjavik', population: 135000 },
  { id: 'ushuaia', name: 'Ushuaia', country: 'Argentina', lat: -54.8019, lng: -68.3030, timezone: 'America/Argentina/Ushuaia', population: 82000 },
  { id: 'mcmurdo', name: 'McMurdo Station', country: 'Antarctica', lat: -77.8419, lng: 166.6863, timezone: 'Pacific/Auckland', population: 1000 },

  // Europe
  { id: 'london', name: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278, timezone: 'Europe/London', population: 8982000 },
  { id: 'paris', name: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522, timezone: 'Europe/Paris', population: 2161000 },
  { id: 'berlin', name: 'Berlin', country: 'Germany', lat: 52.5200, lng: 13.4050, timezone: 'Europe/Berlin', population: 3645000 },
  { id: 'rome', name: 'Rome', country: 'Italy', lat: 41.9028, lng: 12.4964, timezone: 'Europe/Rome', population: 2873000 },
  { id: 'madrid', name: 'Madrid', country: 'Spain', lat: 40.4168, lng: -3.7038, timezone: 'Europe/Madrid', population: 3223000 },
  { id: 'athens', name: 'Athens', country: 'Greece', lat: 37.9838, lng: 23.7275, timezone: 'Europe/Athens', population: 664000 },
  { id: 'stockholm', name: 'Stockholm', country: 'Sweden', lat: 59.3293, lng: 18.0686, timezone: 'Europe/Stockholm', population: 975000 },
  { id: 'kyiv', name: 'Kyiv', country: 'Ukraine', lat: 50.4501, lng: 30.5234, timezone: 'Europe/Kyiv', population: 2962000 },

  // Asia
  { id: 'tokyo', name: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503, timezone: 'Asia/Tokyo', population: 13960000 },
  { id: 'shanghai', name: 'Shanghai', country: 'China', lat: 31.2304, lng: 121.4737, timezone: 'Asia/Shanghai', population: 26320000 },
  { id: 'singapore', name: 'Singapore', country: 'Singapore', lat: 1.3521, lng: 103.8198, timezone: 'Asia/Singapore', population: 5686000 },
  { id: 'mumbai', name: 'Mumbai', country: 'India', lat: 19.0760, lng: 72.8777, timezone: 'Asia/Kolkata', population: 20411000 },
  { id: 'bangkok', name: 'Bangkok', country: 'Thailand', lat: 13.7563, lng: 100.5018, timezone: 'Asia/Bangkok', population: 10539000 },
  { id: 'seoul', name: 'Seoul', country: 'South Korea', lat: 37.5665, lng: 126.9780, timezone: 'Asia/Seoul', population: 9776000 },
  { id: 'dubai', name: 'Dubai', country: 'United Arab Emirates', lat: 25.2048, lng: 55.2708, timezone: 'Asia/Dubai', population: 3331000 },

  // North America
  { id: 'seattle', name: 'Seattle', country: 'United States', lat: 47.6062, lng: -122.3321, timezone: 'America/Los_Angeles', population: 737015 },
  { id: 'dallas', name: 'Dallas', country: 'United States', lat: 32.7767, lng: -96.7970, timezone: 'America/Chicago', population: 1304379 },
  { id: 'charlotte', name: 'Charlotte', country: 'United States', lat: 35.2271, lng: -80.8431, timezone: 'America/New_York', population: 874579 },
  { id: 'new-york', name: 'New York City', country: 'United States', lat: 40.7128, lng: -74.0060, timezone: 'America/New_York', population: 8336000 },
  { id: 'san-francisco', name: 'San Francisco', country: 'United States', lat: 37.7749, lng: -122.4194, timezone: 'America/Los_Angeles', population: 873965 },
  { id: 'los-angeles', name: 'Los Angeles', country: 'United States', lat: 34.0522, lng: -118.2437, timezone: 'America/Los_Angeles', population: 3979000 },
  { id: 'chicago', name: 'Chicago', country: 'United States', lat: 41.8781, lng: -87.6298, timezone: 'America/Chicago', population: 2693000 },
  { id: 'toronto', name: 'Toronto', country: 'Canada', lat: 43.6532, lng: -79.3832, timezone: 'America/Toronto', population: 2794000 },
  { id: 'vancouver', name: 'Vancouver', country: 'Canada', lat: 49.2827, lng: -123.1207, timezone: 'America/Vancouver', population: 675218 },
  { id: 'mexico-city', name: 'Mexico City', country: 'Mexico', lat: 19.4326, lng: -99.1332, timezone: 'America/Mexico_City', population: 9209944 },
  { id: 'honolulu', name: 'Honolulu', country: 'United States (Hawaii)', lat: 21.3069, lng: -157.8583, timezone: 'Pacific/Honolulu', population: 350964 },

  // South America
  { id: 'sao-paulo', name: 'São Paulo', country: 'Brazil', lat: -23.5505, lng: -46.6333, timezone: 'America/Sao_Paulo', population: 12325232 },
  { id: 'buenos-aires', name: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lng: -58.3816, timezone: 'America/Argentina/Buenos_Aires', population: 3120612 },
  { id: 'santiago', name: 'Santiago', country: 'Chile', lat: -33.4489, lng: -70.6693, timezone: 'America/Santiago', population: 6257516 },
  { id: 'bogota', name: 'Bogotá', country: 'Colombia', lat: 4.7110, lng: -74.0721, timezone: 'America/Bogota', population: 7181469 },
  { id: 'lima', name: 'Lima', country: 'Peru', lat: -12.0464, lng: -77.0428, timezone: 'America/Lima', population: 9752000 },

  // Africa
  { id: 'cairo', name: 'Cairo', country: 'Egypt', lat: 30.0444, lng: 31.2357, timezone: 'Africa/Cairo', population: 9606916 },
  { id: 'nairobi', name: 'Nairobi', country: 'Kenya', lat: -1.2921, lng: 36.8219, timezone: 'Africa/Nairobi', population: 4397073 },
  { id: 'johannesburg', name: 'Johannesburg', country: 'South Africa', lat: -26.2041, lng: 28.0473, timezone: 'Africa/Johannesburg', population: 5635127 },
  { id: 'lagos', name: 'Lagos', country: 'Nigeria', lat: 6.5244, lng: 3.3792, timezone: 'Africa/Lagos', population: 14862000 },
  { id: 'casablanca', name: 'Casablanca', country: 'Morocco', lat: 33.5731, lng: -7.5898, timezone: 'Africa/Casablanca', population: 3711158 },

  // Oceania
  { id: 'sydney', name: 'Sydney', country: 'Australia', lat: -33.8688, lng: 151.2093, timezone: 'Australia/Sydney', population: 5312000 },
  { id: 'melbourne', name: 'Melbourne', country: 'Australia', lat: -37.8136, lng: 144.9631, timezone: 'Australia/Melbourne', population: 5078000 },
  { id: 'auckland', name: 'Auckland', country: 'New Zealand', lat: -36.8485, lng: 174.7633, timezone: 'Pacific/Auckland', population: 1657000 },
  { id: 'fiji', name: 'Suva', country: 'Fiji', lat: -18.1416, lng: 178.4419, timezone: 'Pacific/Fiji', population: 88271 },
];

