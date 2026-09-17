import * as THREE from 'three';

/**
 * HUAPI WAR - Generador Procedural de Barcos Stylized PBR Painterly (Sea of Thieves Style)
 * 5 Chasis, 5 Facciones, 5 Cañones, Nombre en el Casco y Translucidez SSS en Velámenes.
 */

// Caché de texturas de lienzo procedurales painterly
const painterlyTextureCache = new Map();

/**
 * Genera una textura estilizada tipo lienzo pintado al óleo (Painterly)
 */
function createPainterlyWoodTexture(baseHex = '#4a2f1b', highlightHex = '#6e4528', darkHex = '#27170c') {
  const key = `wood_${baseHex}_${highlightHex}_${darkHex}`;
  if (painterlyTextureCache.has(key)) return painterlyTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Fondo base
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  // Tablones horizontales con pinceladas estilizadas
  const plankHeight = 32;
  for (let y = 0; y < 512; y += plankHeight) {
    // Tinte variado por tablón
    const shade = (Math.sin(y * 0.1) * 0.5 + 0.5);
    ctx.fillStyle = shade > 0.5 ? highlightHex : baseHex;
    ctx.fillRect(0, y, 512, plankHeight);

    // Pinceladas amplias
    for (let x = 0; x < 512; x += 40) {
      ctx.fillStyle = (x % 80 === 0) ? highlightHex : darkHex;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(x + 20, y + 16, 25, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Línea de unión entre tablones (AO tintado artístico)
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = darkHex;
    ctx.fillRect(0, y + plankHeight - 2, 512, 3);
  }

  ctx.globalAlpha = 1.0;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  painterlyTextureCache.set(key, texture);
  return texture;
}

/**
 * Genera la textura del nombre del navío proyectada en el casco
 */
export function createShipNameCanvasTexture(shipName, faction = 'Argentinos') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Fondo madera oscura del casco
  ctx.fillStyle = '#1c130b';
  ctx.fillRect(0, 0, 512, 128);

  // Marco ornamental de bronce / oro patagónico
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#d4a853';
  ctx.strokeRect(10, 10, 492, 108);

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff3c4';
  ctx.strokeRect(16, 16, 480, 96);

  // Tipografía estilizada de alta legibilidad
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 36px "Cinzel", "Trajan Pro", serif';

  // Sombra proyectada
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.fillText(shipName.toUpperCase(), 256 + 2, 64 + 3);

  // Letras doradas con borde nítido
  ctx.fillStyle = '#ffd166';
  ctx.fillText(shipName.toUpperCase(), 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Genera la textura de las velas con heráldica y colores de la facción
 */
function createFactionSailTexture(faction = 'Argentinos') {
  const key = `sail_${faction}`;
  if (painterlyTextureCache.has(key)) return painterlyTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Fondo tela de vela lienzo grueso
  ctx.fillStyle = '#f5efe0';
  ctx.fillRect(0, 0, 512, 512);

  // Líneas de costura verticales de lona
  ctx.strokeStyle = 'rgba(180, 160, 130, 0.35)';
  ctx.lineWidth = 2;
  for (let x = 32; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  // Motivos heráldicos según la Facción
  if (faction === 'Argentinos') {
    // Franjas Celestes y Blancas
    ctx.fillStyle = '#74acdf';
    ctx.fillRect(0, 0, 512, 140);
    ctx.fillRect(0, 372, 512, 140);

    // Sol de Mayo dorado estilizado en el centro
    const cx = 256, cy = 256, r = 50;
    ctx.fillStyle = '#f6b40e';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Rayos del Sol
    ctx.strokeStyle = '#f6b40e';
    ctx.lineWidth = 5;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4));
      ctx.lineTo(cx + Math.cos(a) * (r + 28), cy + Math.sin(a) * (r + 28));
      ctx.stroke();
    }
  } else if (faction === 'Piratas') {
    // Vela negra corsaria
    ctx.fillStyle = '#181a1b';
    ctx.fillRect(0, 0, 512, 512);

    // Calavera y tibias cruzadas
    ctx.fillStyle = '#e2e8f0';
    const cx = 256, cy = 240;
    // Huesos cruzados
    ctx.lineWidth = 24;
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(cx - 100, cy - 80); ctx.lineTo(cx + 100, cy + 80);
    ctx.moveTo(cx + 100, cy - 80); ctx.lineTo(cx - 100, cy + 80);
    ctx.stroke();
    // Calavera
    ctx.beginPath();
    ctx.arc(cx, cy - 20, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 30, cy + 20, 60, 35);
    // Ojos negros
    ctx.fillStyle = '#181a1b';
    ctx.beginPath();
    ctx.arc(cx - 22, cy - 15, 14, 0, Math.PI * 2);
    ctx.arc(cx + 22, cy - 15, 14, 0, Math.PI * 2);
    ctx.fill();
  } else if (faction === 'Españoles') {
    // Cruz de Borgoña roja sobre lona marfil
    ctx.fillStyle = '#f8f4e6';
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 36;
    ctx.beginPath();
    ctx.moveTo(70, 70); ctx.lineTo(442, 442);
    ctx.moveTo(442, 70); ctx.lineTo(70, 442);
    ctx.stroke();
  } else if (faction === 'Portugueses') {
    // Cruz de la Orden de Cristo
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = '#dc2626';
    // Cruz ancha con borde
    ctx.fillRect(216, 60, 80, 392);
    ctx.fillRect(60, 216, 392, 80);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(236, 120, 40, 272);
    ctx.fillRect(120, 236, 272, 40);
  } else if (faction === 'Franceses') {
    // Azul real con Flor de Lis dorada
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, 512, 512);

    // Flor de Lis dorada central
    ctx.fillStyle = '#f59e0b';
    const cx = 256, cy = 256;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 30, 22, 60, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 45, cy, 20, 45, -0.4, 0, Math.PI * 2);
    ctx.ellipse(cx + 45, cy, 20, 45, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 50, cy + 20, 100, 16);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  painterlyTextureCache.set(key, texture);
  return texture;
}

