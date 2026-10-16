import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SubsolarPoint, CityData, GlobeLayerSettings } from '../types';
import { createEarthTextures, createStarfield } from '../utils/earthTextures';
import { getSolarPosition, getSolarMilestones, getAnnualSolarAltitudeRange, splitSolarPath } from '../utils/solarCalculator';

import { sampleTour } from '../utils/globeTour';

interface SolarPickPayload {
  date: Date;
  name: string;
}

interface EarthGlobeProps {
  tour?: { progress: number; stops: CityData[]; reducedMotion: boolean } | null;
  currentDate: Date;
  subsolarPoint: SubsolarPoint;
  cities: CityData[];
  selectedCity: CityData | null;
  onSelectCity: (city: CityData | null) => void;
  onSelectDate?: (date: Date) => void;
  onOpenDetails?: () => void;
  layers: GlobeLayerSettings;
  onUpdateLayers?: (newLayers: Partial<GlobeLayerSettings>) => void;
  activeCameraPreset: string | null;
  onResetCameraPreset: () => void;
  onTriggerCameraPreset: (preset: string) => void;
}

export function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

// Custom Earth Shader Material for realistic day/night blending and terminator
function createEarthMaterial(
  dayMap: THREE.Texture,
  nightMap: THREE.Texture,
  specularMap: THREE.Texture,
  cloudsMap: THREE.Texture
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDayMap: { value: dayMap },
      uNightMap: { value: nightMap },
      uSpecularMap: { value: specularMap },
      uCloudsMap: { value: cloudsMap },
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      uCloudOffset: { value: 0.0 },
      uShowClouds: { value: 1.0 },
      uShowNightLights: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uDayMap;
      uniform sampler2D uNightMap;
      uniform sampler2D uSpecularMap;
      uniform sampler2D uCloudsMap;
      uniform vec3 uSunDirection;
      uniform float uCloudOffset;
      uniform float uShowClouds;
      uniform float uShowNightLights;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        // Base normal and sun direction in world space
        vec3 normal = normalize(vNormal);
        vec3 sunDir = normalize(uSunDirection);
        float NdotL = dot(normal, sunDir);

        // Sample textures
        vec4 dayTex = texture2D(uDayMap, vUv);
        vec4 nightTex = texture2D(uNightMap, vUv);
        vec4 specTex = texture2D(uSpecularMap, vUv);

        // Clouds with offset for independent drift
        vec2 cloudUv = vec2(fract(vUv.x + uCloudOffset), vUv.y);
        vec4 cloudTex = texture2D(uCloudsMap, cloudUv);
        float cloudAlpha = cloudTex.a * uShowClouds;

        // Smooth daylight/night terminator factor
        // Twilight occurs between NdotL ≈ -0.15 (civil/nautical twilight) and 0.15 (sunrise/sunset)
        float dayFactor = smoothstep(-0.12, 0.12, NdotL);
        float nightFactor = (1.0 - dayFactor) * uShowNightLights;

        // Warm twilight scattering glow along terminator (golden/amber edge)
        float twilightBand = exp(-pow(NdotL / 0.09, 2.0));
        vec3 twilightColor = vec3(1.0, 0.45, 0.18) * twilightBand * 0.45;

        // Direct sunlight lighting term
        float diffuse = max(0.04, NdotL);
        vec3 daySurface = dayTex.rgb * diffuse;

        // Specular highlight on oceans when facing sun
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 halfVec = normalize(sunDir + viewDir);
        float specFactor = pow(max(0.0, dot(normal, halfVec)), 28.0) * specTex.r * 0.8 * dayFactor;
        vec3 specularGlint = vec3(1.0, 0.95, 0.85) * specFactor;

        // Night side city lights
        vec3 nightSurface = nightTex.rgb * 1.7 * nightFactor;

        // Surface color without clouds
        vec3 surfaceColor = daySurface * dayFactor + nightSurface + twilightColor + specularGlint;

        // Blend clouds over surface (clouds are white on day side, dark silhouette on night side)
        vec3 cloudColor = vec3(1.0) * (dayFactor * 0.9 + 0.1);
        vec3 finalColor = mix(surfaceColor, cloudColor, cloudAlpha * 0.7);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

// Atmospheric Scattering Glow Rim Shader
function createAtmosphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = vec3(0.0, 0.0, 1.0); // Camera space view direction
        float rim = 1.0 - max(0.0, dot(normal, viewDir));
        float atmosphereIntensity = pow(rim, 3.2);

        // Direction towards sun for day/night halo shading
        vec3 sunDir = normalize(uSunDirection);
        float sunFacing = dot(normal, sunDir) * 0.5 + 0.5;

        vec3 daySky = vec3(0.35, 0.65, 1.0);
        vec3 sunsetSky = vec3(1.0, 0.5, 0.2);
        vec3 skyColor = mix(sunsetSky, daySky, clamp(sunFacing * 1.5, 0.0, 1.0));

        gl_FragColor = vec4(skyColor, atmosphereIntensity * 0.75 * (sunFacing * 0.8 + 0.2));
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// Dispose transient annotations before rebuilding them during playback.
function clearAnnotationGroup(group: THREE.Group) {
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
      // Sprite geometry is shared by Three.js; only meshes and lines own theirs.
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
        material.dispose();
      }
    }
  });
  group.clear();
}

