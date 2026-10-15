import * as THREE from 'three';

/**
 * Procedural Earth Textures Generator
 * Creates realistic day albedo, night city lights, specular ocean mask, and cloud textures
 * entirely in-memory using HTML5 Canvas (100% zero-404, zero external asset dependencies).
 */

// Helper to convert lat/lng to canvas pixel coordinates
function toCanvasCoords(lat: number, lng: number, width: number, height: number): [number, number] {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return [x, y];
}

/**
 * Basic simplified polygonal paths for major landmasses to render procedural continents
 */
const CONTINENT_POLYGONS: { name: string; biome: 'forest' | 'desert' | 'tundra' | 'ice' | 'tropical'; coords: [number, number][] }[] = [
  // North America
  {
    name: 'North America Main',
    biome: 'forest',
    coords: [
      [70, -165], [72, -155], [71, -130], [69, -115], [68, -90], [62, -75], [58, -64], [52, -55],
      [47, -53], [44, -64], [41, -70], [35, -75], [30, -81], [25, -80], [29, -89], [29, -95],
      [26, -97], [20, -97], [16, -93], [14, -88], [9, -79], [8, -83], [15, -93], [20, -105],
      [24, -110], [30, -115], [34, -119], [38, -123], [48, -125], [54, -133], [58, -137], [60, -145],
      [60, -153], [55, -162], [60, -166], [65, -168], [70, -165]
    ]
  },
  {
    name: 'North American Southwest Deserts',
    biome: 'desert',
    coords: [
      [40, -118], [39, -105], [32, -102], [28, -100], [25, -105], [32, -116]
    ]
  },
  {
    name: 'Greenland',
    biome: 'ice',
    coords: [
      [83, -30], [81, -18], [76, -19], [70, -22], [65, -35], [60, -44], [65, -52], [72, -56],
      [78, -68], [82, -60], [83, -30]
    ]
  },
  // South America
  {
    name: 'South America Amazon & Brazil',
    biome: 'tropical',
    coords: [
      [11, -73], [10, -62], [6, -53], [0, -50], [-3, -40], [-8, -35], [-13, -39], [-22, -41],
      [-25, -48], [-33, -52], [-38, -58], [-42, -64], [-53, -68], [-55, -67], [-52, -75],
      [-45, -74], [-35, -72], [-22, -70], [-15, -75], [-5, -81], [1, -80], [8, -78], [11, -73]
    ]
  },
  {
    name: 'Andes / Patagonia Dry',
    biome: 'tundra',
    coords: [
      [-20, -68], [-28, -69], [-38, -69], [-48, -70], [-54, -68], [-53, -66], [-42, -63], [-32, -66]
    ]
  },
  // Eurasia
  {
    name: 'Europe & Russia West',
    biome: 'forest',
    coords: [
      [71, 28], [70, 42], [68, 60], [67, 75], [60, 60], [52, 50], [45, 48], [42, 43],
      [42, 28], [36, 28], [36, 22], [40, 18], [44, 12], [43, 3], [36, -5], [37, -9],
      [43, -9], [48, -5], [51, 2], [54, 8], [58, 11], [60, 5], [64, 10], [70, 20], [71, 28]
    ]
  },
  {
    name: 'British Isles',
    biome: 'forest',
    coords: [
      [58, -5], [58, -2], [51, 1], [50, -5], [54, -3], [58, -5]
    ]
  },
  {
    name: 'Scandinavia',
    biome: 'forest',
    coords: [
      [71, 25], [68, 15], [63, 10], [58, 11], [56, 12], [60, 19], [65, 23], [70, 29]
    ]
  },
  {
    name: 'Siberia North & Far East',
    biome: 'tundra',
    coords: [
      [76, 100], [73, 125], [71, 150], [66, 170], [65, 180], [64, -172], [60, -170],
      [58, 162], [52, 156], [50, 142], [54, 137], [56, 120], [60, 100], [65, 80], [72, 75], [76, 100]
    ]
  },
  {
    name: 'Asia Central & China',
    biome: 'forest',
    coords: [
      [52, 85], [50, 120], [42, 130], [38, 122], [32, 121], [25, 119], [22, 114], [21, 108],
      [22, 100], [27, 89], [32, 76], [40, 70], [48, 65], [52, 85]
    ]
  },
  {
    name: 'Gobi & Taklamakan Desert',
    biome: 'desert',
    coords: [
      [45, 90], [44, 112], [38, 110], [36, 95], [38, 85], [42, 85]
    ]
  },
  {
    name: 'Himalayas & Tibetan Plateau',
    biome: 'ice',
    coords: [
      [36, 78], [35, 95], [30, 96], [28, 88], [30, 80], [33, 76]
    ]
  },
  {
    name: 'Indian Subcontinent',
    biome: 'tropical',
    coords: [
      [28, 70], [28, 88], [22, 89], [16, 82], [10, 80], [8, 77], [15, 74], [22, 69], [25, 67]
    ]
  },
  {
    name: 'Southeast Asia & Indochina',
    biome: 'tropical',
    coords: [
      [21, 108], [20, 102], [13, 101], [8, 100], [4, 101], [1, 104], [6, 102], [12, 108], [16, 108], [21, 108]
    ]
  },
  {
    name: 'Indonesia & Philippines Archipelago',
    biome: 'tropical',
    coords: [
      [-6, 106], [-8, 115], [-8, 125], [-2, 138], [-3, 140], [-8, 141], [-6, 130], [-7, 110], [-6, 106]
    ]
  },
  {
    name: 'Japan',
    biome: 'forest',
    coords: [
      [44, 142], [42, 144], [35, 140], [33, 132], [35, 134], [40, 140]
    ]
  },
  {
    name: 'Arabian Peninsula',
    biome: 'desert',
    coords: [
      [31, 35], [30, 48], [24, 52], [23, 59], [17, 54], [13, 44], [15, 42], [22, 38], [28, 35]
    ]
  },
  // Africa
  {
    name: 'Sahara Desert North Africa',
    biome: 'desert',
    coords: [
      [36, 10], [32, 25], [31, 33], [22, 37], [15, 40], [12, 42], [12, 20], [15, 0], [18, -16],
      [26, -15], [32, -9], [35, -2], [36, 10]
    ]
  },
  {
    name: 'Sub-Saharan & Central Africa',
    biome: 'tropical',
    coords: [
      [12, -15], [12, 42], [5, 47], [0, 42], [-10, 40], [-20, 35], [-28, 32], [-34, 25],
      [-34, 18], [-25, 14], [-15, 12], [-5, 12], [4, 9], [6, 2], [5, -5], [9, -13], [12, -15]
    ]
  },
  // Australia & New Zealand
  {
    name: 'Australia Continent',
    biome: 'desert',
    coords: [
      [-12, 132], [-12, 142], [-17, 146], [-25, 153], [-34, 151], [-38, 145], [-35, 136],
      [-32, 130], [-35, 117], [-30, 115], [-22, 114], [-15, 124], [-12, 132]
    ]
  },
  {
    name: 'Australia East Coast Green',
    biome: 'forest',
    coords: [
      [-16, 145], [-23, 151], [-30, 153], [-37, 148], [-35, 142], [-28, 148]
    ]
  },
  {
    name: 'New Zealand',
    biome: 'forest',
    coords: [
      [-35, 174], [-40, 176], [-46, 168], [-44, 171], [-39, 174]
    ]
  },
  // Antarctica
  {
    name: 'Antarctica',
    biome: 'ice',
    coords: [
      [-65, -60], [-70, -30], [-72, 0], [-68, 40], [-66, 80], [-65, 120], [-66, 150],
      [-72, 170], [-78, 180], [-78, -170], [-73, -150], [-72, -110], [-70, -80], [-65, -60]
    ]
  }
];