/**
 * Crea un cañón estilizado según el tipo elegido
 */
function createCannonMesh(cannonType = 'bronze') {
  const cannonGroup = new THREE.Group();

  // Material de cureña de madera de roble
  const carriageMat = new THREE.MeshStandardMaterial({
    color: 0x3e271a,
    roughness: 0.8,
    metalness: 0.1,
  });

  // Material del metal según el tipo de cañón
  let barrelColor = 0xc59b27; // Bronce pulido
  let roughness = 0.35;
  let metalness = 0.9;

  if (cannonType === 'pivot') {
    barrelColor = 0x2c3539; // Hierro forjado
    roughness = 0.6;
  } else if (cannonType === 'carronade') {
    barrelColor = 0x4a4a4a; // Hierro fundido pesado
    roughness = 0.7;
  } else if (cannonType === 'culverin') {
    barrelColor = 0x9b783e; // Bronce oscuro alargado
    roughness = 0.4;
  } else if (cannonType === 'mortar') {
    barrelColor = 0x222222; // Acero templado negro
    roughness = 0.5;
  }

  const barrelMat = new THREE.MeshStandardMaterial({
    color: barrelColor,
    roughness,
    metalness,
  });

  // Base / Cureña
  const baseGeom = new THREE.BoxGeometry(0.9, 0.45, 1.3);
  const baseMesh = new THREE.Mesh(baseGeom, carriageMat);
  baseMesh.position.y = 0.22;
  cannonGroup.add(baseMesh);

  // Ruedas de madera
  const wheelGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10);
  wheelGeom.rotateZ(Math.PI / 2);
  const w1 = new THREE.Mesh(wheelGeom, carriageMat);
  w1.position.set(-0.5, 0.2, 0.4);
  const w2 = w1.clone(); w2.position.x = 0.5;
  const w3 = w1.clone(); w3.position.z = -0.4;
  const w4 = w2.clone(); w4.position.z = -0.4;
  cannonGroup.add(w1, w2, w3, w4);

  // Tubo del cañón según tipo
  if (cannonType === 'carronade') {
    // Cañón corto y grueso
    const tubeGeom = new THREE.CylinderGeometry(0.26, 0.34, 1.4, 12);
    tubeGeom.rotateX(Math.PI / 2);
    const tube = new THREE.Mesh(tubeGeom, barrelMat);
    tube.position.set(0, 0.55, 0.2);
    cannonGroup.add(tube);
  } else if (cannonType === 'culverin') {
    // Cañón largo y esbelto
    const tubeGeom = new THREE.CylinderGeometry(0.16, 0.26, 2.6, 12);
    tubeGeom.rotateX(Math.PI / 2);
    const tube = new THREE.Mesh(tubeGeom, barrelMat);
    tube.position.set(0, 0.55, 0.4);
    cannonGroup.add(tube);
  } else if (cannonType === 'mortar') {
    // Mortero triple con tres tubos elevados a 45 grados
    for (let i = -1; i <= 1; i++) {
      const tubeGeom = new THREE.CylinderGeometry(0.18, 0.22, 1.1, 10);
      tubeGeom.rotateX(Math.PI / 3);
      const tube = new THREE.Mesh(tubeGeom, barrelMat);
      tube.position.set(i * 0.32, 0.55, 0);
      cannonGroup.add(tube);
    }
  } else {
    // Cañón clásico de bronce o colisa
    const tubeGeom = new THREE.CylinderGeometry(0.2, 0.3, 1.9, 12);
    tubeGeom.rotateX(Math.PI / 2);
    const tube = new THREE.Mesh(tubeGeom, barrelMat);
    tube.position.set(0, 0.55, 0.3);
    cannonGroup.add(tube);
  }

  return cannonGroup;
}

