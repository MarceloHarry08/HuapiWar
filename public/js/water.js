import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

/**
 * HUAPI WAR - Sistema de Agua Estilizada para el Lago Nahuel Huapi (Sea of Thieves Style)
 * Shaders con dispersión de luz profunda (azul/verde esmeralda), Subsurface Scattering (SSS)
 * en crestas de olas y cel-shading para anillos de espuma en los cascos.
 */

// Función matemática de elevación de olas (espectral / armónicos sincronizados)
export function getLakeWaveHeight(x, z, time) {
  const w1 = Math.sin(x * 0.018 + time * 1.5) * 0.85;
  const w2 = Math.cos(z * 0.022 + time * 1.2) * 0.65;
  const w3 = Math.sin((x * 0.6 + z * 0.8) * 0.035 + time * 2.0) * 0.4;
  const w4 = Math.cos((x * 0.8 - z * 0.6) * 0.055 + time * 2.6) * 0.25;
  return w1 + w2 + w3 + w4;
}

/**
 * Genera una textura de normales procedurales para el agua del lago
 */
function createProceduralWaterNormalMap() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 8;
      const v = (y / size) * Math.PI * 8;

      // Ondas estilizadas suaves en bloque (Painterly / sin ruido granular de alta frecuencia)
      const nx = Math.sin(u) * 0.5 + Math.sin(u * 2.0 + v) * 0.25;
      const ny = Math.cos(v) * 0.5 + Math.cos(v * 2.0 + u) * 0.25;
      const nz = 1.0;

      // Normalizar vector (nx, ny, nz) a espacio [0, 255]
      const len = Math.hypot(nx, ny, nz);
      const r = ((nx / len) * 0.5 + 0.5) * 255;
      const g = ((ny / len) * 0.5 + 0.5) * 255;
      const b = ((nz / len) * 0.5 + 0.5) * 255;

      const idx = (y * size + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Inicializa y configura la malla de agua del Nahuel Huapi
 */
export function createNahuelHuapiWater(scene, sunDirection) {
  const waterGeometry = new THREE.PlaneGeometry(3200, 3200, 128, 128);
  const normalMap = createProceduralWaterNormalMap();

  // Instanciar Three.js Water Addon
  const water = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: normalMap,
    sunDirection: sunDirection || new THREE.Vector3(0.6, 0.7, 0.3).normalize(),
    sunColor: 0xffe8aa, // Luz dorada de sol andino
    waterColor: 0x0a335c, // Azul profundo del Lago Nahuel Huapi
    distortionScale: 3.5,
    fog: scene.fog !== undefined,
  });

  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  water.receiveShadow = true;

  // Personalización del Shader para SSS en crestas y dispersión azul zafiro
  const material = water.material;
  material.uniforms['time'] = { value: 0 };
  material.uniforms['crestColor'] = { value: new THREE.Color(0x38bdf8) }; // Azul glaciar luminoso SSS
  material.uniforms['deepColor'] = { value: new THREE.Color(0x021630) };  // Azul abisal profundo
  material.uniforms['foamThreshold'] = { value: 0.68 };

  // Inyección de lógica en el fragment shader para Subsurface Scattering y dispersión azul
  const originalFragment = material.fragmentShader;
  material.fragmentShader = originalFragment.replace(
    'gl_FragColor = vec4( color, 1.0 );',
    `
      // Dispersión profunda en azul y realce de crestas con Subsurface Scattering (SSS)
      vec3 deepBlue = vec3(0.018, 0.11, 0.28);
      vec3 sssCrest = vec3(0.22, 0.70, 0.98);
      
      // Simulación de luz a contraluz que atraviesa las crestas de las olas
      float waveCrestFactor = clamp(eye.y * 0.05 + 0.4, 0.0, 1.0);
      vec3 stylizedColor = mix(deepBlue, color, 0.70);
      stylizedColor = mix(stylizedColor, sssCrest, pow(waveCrestFactor, 2.8) * 0.42);

      // Espuma cel-shaded en crestas
      if (waveCrestFactor > 0.88) {
        stylizedColor = mix(stylizedColor, vec3(0.95, 0.98, 1.0), 0.85);
      }

      gl_FragColor = vec4(stylizedColor, 0.95);
    `
  );

  scene.add(water);

  // Malla decorativa de espuma y estela para barcos
  const foamRingsGroup = new THREE.Group();
  scene.add(foamRingsGroup);

  return {
    mesh: water,
    foamGroup: foamRingsGroup,
    update: (time) => {
      material.uniforms['time'].value = time;
    },
  };
}

/**
 * Crea un anillo de espuma cel-shading en la línea de flotación de un barco
 */
export function createShipFoamRing() {
  const geom = new THREE.RingGeometry(3.5, 5.2, 24);
  geom.rotateX(-Math.PI / 2);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = 0.1;
  return mesh;
}