// Major city night illumination clusters [lat, lng, radius, brightness]
const CITY_LIGHT_CLUSTERS: [number, number, number, number][] = [
  // North America
  [40.71, -74.00, 16, 1.0], // NYC / Boston / Philly
  [41.87, -87.62, 12, 0.9], // Chicago
  [34.05, -118.24, 14, 0.95], // LA / SoCal
  [37.77, -122.41, 10, 0.9], // Bay Area
  [29.76, -95.36, 10, 0.85], // Houston
  [33.74, -84.38, 9, 0.8], // Atlanta
  [47.60, -122.33, 8, 0.8], // Seattle
  [19.43, -99.13, 14, 0.9], // Mexico City
  [43.65, -79.38, 10, 0.85], // Toronto

  // Europe
  [51.50, -0.12, 15, 1.0], // London & SE England
  [48.85, 2.35, 12, 0.95], // Paris
  [51.22, 6.77, 18, 1.0], // Rhine-Ruhr / Benelux
  [41.90, 12.49, 10, 0.85], // Rome & Po Valley
  [40.41, -3.70, 9, 0.85], // Madrid
  [52.52, 13.40, 8, 0.85], // Berlin
  [55.75, 37.61, 12, 0.9], // Moscow
  [50.45, 30.52, 7, 0.75], // Kyiv

  // Asia
  [35.67, 139.65, 20, 1.0], // Tokyo / Kanto Megalopolis
  [34.69, 135.50, 12, 0.95], // Osaka / Kansai
  [37.56, 126.97, 12, 0.95], // Seoul
  [31.23, 121.47, 18, 1.0], // Shanghai / Yangtze Delta
  [39.90, 116.40, 15, 0.95], // Beijing / Tianjin
  [23.12, 113.26, 18, 1.0], // Pearl River Delta (Guangzhou, Shenzhen, HK)
  [1.35, 103.81, 10, 0.95], // Singapore & Malacca Strait
  [13.75, 100.50, 9, 0.85], // Bangkok
  [19.07, 72.87, 12, 0.9], // Mumbai
  [28.61, 77.20, 14, 0.9], // Delhi
  [25.20, 55.27, 9, 0.95], // Dubai & Persian Gulf

  // South America
  [-23.55, -46.63, 14, 0.95], // São Paulo
  [-22.90, -43.17, 10, 0.9], // Rio de Janeiro
  [-34.60, -58.38, 11, 0.85], // Buenos Aires
  [-33.44, -70.66, 8, 0.8], // Santiago

  // Africa & Oceania
  [30.04, 31.23, 12, 0.9], // Cairo & Nile Delta
  [6.52, 3.37, 9, 0.8], // Lagos
  [-26.20, 28.04, 10, 0.85], // Johannesburg
  [-33.86, 151.20, 10, 0.9], // Sydney
  [-37.81, 144.96, 9, 0.85], // Melbourne
];

