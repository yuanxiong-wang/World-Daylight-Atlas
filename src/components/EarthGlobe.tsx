import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SubsolarPoint, CityData, GlobeLayerSettings } from '../types';
import { createEarthTextures, createStarfield } from '../utils/earthTextures';
import { getSolarPosition } from '../utils/solarCalculator';

interface EarthGlobeProps {
  currentDate: Date;
  subsolarPoint: SubsolarPoint;
  cities: CityData[];
  selectedCity: CityData | null;
  onSelectCity: (city: CityData | null) => void;
  onOpenDetails?: () => void;
  layers: GlobeLayerSettings;
  activeCameraPreset: string | null;
  onResetCameraPreset: () => void;
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

// Procedural Sprite Label generator for 3D annotations
function createLabelSprite(text: string, color: string = '#fde047', bg: string = 'rgba(15, 23, 42, 0.85)'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  // Background rounded badge
  ctx.fillStyle = bg;
  const rad = 20;
  ctx.beginPath();
  ctx.moveTo(rad, 0);
  ctx.lineTo(384 - rad, 0);
  ctx.quadraticCurveTo(384, 0, 384, rad);
  ctx.lineTo(384, 96 - rad);
  ctx.quadraticCurveTo(384, 96, 384 - rad, 96);
  ctx.lineTo(rad, 96);
  ctx.quadraticCurveTo(0, 96, 0, 96 - rad);
  ctx.lineTo(0, rad);
  ctx.quadraticCurveTo(0, 0, rad, 0);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();

  // Text
  ctx.fillStyle = color;
  ctx.font = 'bold 36px "JetBrains Mono", monospace, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 192, 48);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(6.5, 1.625, 1);
  return sprite;
}

export const EarthGlobe: React.FC<EarthGlobeProps> = ({
  currentDate,
  subsolarPoint,
  cities,
  selectedCity,
  onSelectCity,
  onOpenDetails,
  layers,
  activeCameraPreset,
  onResetCameraPreset,
}) => {
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

      controls.update();
      renderer.render(scene, camera);
      animFrameIdRef.current = requestAnimationFrame(animate);
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
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
  useEffect(() => {
    const group = sunTrajectoryGroupRef.current;
    if (!group) return;

    // Clear previous trajectory objects
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
    }

    if (!selectedCity || !layers.showSunTrajectory) {
      group.visible = false;
      return;
    }

    group.visible = true;

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

      const sprite = createLabelSprite(label, color, 'rgba(15, 23, 42, 0.6)');
      sprite.position.copy(pObs.clone().addScaledVector(dir, R_DOME * 1.15));
      sprite.scale.set(2.8, 1.4, 1);
      group.add(sprite);
    });

    // 4. Sample 24-Hour Diurnal Solar Trajectory
    const dayCurvePts: THREE.Vector3[] = [];
    const nightCurvePts: THREE.Vector3[] = [];
    const allTrajectoryPts: { pt: THREE.Vector3; elev: number; az: number; date: Date }[] = [];

    const baseDate = new Date(currentDate);
    baseDate.setUTCHours(0, 0, 0, 0);

    const SAMPLES = 96; // Every 15 minutes
    let maxElev = -90;
    let maxElevPt = pObs.clone();
    let maxElevDate = currentDate;

    for (let i = 0; i <= SAMPLES; i++) {
      const sampleTime = new Date(baseDate.getTime() + (i / SAMPLES) * 86400000);
      const pos = getSolarPosition(selectedCity.lat, selectedCity.lng, sampleTime);
      const elRad = pos.elevation * (Math.PI / 180);
      const azRad = pos.azimuth * (Math.PI / 180);

      // 3D vector in local observer frame:
      // Dir = cos(el)*cos(az)*North + cos(el)*sin(az)*East + sin(el)*Up
      const localDir = new THREE.Vector3()
        .addScaledVector(north, Math.cos(elRad) * Math.cos(azRad))
        .addScaledVector(east, Math.cos(elRad) * Math.sin(azRad))
        .addScaledVector(up, Math.sin(elRad));

      const pt = pObs.clone().addScaledVector(localDir, R_DOME);
      allTrajectoryPts.push({ pt, elev: pos.elevation, az: pos.azimuth, date: sampleTime });

      if (pos.elevation >= 0) {
        dayCurvePts.push(pt);
      } else {
        nightCurvePts.push(pt);
      }

      if (pos.elevation > maxElev) {
        maxElev = pos.elevation;
        maxElevPt = pt;
        maxElevDate = sampleTime;
      }
    }

