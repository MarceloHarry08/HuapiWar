import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

/**
 * HUAPI WAR - Sistema de Agua Realista y Profunda para el Lago Nahuel Huapi
 * Shader personalizado con dispersión espectral azul glaciar (Patagonia Deep Blue),
 * Subsurface Scattering (SSS) en crestas de olas a contraluz, reflejo Fresnel
 * del cielo cordillerano, destellos solares especulares y mapa de normales armónico continuo.
 */

/**
 * Función matemática de elevación de olas para la física de cabeceo y flotación de los barcos
 */
export function getLakeWaveHeight(x, z, time) {
  const w1 = Math.sin(x * 0.018 + time * 1.5) * 0.85;
  const w2 = Math.cos(z * 0.022 + time * 1.2) * 0.65;
  const w3 = Math.sin((x * 0.6 + z * 0.8) * 0.035 + time * 2.0) * 0.4;
  const w4 = Math.cos((x * 0.8 - z * 0.6) * 0.055 + time * 2.6) * 0.25;
  return w1 + w2 + w3 + w4;
}

/**
 * Genera una textura de normales procedural de alta fidelidad (1024x1024)
 * Combina 8 octavas armónicas direccionales con frecuencias enteras periódicas
 * para garantizar un tileado infinito completamente seamless (sin costuras visibles)
 * y cálculo de gradientes por diferencias centrales.
 */