/**
 * Genera la geometría y mallas completas del navío 3D
 */
export function buildShipMesh(config = {}) {
  const {
    name = 'Furia del Nahuel',
    chassis = 'brigantine',
    faction = 'Argentinos',
    cannon = 'bronze',
    specialWeapon = 'greek_fire',
    hudColor = '#00e5ff',
  } = config;

  const shipRoot = new THREE.Group();
  shipRoot.name = 'ShipContainer';

  // Texturas de madera y tela
  const hullWoodTex = createPainterlyWoodTexture('#4a2b13', '#6b401f', '#241407');
  const deckWoodTex = createPainterlyWoodTexture('#704f2d', '#916b43', '#3d2813');
  const sailTex = createFactionSailTexture(faction);
  const nameplateTex = createShipNameCanvasTexture(name, faction);

  // Material del Casco PBR Stylized Painterly
  const hullMaterial = new THREE.MeshStandardMaterial({
    map: hullWoodTex,
    roughness: 0.75,
    metalness: 0.05,
  });

  // Material de la Cubierta
  const deckMaterial = new THREE.MeshStandardMaterial({
    map: deckWoodTex,
    roughness: 0.85,
    metalness: 0.0,
  });

  // Material de las Velas con Subsurface Scattering (SSS) simulado
  // Translucidez a contraluz con color cálido dorado
  const sailMaterial = new THREE.MeshStandardMaterial({
    map: sailTex,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0xfff0d0),
    emissiveIntensity: 0.12, // Resplandor translúcido solar
  });

  // Material de la Placa del Nombre
  const nameplateMaterial = new THREE.MeshStandardMaterial({
    map: nameplateTex,
    roughness: 0.4,
    metalness: 0.6,
  });

  // Parámetros de escala y forma según el Chasis
  let hullLength = 18;
  let hullWidth = 6.2;
  let hullDepth = 4.2;
  let mastCount = 2;
  let aftCastleHeight = 2.4;

  if (chassis === 'corvette') {
    hullLength = 14;
    hullWidth = 5.0;
    hullDepth = 3.6;
    mastCount = 1;
    aftCastleHeight = 0.8;
  } else if (chassis === 'galleon') {
    hullLength = 26;
    hullWidth = 8.5;
    hullDepth = 5.8;
    mastCount = 3;
    aftCastleHeight = 4.2;
  } else if (chassis === 'frigate') {
    hullLength = 22;
    hullWidth = 6.8;
    hullDepth = 4.6;
    mastCount = 3;
    aftCastleHeight = 2.0;
  } else if (chassis === 'monitor') {
    hullLength = 20;
    hullWidth = 7.5;
    hullDepth = 3.4;
    mastCount = 1;
    aftCastleHeight = 1.0;
  }

  // 1. CONSTRUCCIÓN DEL CASCO (HULL)
  // Casco esculpido con curva hidrodinámica
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, hullLength * 0.55); // Proa afilada
  hullShape.bezierCurveTo(
    hullWidth * 0.7, hullLength * 0.35,
    hullWidth * 0.6, -hullLength * 0.25,
    hullWidth * 0.45, -hullLength * 0.5 // Popa
  );
  hullShape.lineTo(-hullWidth * 0.45, -hullLength * 0.5);
  hullShape.bezierCurveTo(
    -hullWidth * 0.6, -hullLength * 0.25,
    -hullWidth * 0.7, hullLength * 0.35,
    0, hullLength * 0.55
  );

  const extrudeSettings = {
    steps: 2,
    depth: hullDepth,
    bevelEnabled: true,
    bevelThickness: 0.8,
    bevelSize: 0.6,
    bevelSegments: 3,
  };

  const hullGeom = new THREE.ExtrudeGeometry(hullShape, extrudeSettings);
  hullGeom.rotateX(Math.PI / 2);
  hullGeom.rotateY(Math.PI);
  const hullMesh = new THREE.Mesh(hullGeom, hullMaterial);
  hullMesh.position.y = hullDepth * 0.5 - 0.5;
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  shipRoot.add(hullMesh);

  // Cubierta plana interior
  const deckGeom = new THREE.PlaneGeometry(hullWidth * 0.9, hullLength * 0.9);
  deckGeom.rotateX(-Math.PI / 2);
  const deckMesh = new THREE.Mesh(deckGeom, deckMaterial);
  deckMesh.position.y = hullDepth * 0.5 + 0.1;
  deckMesh.receiveShadow = true;
  shipRoot.add(deckMesh);

  // Castillo de Popa (Aftcastle)
  if (chassis !== 'monitor') {
    const aftGeom = new THREE.BoxGeometry(hullWidth * 0.8, aftCastleHeight, hullLength * 0.32);
    const aftMesh = new THREE.Mesh(aftGeom, hullMaterial);
    aftMesh.position.set(0, hullDepth * 0.5 + aftCastleHeight * 0.5, -hullLength * 0.3);
    aftMesh.castShadow = true;
    shipRoot.add(aftMesh);

    // Ventanales y farol de popa
    const lanternGeom = new THREE.DodecahedronGeometry(0.4);
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xff9900,
      emissiveIntensity: 1.5,
    });
    const lanternMesh = new THREE.Mesh(lanternGeom, lanternMat);
    lanternMesh.position.set(0, hullDepth * 0.5 + aftCastleHeight + 0.4, -hullLength * 0.48);
    shipRoot.add(lanternMesh);
  } else {
    // Monitor Acorazado: Chimenea a vapor y torreta blindada cilíndrica
    const turretGeom = new THREE.CylinderGeometry(2.4, 2.6, 1.8, 14);
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x333b42, metalness: 0.9, roughness: 0.4 });
    const turretMesh = new THREE.Mesh(turretGeom, ironMat);
    turretMesh.position.set(0, hullDepth * 0.5 + 0.9, 0);
    shipRoot.add(turretMesh);

    const funnelGeom = new THREE.CylinderGeometry(0.6, 0.7, 4.0, 10);
    const funnelMesh = new THREE.Mesh(funnelGeom, ironMat);
    funnelMesh.position.set(0, hullDepth * 0.5 + 2.0, -hullLength * 0.25);
    shipRoot.add(funnelMesh);
  }

  // Mascarón de proa esculpido (Figurehead)
  const figureGeom = new THREE.ConeGeometry(0.5, 1.8, 6);
  figureGeom.rotateX(-Math.PI / 3);
  const figureMat = new THREE.MeshStandardMaterial({ color: 0xd4a853, metalness: 0.8, roughness: 0.3 });
  const figureMesh = new THREE.Mesh(figureGeom, figureMat);
  figureMesh.position.set(0, hullDepth * 0.5 + 0.5, hullLength * 0.58);
  shipRoot.add(figureMesh);

  // 2. RENDERIZADO DEL NOMBRE EN EL CASCO (AMBOS LADOS: BABOR Y ESTRIBOR)
  const plateGeom = new THREE.PlaneGeometry(6.5, 1.6);
  
  // Placa Estribor (Derecha)
  const rightPlate = new THREE.Mesh(plateGeom, nameplateMaterial);
  rightPlate.position.set(hullWidth * 0.51, hullDepth * 0.45, 0);
  rightPlate.rotation.y = Math.PI / 2;
  shipRoot.add(rightPlate);

  // Placa Babor (Izquierda)
  const leftPlate = new THREE.Mesh(plateGeom, nameplateMaterial);
  leftPlate.position.set(-hullWidth * 0.51, hullDepth * 0.45, 0);
  leftPlate.rotation.y = -Math.PI / 2;
  shipRoot.add(leftPlate);

  // 3. MÁSTILES, VELAS Y BANDERAS HERÁLDICAS
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x3d2514, roughness: 0.9 });
  const mastPositions = [];

  if (mastCount === 1) {
    mastPositions.push(0);
  } else if (mastCount === 2) {
    mastPositions.push(hullLength * 0.22, -hullLength * 0.16);
  } else if (mastCount === 3) {
    mastPositions.push(hullLength * 0.3, 0, -hullLength * 0.28);
  }

  mastPositions.forEach((posZ, idx) => {
    const mastHeight = 15 + (idx === 1 && mastCount === 3 ? 3 : 0) - (chassis === 'monitor' ? 6 : 0);
    const mastGeom = new THREE.CylinderGeometry(0.22, 0.38, mastHeight, 8);
    const mastMesh = new THREE.Mesh(mastGeom, mastMat);
    mastMesh.position.set(0, mastHeight * 0.5 + 1.5, posZ);
    mastMesh.castShadow = true;
    shipRoot.add(mastMesh);

    // Cofas de vigía (Crow's Nest)
    if (chassis !== 'monitor') {
      const nestGeom = new THREE.CylinderGeometry(1.0, 0.7, 0.8, 8);
      const nestMesh = new THREE.Mesh(nestGeom, mastMat);
      nestMesh.position.set(0, mastHeight * 0.75 + 1.5, posZ);
      shipRoot.add(nestMesh);
    }

    // Vergas y Velas hinchadas por el viento
    const yardsCount = chassis === 'monitor' ? 1 : 2;
    for (let yIdx = 0; yIdx < yardsCount; yIdx++) {
      const yardY = mastHeight * (0.45 + yIdx * 0.32) + 1.5;
      const yardWidth = (hullWidth * 1.8) * (1 - yIdx * 0.22);
      const yardGeom = new THREE.CylinderGeometry(0.12, 0.12, yardWidth, 6);
      yardGeom.rotateZ(Math.PI / 2);
      const yardMesh = new THREE.Mesh(yardGeom, mastMat);
      yardMesh.position.set(0, yardY, posZ);
      shipRoot.add(yardMesh);

      // Malla de la vela combada hacia proa (estilo Sea of Thieves)
      const sailWidth = yardWidth * 0.95;
      const sailHeight = mastHeight * 0.26;
      const sailGeom = new THREE.PlaneGeometry(sailWidth, sailHeight, 6, 6);
      
      // Deformar los vértices para que la vela se infle hacia adelante
      const posAttr = sailGeom.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vy = posAttr.getY(i);
        const curve = Math.sin((vx / sailWidth + 0.5) * Math.PI) * Math.cos((vy / sailHeight) * Math.PI);
        posAttr.setZ(i, curve * 1.6);
      }
      sailGeom.computeVertexNormals();

      const sailMesh = new THREE.Mesh(sailGeom, sailMaterial);
      sailMesh.position.set(0, yardY - sailHeight * 0.45, posZ);
      sailMesh.castShadow = true;
      shipRoot.add(sailMesh);
    }

    // Bandera nacional / corsaria ondeando en la cima
    if (idx === mastPositions.length - 1) {
      const flagGeom = new THREE.PlaneGeometry(2.4, 1.4, 4, 2);
      const flagMat = new THREE.MeshStandardMaterial({
        map: sailTex,
        side: THREE.DoubleSide,
        roughness: 0.9,
      });
      const flagMesh = new THREE.Mesh(flagGeom, flagMat);
      flagMesh.position.set(0, mastHeight + 1.5, posZ - 1.2);
      flagMesh.rotation.y = Math.PI / 2;
      shipRoot.add(flagMesh);
    }
  });

  // 4. MONTAJE DE BATERÍAS DE CAÑONES EN CUBIERTA
  const cannonCountPerSide = chassis === 'galleon' ? 3 : chassis === 'corvette' ? 1 : 2;
  const spacing = hullLength * 0.45 / Math.max(1, cannonCountPerSide);

  for (let s = 0; s < cannonCountPerSide; s++) {
    const zOffset = (s - (cannonCountPerSide - 1) * 0.5) * spacing;

    // Batería Estribor (Derecha)
    const cannonRight = createCannonMesh(cannon);
    cannonRight.position.set(hullWidth * 0.38, hullDepth * 0.5 + 0.2, zOffset);
    cannonRight.rotation.y = Math.PI / 2;
    shipRoot.add(cannonRight);

    // Batería Babor (Izquierda)
    const cannonLeft = createCannonMesh(cannon);
    cannonLeft.position.set(-hullWidth * 0.38, hullDepth * 0.5 + 0.2, zOffset);
    cannonLeft.rotation.y = -Math.PI / 2;
    shipRoot.add(cannonLeft);
  }

  // Guardar metadata en el objeto para consultas rápidas
  shipRoot.userData = {
    name,
    chassis,
    faction,
    cannon,
    specialWeapon,
    hudColor,
  };

  return shipRoot;
}