// Measure before allocating the texture so long captions retain their full text.
function createLabelSprite(
  text: string,
  color: string = '#fde047',
  bg: string = 'rgba(15, 23, 42, 0.85)',
  height: number = 1.625,
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = 'bold 36px "JetBrains Mono", monospace, sans-serif';
  const padding = 24;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textWidth = Math.max(metrics.width,
    (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0));
  canvas.width = Math.ceil(textWidth + padding * 2);
  canvas.height = 96;

  // Resizing a canvas resets its context, including the font.
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 18);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(height * canvas.width / canvas.height, height, 1);
  return sprite;
}

export const EarthGlobe: React.FC<EarthGlobeProps> = ({
  tour = null,
  currentDate,
  subsolarPoint,
  cities,
  selectedCity,
  onSelectCity,
  onSelectDate,
  onOpenDetails,
  layers,
  onUpdateLayers,
  activeCameraPreset,
  onResetCameraPreset,
  onTriggerCameraPreset,
}) => {
  const tourRef = useRef(tour);
  tourRef.current = tour;
  const trajectoryPicksRef = useRef(new Map<THREE.Object3D, SolarPickPayload>());
  const activePointersRef = useRef(new Set<number>());
  const tapStartRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const earthMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const atmosphereMeshRef = useRef<THREE.Mesh | null>(null);
  const atmosphereMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const subsolarMarkerRef = useRef<THREE.Group | null>(null);
  const sunBeamRef = useRef<THREE.Line | null>(null);
  const terminatorLineRef = useRef<THREE.LineLoop | null>(null);
  const twilightLinesGroupRef = useRef<THREE.Group | null>(null);
  const sunTrajectoryGroupRef = useRef<THREE.Group | null>(null);
  const subsolarLatitudeRingRef = useRef<THREE.Line | null>(null);
  const citiesGroupRef = useRef<THREE.Group | null>(null);
  const graticuleGroupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const EARTH_RADIUS = 50;

  // Initialize Three.js scene once
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#030712');
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(0, 30, 140);
    cameraRef.current = camera;

    // 3. Renderer
    const isHeadless = navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);
    const renderer = new THREE.WebGLRenderer({ antialias: !isHeadless, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    rendererRef.current = renderer;

    container.replaceChildren(renderer.domElement);

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 65;
    controls.maxDistance = 450;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.0;
    controlsRef.current = controls;

    // 5. Starfield Deep Space Background
    const starfield = createStarfield();
    scene.add(starfield);

    // 6. Procedural Earth Textures
    const textures = createEarthTextures();

    // 7. Earth Sphere
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 96, 64);
    const earthMaterial = createEarthMaterial(
      textures.dayMap,
      textures.nightMap,
      textures.specularMap,
      textures.cloudMap
    );
    earthMatRef.current = earthMaterial;
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    earthMeshRef.current = earthMesh;
    scene.add(earthMesh);

    // 7b. Sun Trajectory Sky Dome Overlay Group
    const sunTrajectoryGroup = new THREE.Group();
    sunTrajectoryGroupRef.current = sunTrajectoryGroup;
    scene.add(sunTrajectoryGroup);

    // 7c. Subsolar Latitude Parallel Ring (daily latitude of the sun)
    const subsolarLatGeo = new THREE.BufferGeometry();
    const subLatPts: THREE.Vector3[…4947 tokens truncated…milestone.name} ${path.maxElev.toFixed(1)}°`, milestone.color, undefined, 1.375);
        label.position.copy(path.maxElevPt.clone().addScaledVector(up, 1.8));
        group.add(label);
      }
    }

    // 6. Draw Today's Daylight Arc (Prominent Thick Glowing Golden Ribbon)
    for (const points of todayPath.daySegments) {
      const dayCurve = new THREE.CatmullRomCurve3(points, false);
      const tubeGeo = new THREE.TubeGeometry(dayCurve, 64, 0.28, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      group.add(tubeMesh);

      // Soft outer glow tube
      const glowTubeGeo = new THREE.TubeGeometry(dayCurve, 48, 0.65, 8, false);
      const glowTubeMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      });
      group.add(new THREE.Mesh(glowTubeGeo, glowTubeMat));
    }

    // Draw Today's Night Arc
    for (const points of todayPath.nightSegments) {
      const nightGeo = new THREE.BufferGeometry().setFromPoints(points);
      const nightMat = new THREE.LineDashedMaterial({
        color: 0x818cf8,
        dashSize: 1.2,
        gapSize: 0.8,
        transparent: true,
        opacity: 0.5,
      });
      const nightLine = new THREE.Line(nightGeo, nightMat);
      nightLine.computeLineDistances();
      group.add(nightLine);
    }

    // 7. Today's Solar Noon Culmination Apex Marker & Label
    if (todayPath.maxElev > -90) {
      const apexGeo = new THREE.SphereGeometry(0.7, 16, 16);
      const apexMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const apexMesh = new THREE.Mesh(apexGeo, apexMat);
      apexMesh.position.copy(todayPath.maxElevPt);
      group.add(apexMesh);

      addPickTarget(todayPath.maxElevPt, { date: todayPath.maxElevDate, name: "Today's Solar Noon" });

      const dropGeo = new THREE.BufferGeometry().setFromPoints([pObs, todayPath.maxElevPt]);
      const dropMat = new THREE.LineDashedMaterial({
        color: 0xfbbf24,
        dashSize: 0.8,
        gapSize: 0.6,
        transparent: true,
        opacity: 0.6,
      });
      const dropLine = new THREE.Line(dropGeo, dropMat);
      dropLine.computeLineDistances();
      group.add(dropLine);

      const noonTimeStr = todayPath.maxElevDate.toLocaleTimeString('en-US', {
        timeZone: selectedCity.timezone,
        hour: '2-digit',
        minute: '2-digit',
      });
      const apexLabel = createLabelSprite(`📍 Today's Noon ${todayPath.maxElev.toFixed(1)}° (${noonTimeStr})`, '#fde047');
      apexLabel.position.copy(todayPath.maxElevPt.clone().addScaledVector(up, 2.5));
      group.add(apexLabel);
    }

    // 8. Today's Sunrise & Sunset Markers
    if (todayPath.sunrisePt) {
      const rMesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
      rMesh.position.copy(todayPath.sunrisePt);
      group.add(rMesh);

      const rLabel = createLabelSprite('🌅 Sunrise', '#fb923c');
      rLabel.position.copy(todayPath.sunrisePt.clone().addScaledVector(up, 2.0));
      group.add(rLabel);
    }

    if (todayPath.sunsetPt) {
      const sMesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      sMesh.position.copy(todayPath.sunsetPt);
      group.add(sMesh);

      const sLabel = createLabelSprite('🌇 Sunset', '#f87171');
      sLabel.position.copy(todayPath.sunsetPt.clone().addScaledVector(up, 2.0));
      group.add(sLabel);
    }

    // 9. Current Instantaneous Sun Position Bead & Sightline
    const curPos = getSolarPosition(selectedCity.lat, selectedCity.lng, currentDate);
    const curElRad = curPos.elevation * (Math.PI / 180);
    const curAzRad = curPos.azimuth * (Math.PI / 180);

    const curDir = new THREE.Vector3()
      .addScaledVector(north, Math.cos(curElRad) * Math.cos(curAzRad))
      .addScaledVector(east, Math.cos(curElRad) * Math.sin(curAzRad))
      .addScaledVector(up, Math.sin(curElRad));

    const curSunPos = pObs.clone().addScaledVector(curDir, R_DOME);

    // Glowing Sun Bead
    const sunBeadGroup = new THREE.Group();
    sunBeadGroup.position.copy(curSunPos);
    sunBeadGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    sunBeadGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 16), new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.65 })));
    group.add(sunBeadGroup);

    // Sightline Ray from Observer to Current Sun
    const sightlineGeo = new THREE.BufferGeometry().setFromPoints([pObs, curSunPos]);
    const sightlineMat = new THREE.LineBasicMaterial({ color: 0xffea00, linewidth: 2, transparent: true, opacity: 0.85 });
    group.add(new THREE.Line(sightlineGeo, sightlineMat));

    // Projection on Horizon Plane
    const horizProjection = pObs.clone()
      .addScaledVector(north, Math.cos(curElRad) * Math.cos(curAzRad) * R_DOME)
      .addScaledVector(east, Math.cos(curElRad) * Math.sin(curAzRad) * R_DOME);

    const altDropGeo = new THREE.BufferGeometry().setFromPoints([curSunPos, horizProjection]);
    const altDropMat = new THREE.LineDashedMaterial({ color: 0x38bdf8, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.7 });
    const altDropLine = new THREE.Line(altDropGeo, altDropMat);
    altDropLine.computeLineDistances();
    group.add(altDropLine);

    // Current Sun Altitude Label
    const curSunLabel = createLabelSprite(
      `☉ Sun Alt: ${curPos.elevation.toFixed(1)}° (${curPos.phaseLabel})`,
      curPos.elevation >= 0 ? '#fde047' : '#818cf8',
      'rgba(15, 23, 42, 0.9)'
    );
    curSunLabel.position.copy(curSunPos.clone().addScaledVector(up, 2.2));
    group.add(curSunLabel);

  }, [selectedCity, currentDate, layers.showSunTrajectory, layers.showSeasonalPaths]);

  // Update Layer Toggles
  useEffect(() => {
    if (atmosphereMeshRef.current) {
      atmosphereMeshRef.current.visible = layers.showAtmosphere;
    }
    if (earthMatRef.current) {
      earthMatRef.current.uniforms.uShowClouds.value = layers.showClouds ? layers.cloudOpacity : 0.0;
      earthMatRef.current.uniforms.uShowNightLights.value = layers.showNightLights ? 1.0 : 0.0;
    }
    if (terminatorLineRef.current) {
      terminatorLineRef.current.visible = layers.showTerminator;
    }
    if (twilightLinesGroupRef.current) {
      twilightLinesGroupRef.current.visible = layers.showTwilightBands;
    }
    if (subsolarMarkerRef.current) {
      subsolarMarkerRef.current.visible = layers.showSubsolarPoint;
    }
    if (sunBeamRef.current) {
      sunBeamRef.current.visible = layers.showSunRays && layers.showSubsolarPoint;
    }
    if (subsolarLatitudeRingRef.current) {
      subsolarLatitudeRingRef.current.visible = layers.showSubsolarPoint;
    }
    if (sunTrajectoryGroupRef.current) {
      sunTrajectoryGroupRef.current.visible = layers.showSunTrajectory && selectedCity !== null;
    }
    if (graticuleGroupRef.current) {
      graticuleGroupRef.current.visible = layers.showGraticule;
    }
    if (citiesGroupRef.current) {
      citiesGroupRef.current.visible = layers.showCities;
    }
    if (controlsRef.current) {
      controlsRef.current.autoRotate = layers.autoRotate;
      controlsRef.current.autoRotateSpeed = layers.rotationSpeed;
    }
  }, [layers, selectedCity]);

  // Render City Markers in 3D
  useEffect(() => {
    const group = citiesGroupRef.current;
    if (!group) return;

    clearAnnotationGroup(group);

    cities.forEach((city) => {
      const pos = latLngToVector3(city.lat, city.lng, EARTH_RADIUS + 0.2);
      const isSelected = selectedCity?.id === city.id;

      const cityObj = new THREE.Group();
      cityObj.position.copy(pos);
      cityObj.userData = { city };

      const pinColor = isSelected ? 0xef4444 : 0x38bdf8;
      const dotGeo = new THREE.SphereGeometry(isSelected ? 0.9 : 0.5, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({ color: pinColor });
      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      cityObj.add(dotMesh);

      const stemGeo = new THREE.CylinderGeometry(0.1, 0.1, isSelected ? 3.5 : 2.0, 8);
      stemGeo.translate(0, isSelected ? 1.75 : 1.0, 0);
      const stemMat = new THREE.MeshBasicMaterial({ color: pinColor });
      const stemMesh = new THREE.Mesh(stemGeo, stemMat);
      stemMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
      cityObj.add(stemMesh);

      group.add(cityObj);
    });
  }, [cities, selectedCity]);

  // Handle Raycasting for City Clicks and Direct Earth Clicks
  const handlePick = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!mountRef.current || !cameraRef.current || !citiesGroupRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      // Only registered hit spheres can select a milestone; decorative geometry is ignored.
      if (sunTrajectoryGroupRef.current?.visible && onSelectDate) {
        const hits = raycaster.intersectObjects([...trajectoryPicksRef.current.keys()], false);
        const payload = hits.length ? trajectoryPicksRef.current.get(hits[0].object) : undefined;
        if (payload) {
          onSelectDate(new Date(payload.date));
          return;
        }
      }

      // Check city markers
      const cityIntersects = raycaster.intersectObjects(citiesGroupRef.current.children, true);
      if (cityIntersects.length > 0) {
        let parent: THREE.Object3D | null = cityIntersects[0].object;
        while (parent && !parent.userData.city && parent !== citiesGroupRef.current) {
          parent = parent.parent;
        }
        if (parent && parent.userData.city) {
          onSelectCity(parent.userData.city as CityData);
          return;
        }
      }

      // If no city marker clicked, check if clicked on Earth surface to place a custom location
      if (earthMeshRef.current) {
        const earthIntersects = raycaster.intersectObject(earthMeshRef.current);
        if (earthIntersects.length > 0) {
          const pt = earthIntersects[0].point;
          const r = pt.length();
          const phi = Math.acos(Math.max(-1, Math.min(1, pt.y / r)));
          const lat = 90 - phi * (180 / Math.PI);
          const theta = Math.atan2(pt.z, -pt.x);
          let lng = theta * (180 / Math.PI) - 180;
          while (lng < -180) lng += 360;
          while (lng > 180) lng -= 360;

          const customLocation: CityData = {
            id: `loc-${lat.toFixed(1)}-${lng.toFixed(1)}`,
            name: `Observation Point`,
            country: `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`,
            lat,
            lng,
            timezone: 'UTC',
          };
          onSelectCity(customLocation);
        }
      }
    },
    [onSelectCity, onSelectDate]
  );

  // Smooth Camera Presets
  useEffect(() => {
    if (tour || !activeCameraPreset || !cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (activeCameraPreset === 'solar-view') {
      const sunDir = latLngToVector3(subsolarPoint.lat, subsolarPoint.lng, 1).normalize();
      const targetPos = sunDir.clone().multiplyScalar(140);
      camera.position.set(targetPos.x, targetPos.y, targetPos.z);
      controls.target.set(0, 0, 0);
    } else if (activeCameraPreset === 'north-pole') {
      camera.position.set(0, 145, 1);
      controls.target.set(0, 0, 0);
    } else if (activeCameraPreset === 'south-pole') {
      camera.position.set(0, -145, 1);
      controls.target.set(0, 0, 0);
    } else if (activeCameraPreset === 'equator-view') {
      camera.position.set(135, 15, 0);
      controls.target.set(0, 0, 0);
    } else if ((activeCameraPreset === 'focus-city' || activeCameraPreset === 'focus-trajectory') && selectedCity) {
      // Position camera at a scenic angle above the location to inspect the full sky dome
      const cityDir = latLngToVector3(selectedCity.lat, selectedCity.lng, 1).normalize();
      const pObs = cityDir.clone().multiplyScalar(EARTH_RADIUS);
      
      if (activeCameraPreset === 'focus-trajectory') {
        // Offset slightly southward/upward so the entire sky dome and diurnal arc are framed
        const camPos = pObs.clone().multiplyScalar(1.4).add(new THREE.Vector3(0, 8, 8));
        camera.position.copy(camPos);
        controls.target.copy(pObs);
      } else {
        let distance = 110;
        if (window.matchMedia('(max-width: 1023px)').matches) {
          const verticalHalfFov = camera.fov * Math.PI / 360;
          const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
          const visibleFraction = Math.max(0.4, (window.innerHeight - 180) / window.innerHeight);
          distance = Math.max(distance,
            EARTH_RADIUS / Math.sin(horizontalHalfFov) * 1.1,
            EARTH_RADIUS / Math.sin(verticalHalfFov) * 1.1 / visibleFraction);
        }
        const targetPos = cityDir.clone().multiplyScalar(distance);
        camera.position.set(targetPos.x, targetPos.y, targetPos.z);
        controls.target.set(0, 0, 0);
      }
    }

    controls.update();
    onResetCameraPreset();
  }, [tour, activeCameraPreset, subsolarPoint, selectedCity, onResetCameraPreset]);

  // Compute selected city's current solar data
  const citySolar = selectedCity ? getSolarPosition(selectedCity.lat, selectedCity.lng, currentDate) : null;

  const seasonalMetrics = useMemo(() => {
    if (!selectedCity) return [];
    return getSolarMilestones(solarYear).map(milestone => {
      const midnight = new Date(milestone.date);
      midnight.setUTCHours(0, 0, 0, 0);
      let peak = -90;
      let peakDate = milestone.date;
      for (let i = 0; i <= 72; i++) {
        const date = new Date(midnight.getTime() + i * 1200000);
        const elevation = getSolarPosition(selectedCity.lat, selectedCity.lng, date).elevation;
        if (elevation > peak) { peak = elevation; peakDate = date; }
      }
      return { ...milestone, peak, peakDate };
    });
  }, [selectedCity, solarYear]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-950">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        data-testid="globe-viewport"
        onPointerDown={event => {
          activePointersRef.current.add(event.pointerId);
          tapStartRef.current = activePointersRef.current.size === 1
            ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
        }}
        onPointerMove={event => {
          const start = tapStartRef.current;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) tapStartRef.current = null;
        }}
        onPointerUp={event => {
          const start = tapStartRef.current;
          activePointersRef.current.delete(event.pointerId);
          tapStartRef.current = null;
          if (start?.id === event.pointerId && activePointersRef.current.size === 0 &&
              Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 8) handlePick(event);
        }}
        onPointerCancel={event => {
          activePointersRef.current.delete(event.pointerId);
          tapStartRef.current = null;
        }}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Selected Location / City Floating Panel with Interactive 3D Sun Path & Seasonal Controls */}
      {selectedCity && citySolar && (
        <div data-testid="desktop-city-panel" style={tour ? { display: 'none' } : undefined} className="hidden lg:block absolute top-20 right-6 z-20 pointer-events-auto bg-slate-900/92 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-white w-80 max-w-[calc(100vw-3rem)] max-h-[calc(100vh-15rem)] sm:max-h-[calc(100vh-6rem)] overflow-y-auto transition-all">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-2.5">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                <h3 className="font-semibold text-base text-sky-400 truncate">{selectedCity.name}</h3>
              </div>
              <p className="text-xs text-slate-400">{selectedCity.country}</p>
            </div>
            <button
              onClick={() => onSelectCity(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-sm font-mono cursor-pointer transition-colors"
              title="Close panel"
            >
              ✕
            </button>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-800">
            <div>
              <span className="text-slate-400 block text-[11px]">Coordinates</span>
              <span className="font-mono text-slate-200">
                {Math.abs(selectedCity.lat).toFixed(1)}°{selectedCity.lat >= 0 ? 'N' : 'S'},{' '}
                {Math.abs(selectedCity.lng).toFixed(1)}°{selectedCity.lng >= 0 ? 'E' : 'W'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Lighting Phase</span>
              <span className={`font-semibold inline-flex items-center gap-1 ${
                citySolar.phase === 'day' ? 'text-amber-400' :
                citySolar.phase === 'golden-hour' ? 'text-orange-400' :
                citySolar.phase.includes('twilight') ? 'text-sky-400' : 'text-indigo-300'
              }`}>
                {citySolar.phaseLabel}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Solar Elevation</span>
              <span className="font-mono font-medium text-amber-400 font-bold">
                {citySolar.elevation.toFixed(1)}°
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Solar Azimuth</span>
              <span className="font-mono font-medium text-slate-200">
                {citySolar.azimuth.toFixed(1)}°
              </span>
            </div>
          </div>

          {/* Interactive Seasonal Sun Path Comparison Section */}
          {seasonalMetrics.length > 0 && (
            <div className="mt-3 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-300 flex items-center gap-1">
                  <span>☀️</span> Seasonal Sun Paths
                </span>
                {onUpdateLayers && (
                  <button
                    onClick={() => onUpdateLayers({ showSeasonalPaths: !layers.showSeasonalPaths })}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      layers.showSeasonalPaths
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                    title="Toggle solstice and equinox trajectory arcs on the 3D globe"
                  >
                    {layers.showSeasonalPaths ? 'Visible' : 'Hidden'}
                  </button>
                )}
              </div>

              <div className="space-y-1.5 text-[11px]">
                {seasonalMetrics.map(milestone => (
                  <div key={milestone.id} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/50 border border-slate-700">
                    <div style={{ color: milestone.color }}>
                      <span className="font-semibold block">{milestone.name}</span>
                      <span className="text-[10px] font-mono">{milestone.month + 1}/{milestone.day}</span>
                    </div>
                    <div className="flex items-center gap-2" style={{ color: milestone.color }}>
                      <span className="font-mono font-bold">{milestone.peak.toFixed(1)}°</span>
                      {onSelectDate && <button onClick={() => onSelectDate(milestone.peakDate)}
                        className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 cursor-pointer"
                        title={`Jump to ${milestone.name}`}>Jump →</button>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Seasonal Range Altitude Swing Badge */}
              <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-300 font-mono">
                <span>Annual Altitude Range:</span>
                <span className="text-amber-400 font-bold bg-amber-500/15 px-1.5 py-0.5 rounded">
                  Δ {(annualRange?.range ?? 0).toFixed(1)}° Swing
                </span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => onTriggerCameraPreset('focus-trajectory')}
              className="py-1.5 px-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="View full diurnal & seasonal sky dome in 3D"
            >
              <span>☀️</span> 3D Sky Dome
            </button>
            <button
              onClick={() => onOpenDetails && onOpenDetails()}
              className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Open full 24-hour solar trajectory altitude chart and twilight times"
            >
              <span>📊</span> Trajectory Chart
            </button>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>Click 3D apexes to jump seasons</span>
            <span className="text-sky-400 font-mono">
              {currentDate.toLocaleTimeString('en-US', { timeZone: selectedCity.timezone, hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

