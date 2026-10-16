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
  const isTour = !!tour;
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
    const subLatPts: THREE.Vector3[] = [];
    for (let lon = -180; lon <= 180; lon += 3) {
      subLatPts.push(latLngToVector3(0, lon, EARTH_RADIUS + 0.15));
    }
    subsolarLatGeo.setFromPoints(subLatPts);
    const subsolarLatMat = new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 2,
      gapSize: 2,
      transparent: true,
      opacity: 0.7,
    });
    const subsolarLatRing = new THREE.Line(subsolarLatGeo, subsolarLatMat);
    subsolarLatRing.computeLineDistances();
    subsolarLatitudeRingRef.current = subsolarLatRing;
    scene.add(subsolarLatRing);

    // 8. Atmospheric Halo Shell
    const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.15, 64, 48);
    const atmosphereMaterial = createAtmosphereMaterial();
    atmosphereMatRef.current = atmosphereMaterial;
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    atmosphereMeshRef.current = atmosphereMesh;
    scene.add(atmosphereMesh);

    // 9. Subsolar Point Marker (Solar Zenith Beacon)
    const subsolarGroup = new THREE.Group();
    // Inner pulse ring
    const ringGeo = new THREE.RingGeometry(1.2, 1.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    subsolarGroup.add(ringMesh);

    // Center bright dot
    const dotGeo = new THREE.SphereGeometry(0.8, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
    subsolarGroup.add(dotMesh);

    // Zenith normal light ray pointer
    const rayGeo = new THREE.CylinderGeometry(0.15, 0.4, 18, 16);
    rayGeo.translate(0, 9, 0);
    const rayMat = new THREE.MeshBasicMaterial({ color: 0xffea00, transparent: true, opacity: 0.85 });
    const rayMesh = new THREE.Mesh(rayGeo, rayMat);
    rayMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
    subsolarGroup.add(rayMesh);

    subsolarMarkerRef.current = subsolarGroup;
    scene.add(subsolarGroup);

    // Sun incoming radiation line (from deep space to subsolar point)
    const beamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 120),
    ]);
    const beamMat = new THREE.LineDashedMaterial({
      color: 0xffdd44,
      dashSize: 3,
      gapSize: 2,
      transparent: true,
      opacity: 0.7,
    });
    const sunBeam = new THREE.Line(beamGeo, beamMat);
    sunBeam.computeLineDistances();
    sunBeamRef.current = sunBeam;
    scene.add(sunBeam);

    // 10. Terminator Line (Great Circle separating Day and Night)
    const terminatorGeo = new THREE.BufferGeometry();
    const termPoints: THREE.Vector3[] = [];
    const NUM_TERM_STEPS = 180;
    for (let i = 0; i <= NUM_TERM_STEPS; i++) {
      termPoints.push(new THREE.Vector3());
    }
    terminatorGeo.setFromPoints(termPoints);
    const terminatorMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
    });
    const terminatorLine = new THREE.LineLoop(terminatorGeo, terminatorMat);
    terminatorLineRef.current = terminatorLine;
    scene.add(terminatorLine);

    // 11. Twilight Bands Group (Civil -6°, Nautical -12°, Astronomical -18°)
    const twilightGroup = new THREE.Group();
    const twilightColors = [0x60a5fa, 0x818cf8, 0xa78bfa];
    for (let t = 0; t < 3; t++) {
      const twGeo = new THREE.BufferGeometry();
      const twPts: THREE.Vector3[] = [];
      for (let i = 0; i <= NUM_TERM_STEPS; i++) twPts.push(new THREE.Vector3());
      twGeo.setFromPoints(twPts);
      const twMat = new THREE.LineLoop(
        twGeo,
        new THREE.LineBasicMaterial({
          color: twilightColors[t],
          transparent: true,
          opacity: 0.5 - t * 0.12,
        })
      );
      twilightGroup.add(twMat);
    }
    twilightLinesGroupRef.current = twilightGroup;
    scene.add(twilightGroup);

    // 12. Cities 3D Markers Group
    const citiesGroup = new THREE.Group();
    citiesGroupRef.current = citiesGroup;
    scene.add(citiesGroup);

    // 13. Graticule Lat/Lon Wireframe Group
    const graticuleGroup = new THREE.Group();
    const graticuleMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 });
    
    // Parallels every 30 degrees + Tropics and Polar circles
    const parallels = [-66.56, -60, -30, -23.44, 0, 23.44, 30, 60, 66.56];
    parallels.forEach((lat) => {
      const pGeo = new THREE.BufferGeometry();
      const pts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 5) {
        pts.push(latLngToVector3(lat, lon, EARTH_RADIUS + 0.1));
      }
      pGeo.setFromPoints(pts);
      const isSpecial = Math.abs(lat) === 23.44 || Math.abs(lat) === 66.56 || lat === 0;
      const mat = isSpecial
        ? new THREE.LineBasicMaterial({
            color: lat === 0 ? 0x22c55e : 0xf59e0b,
            transparent: true,
            opacity: 0.25,
          })
        : graticuleMat;
      graticuleGroup.add(new THREE.Line(pGeo, mat));
    });

    // Meridians every 30 degrees
    for (let lon = -180; lon < 180; lon += 30) {
      const mGeo = new THREE.BufferGeometry();
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 3) {
        pts.push(latLngToVector3(lat, lon, EARTH_RADIUS + 0.1));
      }
      mGeo.setFromPoints(pts);
      const mat = lon === 0
        ? new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.35 })
        : graticuleMat;
      graticuleGroup.add(new THREE.Line(mGeo, mat));
    }
    graticuleGroupRef.current = graticuleGroup;
    scene.add(graticuleGroup);

    // Resize handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Pre-warm renderer shaders
    renderer.compile(scene, camera);

    // Animation Loop
    let lastTime = performance.now();
    let cloudOffset = 0;

    const animate = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      // Drift clouds slowly
      cloudOffset += delta * 0.002;
      if (earthMatRef.current) {
        earthMatRef.current.uniforms.uCloudOffset.value = cloudOffset;
      }

      const tourState = tourRef.current;
      controls.enabled = !tourState;
      if (tourState) {
        const point = sampleTour(tourState.progress, tourState.stops, tourState.reducedMotion);
        const halfFov = Math.min(camera.fov * Math.PI / 360, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
        const radius = Math.max(point.radius, 50 / Math.sin(halfFov) * 1.3);
        camera.position.copy(latLngToVector3(point.lat, point.lng, radius));
        controls.target.set(0, 0, 0);
        camera.lookAt(0, 0, 0);
      } else controls.update();
      renderer.render(scene, camera);
      animFrameIdRef.current = requestAnimationFrame(animate);
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      clearAnnotationGroup(sunTrajectoryGroup);
      clearAnnotationGroup(citiesGroup);
      trajectoryPicksRef.current.clear();
      renderer.dispose();
      textures.dayMap.dispose();
      textures.nightMap.dispose();
      textures.specularMap.dispose();
      textures.cloudMap.dispose();
      earthGeometry.dispose();
      atmosphereGeometry.dispose();
    };
  }, []);

  // Update Sun Direction & Subsolar Marker whenever subsolarPoint changes
  useEffect(() => {
    if (!subsolarPoint || !sceneRef.current) return;

    // Subsolar vector in world space
    const sunPos = latLngToVector3(subsolarPoint.lat, subsolarPoint.lng, EARTH_RADIUS);
    const sunDirection = sunPos.clone().normalize();

    // 1. Update Earth Shader Sun Direction
    if (earthMatRef.current) {
      earthMatRef.current.uniforms.uSunDirection.value.copy(sunDirection);
    }
    if (atmosphereMatRef.current) {
      atmosphereMatRef.current.uniforms.uSunDirection.value.copy(sunDirection);
    }

    // 2. Position Subsolar Beacon on Earth surface
    if (subsolarMarkerRef.current) {
      subsolarMarkerRef.current.position.copy(sunPos);
      subsolarMarkerRef.current.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        sunDirection
      );
    }

    // 3. Update incoming Sun Beam
    if (sunBeamRef.current) {
      const farSunPoint = sunDirection.clone().multiplyScalar(EARTH_RADIUS * 2.8);
      const points = [sunPos.clone().multiplyScalar(1.02), farSunPoint];
      sunBeamRef.current.geometry.setFromPoints(points);
      sunBeamRef.current.computeLineDistances();
    }

    // 4. Update 3D Terminator Great Circle
    // The terminator is a great circle 90 degrees away from the subsolar vector
    if (terminatorLineRef.current) {
      // Find two orthogonal basis vectors perpendicular to sunDirection
      const arb = Math.abs(sunDirection.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const u = new THREE.Vector3().crossVectors(sunDirection, arb).normalize();
      const v = new THREE.Vector3().crossVectors(sunDirection, u).normalize();

      const termPts: THREE.Vector3[] = [];
      const steps = 180;
      const termRadius = EARTH_RADIUS + 0.15;

      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        // Point on terminator great circle
        const p = new THREE.Vector3()
          .addScaledVector(u, Math.cos(angle))
          .addScaledVector(v, Math.sin(angle))
          .multiplyScalar(termRadius);
        termPts.push(p);
      }
      terminatorLineRef.current.geometry.setFromPoints(termPts);
    }

    // 5. Update Twilight Circles (Civil: 96°, Nautical: 102°, Astronomical: 108°)
    if (twilightLinesGroupRef.current) {
      const arb = Math.abs(sunDirection.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const u = new THREE.Vector3().crossVectors(sunDirection, arb).normalize();
      const v = new THREE.Vector3().crossVectors(sunDirection, u).normalize();
      const steps = 180;

      const twilightAngles = [96 * (Math.PI / 180), 102 * (Math.PI / 180), 108 * (Math.PI / 180)];
      twilightLinesGroupRef.current.children.forEach((child, idx) => {
        const line = child as THREE.LineLoop;
        const theta = twilightAngles[idx];
        const ringRadius = EARTH_RADIUS * Math.sin(theta);
        const ringDistance = EARTH_RADIUS * Math.cos(theta);
        const pts: THREE.Vector3[] = [];

        for (let i = 0; i <= steps; i++) {
          const angle = (i / steps) * Math.PI * 2;
          const p = sunDirection.clone().multiplyScalar(ringDistance)
            .addScaledVector(u, Math.cos(angle) * ringRadius)
            .addScaledVector(v, Math.sin(angle) * ringRadius);
          p.normalize().multiplyScalar(EARTH_RADIUS + 0.12 + idx * 0.05);
          pts.push(p);
        }
        line.geometry.setFromPoints(pts);
      });
    }

    // 6. Update Subsolar Latitude Parallel Ring (Daily Path of Zenith Sun)
    if (subsolarLatitudeRingRef.current) {
      const subLatPts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 2) {
        subLatPts.push(latLngToVector3(subsolarPoint.declination, lon, EARTH_RADIUS + 0.15));
      }
      subsolarLatitudeRingRef.current.geometry.setFromPoints(subLatPts);
      subsolarLatitudeRingRef.current.computeLineDistances();
    }
  }, [subsolarPoint]);

  // Build / Update 3D Sun Trajectory Across The Sky Overlay for Selected Location
  const solarYear = currentDate.getUTCFullYear();
  const observerLatitude = selectedCity?.lat;
  const annualRange = useMemo(() => observerLatitude === undefined ? null :
    getAnnualSolarAltitudeRange(observerLatitude, solarYear), [observerLatitude, solarYear]);

  useEffect(() => {
    const group = sunTrajectoryGroupRef.current;
    if (!group) return;

    trajectoryPicksRef.current.clear();

    // Clear previous trajectory objects
    clearAnnotationGroup(group);

    if (!selectedCity || !layers.showSunTrajectory) {
      group.visible = false;
      return;
    }

    group.visible = true;

    const addPickTarget = (position: THREE.Vector3, payload: SolarPickPayload) => {
      const target = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false }));
      target.position.copy(position);
      group.add(target);
      trajectoryPicksRef.current.set(target, payload);
    };

    // 1. Observer position on Earth surface
    const pObs = latLngToVector3(selectedCity.lat, selectedCity.lng, EARTH_RADIUS + 0.08);

    // 2. Local Orthonormal Basis at Observer Location
    const up = pObs.clone().normalize();
    const worldAxis = Math.abs(up.y) < 0.999 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, -1);
    const northUnnorm = worldAxis.clone().sub(up.clone().multiplyScalar(worldAxis.dot(up)));
    const north = northUnnorm.normalize();
    const east = new THREE.Vector3().crossVectors(north, up).normalize();

    // Local Sky Dome Radius
    const R_DOME = 15.0;

    // 3. Local Horizon Plane Disc & Ring
    const horizonPts: THREE.Vector3[] = [];
    const NUM_HORIZ_STEPS = 96;
    for (let i = 0; i <= NUM_HORIZ_STEPS; i++) {
      const angle = (i / NUM_HORIZ_STEPS) * Math.PI * 2;
      const hPt = pObs.clone()
        .addScaledVector(north, Math.cos(angle) * R_DOME)
        .addScaledVector(east, Math.sin(angle) * R_DOME);
      horizonPts.push(hPt);
    }

    const horizonLineGeo = new THREE.BufferGeometry().setFromPoints(horizonPts);
    const horizonLineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    group.add(new THREE.LineLoop(horizonLineGeo, horizonLineMat));

    // Semi-transparent Horizon Disk
    const diskGeo = new THREE.CircleGeometry(R_DOME, 48);
    const diskMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const diskMesh = new THREE.Mesh(diskGeo, diskMat);
    diskMesh.position.copy(pObs);
    // Align circle normal (Z) with up
    diskMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    group.add(diskMesh);

    // Cardinal Direction Ticks (N, E, S, W)
    const cardinalDirs = [
      { dir: north, label: 'N', color: '#38bdf8' },
      { dir: east, label: 'E', color: '#f59e0b' },
      { dir: north.clone().negate(), label: 'S', color: '#94a3b8' },
      { dir: east.clone().negate(), label: 'W', color: '#f59e0b' },
    ];

    cardinalDirs.forEach(({ dir, label, color }) => {
      const tickStart = pObs.clone().addScaledVector(dir, R_DOME * 0.92);
      const tickEnd = pObs.clone().addScaledVector(dir, R_DOME * 1.05);
      const tickGeo = new THREE.BufferGeometry().setFromPoints([tickStart, tickEnd]);
      const tickMat = new THREE.LineBasicMaterial({ color: new THREE.Color(color) });
      group.add(new THREE.Line(tickGeo, tickMat));

      const sprite = createLabelSprite(label, color, 'rgba(15, 23, 42, 0.6)', 1.4);
      sprite.position.copy(pObs.clone().addScaledVector(dir, R_DOME * 1.15));
      group.add(sprite);
    });

    // 4. Diurnal Sun Path Generator
    const computeDiurnalPath = (date: Date, numSamples = 72) => {
      const allPts: { pt: THREE.Vector3; elev: number; az: number; date: Date }[] = [];

      const bDate = new Date(date);
      bDate.setUTCHours(0, 0, 0, 0);

      let maxElev = -90;
      let maxElevPt = pObs.clone();
      let maxElevDate = date;

      for (let i = 0; i <= numSamples; i++) {
        const sampleTime = new Date(bDate.getTime() + (i / numSamples) * 86400000);
        const pos = getSolarPosition(selectedCity.lat, selectedCity.lng, sampleTime);
        const elRad = pos.elevation * (Math.PI / 180);
        const azRad = pos.azimuth * (Math.PI / 180);

        const localDir = new THREE.Vector3()
          .addScaledVector(north, Math.cos(elRad) * Math.cos(azRad))
          .addScaledVector(east, Math.cos(elRad) * Math.sin(azRad))
          .addScaledVector(up, Math.sin(elRad));

        const pt = pObs.clone().addScaledVector(localDir, R_DOME);
        allPts.push({ pt, elev: pos.elevation, az: pos.azimuth, date: sampleTime });

        if (pos.elevation > maxElev) {
          maxElev = pos.elevation;
          maxElevPt = pt;
          maxElevDate = sampleTime;
        }
      }

      // Horizon crossing points (Sunrise & Sunset)
      let sunrisePt: THREE.Vector3 | null = null;
      let sunsetPt: THREE.Vector3 | null = null;
      for (let i = 0; i < allPts.length - 1; i++) {
        const p1 = allPts[i];
        const p2 = allPts[i + 1];
        if (p1.elev < 0 && p2.elev >= 0) {
          sunrisePt = p1.pt.clone().lerp(p2.pt, -p1.elev / (p2.elev - p1.elev));
        } else if (p1.elev >= 0 && p2.elev < 0) {
          sunsetPt = p1.pt.clone().lerp(p2.pt, p1.elev / (p1.elev - p2.elev));
        }
      }

      const { daySegments, nightSegments } = splitSolarPath(allPts);
      return {
        daySegments: daySegments.filter(segment => segment.length >= 2).map(segment => segment.map(sample => sample.pt)),
        nightSegments: nightSegments.filter(segment => segment.length >= 2).map(segment => segment.map(sample => sample.pt)),
        allPts,
        maxElev,
        maxElevPt,
        maxElevDate,
        sunrisePt,
        sunsetPt,
      };
    };

    // Calculate Today's Solar Path
    const todayPath = computeDiurnalPath(currentDate, 96);

    // Four shared benchmarks; every milestone has one typed pick target.
    if (layers.showSeasonalPaths) {
      for (const milestone of getSolarMilestones(currentDate.getUTCFullYear())) {
        const path = computeDiurnalPath(milestone.date, 72);
        for (const points of path.daySegments) {
          const curve = new THREE.CatmullRomCurve3(points, false);
          group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.18, 8, false),
            new THREE.MeshBasicMaterial({ color: milestone.color, transparent: true, opacity: 0.9 })));
        }
        for (const points of path.nightSegments) {
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineDashedMaterial({ color: milestone.color, dashSize: 0.8, gapSize: 0.8,
              transparent: true, opacity: 0.35 }));
          line.computeLineDistances();
          group.add(line);
        }
        const apex = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 16),
          new THREE.MeshBasicMaterial({ color: milestone.color }));
        apex.position.copy(path.maxElevPt);
        group.add(apex);
        addPickTarget(path.maxElevPt, { date: path.maxElevDate, name: milestone.name });
        const label = createLabelSprite(`${milestone.name} ${path.maxElev.toFixed(1)}°`, milestone.color, undefined, 1.375);
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
      sunTrajectoryGroupRef.current.visible = !isTour && layers.showSunTrajectory && selectedCity !== null;
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
  }, [layers, selectedCity, isTour]);

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