function createProceduralWaterNormalMap() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  const twoPi = Math.PI * 2;
  const heights = new Float32Array(size * size);

  // 8 octavas armónicas con frecuencias periódicas enteras (seamless en X e Y)
  const octaves = [
    { kx: 3,  ky: 2,   amp: 1.0,   phase: 0.35 },
    { kx: -4, ky: 3,   amp: 0.70,  phase: 1.20 },
    { kx: 6,  ky: -5,  amp: 0.45,  phase: 2.10 },
    { kx: -8, ky: 7,   amp: 0.30,  phase: 0.85 },
    { kx: 12, ky: -10, amp: 0.20,  phase: 1.65 },
    { kx: -18, ky: 16, amp: 0.13,  phase: 2.90 },
    { kx: 28, ky: -24, amp: 0.08,  phase: 0.45 },
    { kx: -42, ky: 36, amp: 0.045, phase: 1.95 },
  ];

  // 1. Campo de alturas sintético
  for (let y = 0; y < size; y++) {
    const vy = (y / size) * twoPi;
    const rowOffset = y * size;
    for (let x = 0; x < size; x++) {
      const vx = (x / size) * twoPi;
      let h = 0.0;
      for (let i = 0; i < octaves.length; i++) {
        const oct = octaves[i];
        h += Math.sin(vx * oct.kx + vy * oct.ky + oct.phase) * oct.amp;
      }
      heights[rowOffset + x] = h;
    }
  }

  // 2. Cálculo de vectores normales en espacio tangente por diferencias centrales periódicas
  const normalStrength = 3.6;

  for (let y = 0; y < size; y++) {
    const yPrev = (y - 1 + size) % size;
    const yNext = (y + 1) % size;
    const rowOffset = y * size;
    const rowPrev = yPrev * size;
    const rowNext = yNext * size;

    for (let x = 0; x < size; x++) {
      const xPrev = (x - 1 + size) % size;
      const xNext = (x + 1) % size;

      const dhdx = (heights[rowOffset + xNext] - heights[rowOffset + xPrev]) * 0.5;
      const dhdy = (heights[rowNext + x] - heights[rowPrev + x]) * 0.5;

      let nx = -dhdx * normalStrength;
      let ny = -dhdy * normalStrength;
      let nz = 1.0;

      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (rowOffset + x) * 4;
      data[idx]     = Math.floor((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  return texture;
}

/**
 * Inicializa y configura la malla de agua del Nahuel Huapi con shader azul realista
 */
export function createNahuelHuapiWater(scene, sunDirection) {
  const waterGeometry = new THREE.PlaneGeometry(3600, 3600, 128, 128);
  const normalMap = createProceduralWaterNormalMap();

  const lightDir = sunDirection
    ? sunDirection.clone().normalize()
    : new THREE.Vector3(0.6, 0.7, 0.3).normalize();

  // Instanciar Three.js Water Addon oficial
  const water = new Water(waterGeometry, {
    textureWidth: 1024,
    textureHeight: 1024,
    waterNormals: normalMap,
    sunDirection: lightDir,
    sunColor: 0xfff5e6,  // Luz brillante y cálida del sol de montaña
    waterColor: 0x07427d, // Azul profundo del Lago Nahuel Huapi
    distortionScale: 5.5,
    fog: scene.fog !== undefined,
  });

  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  water.receiveShadow = true;

  // Inyección de shader para color azul realista con dispersión y SSS
  const material = water.material;
  const originalFragment = material.fragmentShader;
  const targetCode = 'vec3 outgoingLight = albedo;';

  if (originalFragment.includes(targetCode)) {
    const realisticBlueShader = `
      // === AGUA REALISTA AZUL PROFUNDO DEL LAGO NAHUEL HUAPI ===
      // Absorción espectral y dispersión del agua glaciar andina
      vec3 deepAbyss     = vec3(0.008, 0.12, 0.35); // Azul cobalto abisal (profundidades)
      vec3 midDepthBlue  = vec3(0.025, 0.32, 0.72); // Azul zafiro patagónico (cuerpo del lago)
      vec3 shallowAzure  = vec3(0.08, 0.56, 0.92);  // Celeste translúcido diáfano
      vec3 crestGlacier  = vec3(0.28, 0.80, 1.0);   // Subsurface Scattering (SSS) en crestas

      float normalUp = clamp(surfaceNormal.y, 0.0, 1.0);
      float viewDotNormal = clamp(dot(surfaceNormal, eyeDirection), 0.0, 1.0);
      float waveSlope = 1.0 - normalUp;

      // Gradiente espectral según ángulo de visión y luz difusa incidente
      vec3 waterBody = mix(deepAbyss, midDepthBlue, normalUp * 0.85);
      waterBody = mix(waterBody, shallowAzure, viewDotNormal * 0.40 + diffuseLight.r * 0.35);

      // Subsurface Scattering (SSS): luz solar que atraviesa las crestas de las olas
      float sssBacklight = max(0.0, dot(-eyeDirection, sunDirection + surfaceNormal * 0.6));
      float sssIntensity = pow(sssBacklight, 3.5) * (waveSlope * 2.2 + 0.15);
      waterBody += crestGlacier * clamp(sssIntensity * 0.85, 0.0, 0.9);

      // Fresnel físico: reflejo del cielo azul andino en ángulos rasantes
      vec3 skySheen = mix(reflectionSample, vec3(0.22, 0.52, 0.86), 0.30);
      float fresnelTerm = clamp(reflectance, 0.0, 1.0);
      vec3 compositeWater = mix(waterBody, skySheen + specularLight * 2.2, fresnelTerm * 0.70 + 0.12);

      // Destellos solares especulares nítidos sobre las ondas (Sun Glints)
      vec3 halfVector = normalize(sunDirection + eyeDirection);
      float sunGlint = pow(max(0.0, dot(surfaceNormal, halfVector)), 128.0);
      compositeWater += sunColor * sunGlint * 1.6;

      // Micro-espuma blanca/celeste en crestas de oleaje pronunciado
      float foamTurbulence = sin(worldPosition.x * 0.35 + worldPosition.z * 0.35 + time * 3.0) * 0.5 + 0.5;
      float foamEdge = smoothstep(0.24, 0.40, waveSlope + foamTurbulence * 0.12);
      vec3 foamColor = vec3(0.93, 0.98, 1.0);
      compositeWater = mix(compositeWater, foamColor, foamEdge * 0.50);

      vec3 outgoingLight = compositeWater;
    `;
    material.fragmentShader = originalFragment.replace(targetCode, realisticBlueShader);
  }

  scene.add(water);

  // Malla decorativa de espuma y estela para barcos
  const foamRingsGroup = new THREE.Group();
  scene.add(foamRingsGroup);

  return {
    mesh: water,
    foamGroup: foamRingsGroup,
    update: (time) => {
      // Velocidad fluida realista para la traslación armónica de las ondas
      material.uniforms['time'].value = time * 3.2;
    },
  };
}

/**
 * Crea un anillo de espuma difuminado y orgánico para la línea de flotación de un barco
 */
export function createShipFoamRing() {
  const geom = new THREE.RingGeometry(3.5, 5.8, 32);
  geom.rotateX(-Math.PI / 2);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Gradiente radial suave para espuma difusa y natural en el agua azul
  const grad = ctx.createRadialGradient(64, 64, 38, 64, 64, 62);
  grad.addColorStop(0.0, 'rgba(230, 245, 255, 0.0)');
  grad.addColorStop(0.4, 'rgba(240, 250, 255, 0.85)');
  grad.addColorStop(0.7, 'rgba(180, 225, 255, 0.50)');
  grad.addColorStop(1.0, 'rgba(140, 210, 255, 0.0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = 0.12;
  return mesh;
}