    // 5. Draw Daylight Arc (Thick 3D Glowing Golden Ribbon)
    if (dayCurvePts.length >= 2) {
      const dayCurve = new THREE.CatmullRomCurve3(dayCurvePts, false);
      const tubeGeo = new THREE.TubeGeometry(dayCurve, 64, 0.28, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      group.add(tubeMesh);

      // Soft glow outer tube
      const glowTubeGeo = new THREE.TubeGeometry(dayCurve, 48, 0.65, 8, false);
      const glowTubeMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      });
      group.add(new THREE.Mesh(glowTubeGeo, glowTubeMat));
    }

    // 6. Draw Night Arc (Subtle Dashed Violet Line below horizon)
    if (nightCurvePts.length >= 2) {
      const nightGeo = new THREE.BufferGeometry().setFromPoints(nightCurvePts);
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

    // 7. Solar Noon Culmination Apex Marker & Vertical Drop Line
    if (maxElev > -90) {
      // Apex sphere
      const apexGeo = new THREE.SphereGeometry(0.7, 16, 16);
      const apexMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const apexMesh = new THREE.Mesh(apexGeo, apexMat);
      apexMesh.position.copy(maxElevPt);
      group.add(apexMesh);

      // Vertical guide line from apex straight down to ground
      const dropGeo = new THREE.BufferGeometry().setFromPoints([pObs, maxElevPt]);
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

      // Apex Label
      const noonTimeStr = maxElevDate.toLocaleTimeString('en-US', {
        timeZone: selectedCity.timezone,
        hour: '2-digit',
        minute: '2-digit',
      });
      const apexLabel = createLabelSprite(`☀️ Culmination ${maxElev.toFixed(1)}° (${noonTimeStr})`, '#fde047');
      apexLabel.position.copy(maxElevPt.clone().addScaledVector(up, 2.4));
      group.add(apexLabel);
    }

    // 8. Sunrise & Sunset Horizon Intersections
    // Find points where elevation crosses 0
    let sunrisePt: THREE.Vector3 | null = null;
    let sunsetPt: THREE.Vector3 | null = null;
    for (let i = 0; i < allTrajectoryPts.length - 1; i++) {
      const p1 = allTrajectoryPts[i];
      const p2 = allTrajectoryPts[i + 1];
      if (p1.elev < 0 && p2.elev >= 0) {
        // Sunrise crossing
        sunrisePt = p1.pt.clone().lerp(p2.pt, -p1.elev / (p2.elev - p1.elev));
      } else if (p1.elev >= 0 && p2.elev < 0) {
        // Sunset crossing
        sunsetPt = p1.pt.clone().lerp(p2.pt, p1.elev / (p1.elev - p2.elev));
      }
    }

    if (sunrisePt) {
      const rGeo = new THREE.SphereGeometry(0.6, 12, 12);
      const rMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
      const rMesh = new THREE.Mesh(rGeo, rMat);
      rMesh.position.copy(sunrisePt);
      group.add(rMesh);

      const rLabel = createLabelSprite('🌅 Sunrise', '#fb923c');
      rLabel.position.copy(sunrisePt.clone().addScaledVector(up, 2.0));
      group.add(rLabel);
    }

    if (sunsetPt) {
      const sGeo = new THREE.SphereGeometry(0.6, 12, 12);
      const sMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const sMesh = new THREE.Mesh(sGeo, sMat);
      sMesh.position.copy(sunsetPt);
      group.add(sMesh);

      const sLabel = createLabelSprite('🌇 Sunset', '#f87171');
      sLabel.position.copy(sunsetPt.clone().addScaledVector(up, 2.0));
      group.add(sLabel);
    }

    // 9. Current Instantaneous Sun Position on the Trajectory Arc
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

    // White core
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    sunBeadGroup.add(sunCore);

    // Amber corona
    const sunCorona = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.65 })
    );
    sunBeadGroup.add(sunCorona);
    group.add(sunBeadGroup);

    // Sightline Ray from Observer to Current Sun
    const sightlineGeo = new THREE.BufferGeometry().setFromPoints([pObs, curSunPos]);
    const sightlineMat = new THREE.LineBasicMaterial({
      color: 0xffea00,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });
    group.add(new THREE.Line(sightlineGeo, sightlineMat));

    // Projection on Horizon Plane (showing altitude angle visually)
    const horizProjection = pObs.clone()
      .addScaledVector(north, Math.cos(curElRad) * Math.cos(curAzRad) * R_DOME)
      .addScaledVector(east, Math.cos(curElRad) * Math.sin(curAzRad) * R_DOME);

    const altDropGeo = new THREE.BufferGeometry().setFromPoints([curSunPos, horizProjection]);
    const altDropMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.6,
      gapSize: 0.4,
      transparent: true,
      opacity: 0.7,
    });
    const altDropLine = new THREE.Line(altDropGeo, altDropMat);
    altDropLine.computeLineDistances();
    group.add(altDropLine);

    // Current Sun Label
    const curSunLabel = createLabelSprite(
      `☉ Sun Alt: ${curPos.elevation.toFixed(1)}° (${curPos.phaseLabel})`,
      curPos.elevation >= 0 ? '#fde047' : '#818cf8',
      'rgba(15, 23, 42, 0.9)'
    );
    curSunLabel.position.copy(curSunPos.clone().addScaledVector(up, 2.2));
    group.add(curSunLabel);

  }, [selectedCity, currentDate, layers.showSunTrajectory]);

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

    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
    }

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
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!mountRef.current || !cameraRef.current || !citiesGroupRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      // Check city markers first
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
    [onSelectCity]
  );

  // Smooth Camera Presets
  useEffect(() => {
    if (!activeCameraPreset || !cameraRef.current || !controlsRef.current) return;
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
        const targetPos = cityDir.clone().multiplyScalar(110);
        camera.position.set(targetPos.x, targetPos.y, targetPos.z);
        controls.target.set(0, 0, 0);
      }
    }

    controls.update();
    onResetCameraPreset();
  }, [activeCameraPreset, subsolarPoint, selectedCity, onResetCameraPreset]);

  // Compute selected city's current solar data
  const citySolar = selectedCity ? getSolarPosition(selectedCity.lat, selectedCity.lng, currentDate) : null;

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-950">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Selected Location / City Tooltip Floating Badge with Sun Trajectory Actions */}
      {selectedCity && citySolar && (
        <div className="absolute top-20 right-6 z-20 pointer-events-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-white max-w-xs transition-all">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                <h3 className="font-semibold text-base text-sky-400 truncate">{selectedCity.name}</h3>
              </div>
              <p className="text-xs text-slate-400">{selectedCity.country}</p>
            </div>
            <button
              onClick={() => onSelectCity(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-sm font-mono cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-800">
            <div>
              <span className="text-slate-500 block">Coordinates</span>
              <span className="font-mono text-slate-200">
                {Math.abs(selectedCity.lat).toFixed(1)}°{selectedCity.lat >= 0 ? 'N' : 'S'},{' '}
                {Math.abs(selectedCity.lng).toFixed(1)}°{selectedCity.lng >= 0 ? 'E' : 'W'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Lighting Status</span>
              <span className={`font-semibold inline-flex items-center gap-1 ${
                citySolar.phase === 'day' ? 'text-amber-400' :
                citySolar.phase === 'golden-hour' ? 'text-orange-400' :
                citySolar.phase.includes('twilight') ? 'text-sky-400' : 'text-indigo-300'
              }`}>
                {citySolar.phaseLabel}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Solar Elevation</span>
              <span className="font-mono font-medium text-amber-400 font-bold">
                {citySolar.elevation.toFixed(1)}°
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Solar Azimuth</span>
              <span className="font-mono font-medium text-slate-200">
                {citySolar.azimuth.toFixed(1)}°
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => onResetCameraPreset()}
              className="py-1.5 px-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="3D Diurnal Sun Trajectory Arc is Active"
            >
              <span>☀️</span> 3D Arc Active
            </button>
            <button
              onClick={() => onOpenDetails && onOpenDetails()}
              className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Open full 24-hour solar trajectory altitude chart and twilight times"
            >
              <span>📊</span> Trajectory Chart
            </button>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>Click anywhere to inspect</span>
            <span className="text-sky-400 font-mono">
              {currentDate.toLocaleTimeString('en-US', { timeZone: selectedCity.timezone, hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