export interface EarthTextureBundle {
  dayMap: THREE.CanvasTexture;
  nightMap: THREE.CanvasTexture;
  specularMap: THREE.CanvasTexture;
  cloudMap: THREE.CanvasTexture;
}

/**
 * Creates full procedural texture suite for 3D Earth
 */
export function createEarthTextures(): EarthTextureBundle {
  const width = 2048;
  const height = 1024;

  // 1. Day Map Canvas
  const dayCanvas = document.createElement('canvas');
  dayCanvas.width = width;
  dayCanvas.height = height;
  const dayCtx = dayCanvas.getContext('2d')!;

  // Ocean Base: Deep ocean gradient with realistic bathymetry simulation
  const oceanGrad = dayCtx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#0b1d3a'); // Arctic dark blue
  oceanGrad.addColorStop(0.2, '#0f2952'); // Northern oceans
  oceanGrad.addColorStop(0.5, '#0c2750'); // Equatorial deep sapphire
  oceanGrad.addColorStop(0.8, '#0d254c'); // Southern oceans
  oceanGrad.addColorStop(1, '#091830'); // Antarctic waters
  dayCtx.fillStyle = oceanGrad;
  dayCtx.fillRect(0, 0, width, height);

  // Subtle ocean wave texture noise
  dayCtx.fillStyle = 'rgba(255, 255, 255, 0.015)';
  for (let i = 0; i < 4000; i++) {
    const rx = Math.random() * width;
    const ry = Math.random() * height;
    dayCtx.fillRect(rx, ry, 2 + Math.random() * 4, 1);
  }

  // Draw Continents with Biome Colors
  CONTINENT_POLYGONS.forEach((cont) => {
    dayCtx.beginPath();
    cont.coords.forEach(([lat, lng], idx) => {
      const [x, y] = toCanvasCoords(lat, lng, width, height);
      if (idx === 0) dayCtx.moveTo(x, y);
      else dayCtx.lineTo(x, y);
    });
    dayCtx.closePath();

    // Biome palette
    let fillColor = '#2e5832'; // Default forest green
    if (cont.biome === 'desert') fillColor = '#c2a66b'; // Sahara / Arabian golden sand
    else if (cont.biome === 'tropical') fillColor = '#1c4a25'; // Amazon / Congo lush dark emerald
    else if (cont.biome === 'tundra') fillColor = '#556550'; // Sub-arctic tundra
    else if (cont.biome === 'ice') fillColor = '#e8eff7'; // Ice sheets

    dayCtx.fillStyle = fillColor;
    dayCtx.fill();

    // Continental shelf coastal turquoise rim
    dayCtx.lineWidth = 4;
    dayCtx.strokeStyle = 'rgba(28, 120, 160, 0.35)';
    dayCtx.stroke();

    // Inner land border
    dayCtx.lineWidth = 1.5;
    dayCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    dayCtx.stroke();
  });

  // Additional detail: River systems (Amazon, Nile, Mississippi, Yangtze, Danube)
  dayCtx.strokeStyle = 'rgba(12, 45, 90, 0.7)';
  dayCtx.lineWidth = 2;
  // Nile
  dayCtx.beginPath();
  const [nx0, ny0] = toCanvasCoords(31.2, 31.2, width, height);
  const [nx1, ny1] = toCanvasCoords(15.5, 32.5, width, height);
  const [nx2, ny2] = toCanvasCoords(0.0, 32.5, width, height);
  dayCtx.moveTo(nx0, ny0);
  dayCtx.lineTo(nx1, ny1);
  dayCtx.lineTo(nx2, ny2);
  dayCtx.stroke();

  // Amazon
  dayCtx.beginPath();
  const [ax0, ay0] = toCanvasCoords(-0.5, -50.0, width, height);
  const [ax1, ay1] = toCanvasCoords(-3.0, -60.0, width, height);
  const [ax2, ay2] = toCanvasCoords(-4.0, -73.0, width, height);
  dayCtx.moveTo(ax0, ay0);
  dayCtx.lineTo(ax1, ay1);
  dayCtx.lineTo(ax2, ay2);
  dayCtx.stroke();

  // Subtle Graticule on Day Texture (Equator, Tropics, Prime Meridian)
  dayCtx.lineWidth = 1;
  dayCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  dayCtx.setLineDash([6, 6]);

  // Equator
  const [, eqY] = toCanvasCoords(0, 0, width, height);
  dayCtx.beginPath();
  dayCtx.moveTo(0, eqY);
  dayCtx.lineTo(width, eqY);
  dayCtx.stroke();

  // Tropic of Cancer (23.44° N)
  const [, canY] = toCanvasCoords(23.44, 0, width, height);
  dayCtx.beginPath();
  dayCtx.moveTo(0, canY);
  dayCtx.lineTo(width, canY);
  dayCtx.stroke();

  // Tropic of Capricorn (-23.44° S)
  const [, capY] = toCanvasCoords(-23.44, 0, width, height);
  dayCtx.beginPath();
  dayCtx.moveTo(0, capY);
  dayCtx.lineTo(width, capY);
  dayCtx.stroke();

  // Arctic & Antarctic Circles (±66.56°)
  const [, arcY] = toCanvasCoords(66.56, 0, width, height);
  const [, antY] = toCanvasCoords(-66.56, 0, width, height);
  dayCtx.beginPath();
  dayCtx.moveTo(0, arcY);
  dayCtx.lineTo(width, arcY);
  dayCtx.moveTo(0, antY);
  dayCtx.lineTo(width, antY);
  dayCtx.stroke();

  dayCtx.setLineDash([]); // Reset line dash

  // 2. Night Map Canvas (Dark earth + glowing golden/amber cities)
  const nightCanvas = document.createElement('canvas');
  nightCanvas.width = width;
  nightCanvas.height = height;
  const nightCtx = nightCanvas.getContext('2d')!;

  // Deep pitch black background
  nightCtx.fillStyle = '#020408';
  nightCtx.fillRect(0, 0, width, height);

  // Very faint continent outlines on night side for spatial grounding
  CONTINENT_POLYGONS.forEach((cont) => {
    nightCtx.beginPath();
    cont.coords.forEach(([lat, lng], idx) => {
      const [x, y] = toCanvasCoords(lat, lng, width, height);
      if (idx === 0) nightCtx.moveTo(x, y);
      else nightCtx.lineTo(x, y);
    });
    nightCtx.closePath();
    nightCtx.fillStyle = '#060a14';
    nightCtx.fill();
  });

  // Render Glowing City Lights
  CITY_LIGHT_CLUSTERS.forEach(([lat, lng, radius, brightness]) => {
    const [cx, cy] = toCanvasCoords(lat, lng, width, height);
    const radPx = (radius / 180) * height * 1.5;

    // Outer warm amber glow
    const glowGrad = nightCtx.createRadialGradient(cx, cy, 0, cx, cy, radPx);
    glowGrad.addColorStop(0, `rgba(255, 235, 170, ${0.9 * brightness})`);
    glowGrad.addColorStop(0.3, `rgba(255, 180, 70, ${0.65 * brightness})`);
    glowGrad.addColorStop(0.7, `rgba(220, 110, 30, ${0.25 * brightness})`);
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    nightCtx.fillStyle = glowGrad;
    nightCtx.beginPath();
    nightCtx.arc(cx, cy, radPx, 0, Math.PI * 2);
    nightCtx.fill();

    // Hot white urban core
    nightCtx.fillStyle = `rgba(255, 255, 240, ${0.95 * brightness})`;
    nightCtx.beginPath();
    nightCtx.arc(cx, cy, Math.max(2, radPx * 0.18), 0, Math.PI * 2);
    nightCtx.fill();

    // Peripheral satellite towns & road networks
    for (let s = 0; s < 6; s++) {
      const angle = (s / 6) * Math.PI * 2 + Math.random() * 0.5;
      const dist = (0.35 + Math.random() * 0.6) * radPx;
      const sx = cx + Math.cos(angle) * dist;
      const sy = cy + Math.sin(angle) * dist;
      nightCtx.fillStyle = `rgba(255, 200, 100, ${0.4 * brightness})`;
      nightCtx.beginPath();
      nightCtx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      nightCtx.fill();
    }
  });

  // 3. Specular Map (High on ocean water, zero on land, moderate on ice)
  const specCanvas = document.createElement('canvas');
  specCanvas.width = width;
  specCanvas.height = height;
  const specCtx = specCanvas.getContext('2d')!;

  // Oceans are highly specular (white = #e0e0e0)
  specCtx.fillStyle = '#d0d8e8';
  specCtx.fillRect(0, 0, width, height);

  // Continents are rough matte (black = #000000)
  CONTINENT_POLYGONS.forEach((cont) => {
    specCtx.beginPath();
    cont.coords.forEach(([lat, lng], idx) => {
      const [x, y] = toCanvasCoords(lat, lng, width, height);
      if (idx === 0) specCtx.moveTo(x, y);
      else specCtx.lineTo(x, y);
    });
    specCtx.closePath();
    specCtx.fillStyle = cont.biome === 'ice' ? '#556575' : '#080808';
    specCtx.fill();
  });

  // 4. Procedural Cloud Layer Canvas
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = width;
  cloudCanvas.height = height;
  const cloudCtx = cloudCanvas.getContext('2d')!;

  // Transparent background
  cloudCtx.clearRect(0, 0, width, height);

  // Generate atmospheric swirling cloud swirls
  // Equatorial ITCZ band (Intertropical Convergence Zone)
  for (let b = 0; b < 18; b++) {
    const x = (b / 18) * width + (Math.random() - 0.5) * 80;
    const y = height * 0.5 + (Math.sin(b * 0.8) * 40) + (Math.random() - 0.5) * 30;
    const rad = 60 + Math.random() * 80;
    const grad = cloudCtx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    grad.addColorStop(0.5, 'rgba(240, 245, 255, 0.25)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    cloudCtx.fillStyle = grad;
    cloudCtx.beginPath();
    cloudCtx.arc(x, y, rad, 0, Math.PI * 2);
    cloudCtx.fill();
  }

  // Mid-latitude storm spirals (Northern and Southern hemispheres)
  const cycloneCenters: [number, number][] = [
    [52, -35], // North Atlantic depression
    [48, 160], // North Pacific storm
    [-50, -45], // Roaring Forties South Atlantic
    [-45, 95], // Southern Indian Ocean
    [22, -135], // Pacific tropical wave
  ];

  cycloneCenters.forEach(([lat, lng]) => {
    const [cx, cy] = toCanvasCoords(lat, lng, width, height);
    for (let arm = 0; arm < 4; arm++) {
      const armAngle = (arm / 4) * Math.PI * 2;
      for (let step = 0; step < 16; step++) {
        const spiralAngle = armAngle + step * 0.35;
        const spiralDist = step * 9 + Math.random() * 5;
        const sx = cx + Math.cos(spiralAngle) * spiralDist;
        const sy = cy + Math.sin(spiralAngle) * spiralDist;
        const rad = 14 + step * 2;

        const grad = cloudCtx.createRadialGradient(sx, sy, 0, sx, sy, rad);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        cloudCtx.fillStyle = grad;
        cloudCtx.beginPath();
        cloudCtx.arc(sx, sy, rad, 0, Math.PI * 2);
        cloudCtx.fill();
      }
    }
  });

  // Convert canvases to Three.js textures with SRGBColorSpace & high anisotropy
  const dayMap = new THREE.CanvasTexture(dayCanvas);
  dayMap.colorSpace = THREE.SRGBColorSpace;
  dayMap.anisotropy = 8;

  const nightMap = new THREE.CanvasTexture(nightCanvas);
  nightMap.colorSpace = THREE.SRGBColorSpace;
  nightMap.anisotropy = 8;

  const specularMap = new THREE.CanvasTexture(specCanvas);
  specularMap.colorSpace = THREE.NoColorSpace;

  const cloudMap = new THREE.CanvasTexture(cloudCanvas);
  cloudMap.colorSpace = THREE.SRGBColorSpace;
  cloudMap.wrapS = THREE.RepeatWrapping;
  cloudMap.wrapT = THREE.ClampToEdgeWrapping;

  return {
    dayMap,
    nightMap,
    specularMap,
    cloudMap,
  };
}

/**
 * Creates 3D starfield particles for deep space background
 */
export function createStarfield(): THREE.Points {
  const starCount = 3500;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);

  const starColors = [
    new THREE.Color('#ffffff'), // White
    new THREE.Color('#9bb0ff'), // Blue-white
    new THREE.Color('#ffcc6f'), // Warm yellow
    new THREE.Color('#ff8555'), // Reddish giant
  ];

  for (let i = 0; i < starCount; i++) {
    // Distribute on distant sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const radius = 180 + Math.random() * 60;

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Star color & magnitude
    const color = starColors[Math.floor(Math.random() * starColors.length)];
    const brightness = 0.5 + Math.random() * 0.5;
    colors[i * 3] = color.r * brightness;
    colors[i * 3 + 1] = color.g * brightness;
    colors[i * 3 + 2] = color.b * brightness;

    sizes[i] = 1.0 + Math.random() * 2.0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  // Circular star shader material
  const material = new THREE.PointsMaterial({
    size: 2,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  return points;
}
