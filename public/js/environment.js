import * as THREE from 'three';

/**
 * HUAPI WAR - Entorno Escénico del Lago Nahuel Huapi (Bariloche, Patagonia)
 * Cordillera de los Andes estilizada, picos nevados, Isla Victoria, bosques de pinos
 * y nubes volumétricas 3D esculpidas con bordes definidos (sin niebla fotorrealista).
 */

export function setupNahuelHuapiEnvironment(scene) {
  // 1. ILUMINACIÓN ESTILIZADA DE ALTO CONTRASTE TÉRMICO
  // Luz Ambiental fría (reflejo de las cumbres andinas y el agua esmeralda)
  const ambientLight = new THREE.AmbientLight(0x1a4568, 1.4);
  scene.add(ambientLight);

  // Luz Hemisférica (Cielo dorado / Agua turquesa)
  const hemiLight = new THREE.HemisphereLight(0xfff0d0, 0x05464a, 0.9);
  scene.add(hemiLight);

  // Sol Andino Directo (Cálido, atardecer dorado en la cordillera)
  const sunLight = new THREE.DirectionalLight(0xffe299, 2.2);
  sunLight.position.set(450, 600, 350);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 50;
  sunLight.shadow.camera.far = 1800;
  const shadowDist = 600;
  sunLight.shadow.camera.left = -shadowDist;
  sunLight.shadow.camera.right = shadowDist;
  sunLight.shadow.camera.top = shadowDist;
  sunLight.shadow.camera.bottom = -shadowDist;
  sunLight.shadow.bias = -0.0008;
  scene.add(sunLight);

  // 2. CIELO ESTILIZADO (CÚPULA CELESTE PATAGÓNICA)
  const skyDomeGeom = new THREE.SphereGeometry(1800, 32, 24);
  skyDomeGeom.scale(-1, 1, 1);

  // Canvas con degradado estilizado atardecer andino
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 128;
  skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0.0, '#0c2747'); // Cenit azul profundo montañoso
  skyGrad.addColorStop(0.5, '#2b6cb0'); // Celeste andino diáfano
  skyGrad.addColorStop(0.78, '#e09852'); // Ámbar de cordillera
  skyGrad.addColorStop(0.92, '#f6c77f'); // Horizonte dorado solar
  skyGrad.addColorStop(1.0, '#10304a'); // Base lago
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, 128, 256);

  const skyTex = new THREE.CanvasTexture(skyCanvas);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false });
  const skyDome = new THREE.Mesh(skyDomeGeom, skyMat);
  scene.add(skyDome);

  // 3. NUBES VOLUMÉTRICAS 3D ESCULPIDAS (MALLAS POLIGONALES CON BORDES DEFINIDOS)
  const cloudsGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.0,
    emissive: 0xffe8d6,
    emissiveIntensity: 0.15, // Resplandor cálido al atardecer
    flatShading: true,      // Estilo Low-Poly / Esculpido definido
  });

  const cloudGeomPiece = new THREE.DodecahedronGeometry(1, 1);

  // Generar 16 formaciones nubosas flotando sobre el lago
  for (let c = 0; c < 16; c++) {
    const cloudCluster = new THREE.Group();
    const angle = (c / 16) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const dist = 350 + Math.random() * 500;
    const height = 180 + Math.random() * 90;

    cloudCluster.position.set(Math.cos(angle) * dist, height, Math.sin(angle) * dist);

    // Cada nube está compuesta por 6-10 esferas facetadas
    const puffCount = 7 + Math.floor(Math.random() * 4);
    for (let p = 0; p < puffCount; p++) {
      const puff = new THREE.Mesh(cloudGeomPiece, cloudMat);
      const scaleX = 22 + Math.random() * 26;
      const scaleY = 16 + Math.random() * 18;
      const scaleZ = 22 + Math.random() * 26;
      puff.scale.set(scaleX, scaleY, scaleZ);
      puff.position.set(
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 60
      );
      puff.castShadow = true;
      cloudCluster.add(puff);
    }

    cloudCluster.userData = {
      speed: 1.5 + Math.random() * 2.0,
      initialDist: dist,
      angle: angle,
    };

    cloudsGroup.add(cloudCluster);
  }
  scene.add(cloudsGroup);

  // 4. CORDILLERA DE LOS ANDES CIRCUNDANTE (CERRO TRONADOR / CATEDRAL)
  // Anillo exterior de montañas majestuosas con cumbres nevadas
  const mountainGroup = new THREE.Group();

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x3a4049,
    roughness: 0.85,
    metalness: 0.1,
    flatShading: true,
  });

  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xf0f6fc,
    roughness: 0.6,
    metalness: 0.05,
    flatShading: true,
  });

  const mountainCount = 28;
  const mountainRadius = 1000;

  for (let m = 0; m < mountainCount; m++) {
    const angle = (m / mountainCount) * Math.PI * 2;
    const peakHeight = 320 + Math.sin(m * 1.5) * 140;
    const baseRadius = 180 + Math.cos(m * 2.2) * 60;

    // Cuerpo rocoso
    const coneGeom = new THREE.ConeGeometry(baseRadius, peakHeight, 7);
    const mountainMesh = new THREE.Mesh(coneGeom, rockMat);
    mountainMesh.position.set(
      Math.cos(angle) * mountainRadius,
      peakHeight * 0.42,
      Math.sin(angle) * mountainRadius
    );
    mountainMesh.rotation.y = Math.random() * Math.PI;
    mountainMesh.castShadow = true;
    mountainMesh.receiveShadow = true;
    mountainGroup.add(mountainMesh);

    // Cumbre de nieve patagónica
    const snowCapGeom = new THREE.ConeGeometry(baseRadius * 0.45, peakHeight * 0.42, 7);
    const snowCapMesh = new THREE.Mesh(snowCapGeom, snowMat);
    snowCapMesh.position.set(
      mountainMesh.position.x,
      peakHeight * 0.72,
      mountainMesh.position.z
    );
    snowCapMesh.rotation.y = mountainMesh.rotation.y;
    snowCapMesh.castShadow = true;
    mountainGroup.add(snowCapMesh);
  }
  scene.add(mountainGroup);

  // 5. ISLA VICTORIA E ISLOTES DEL NAHUEL HUAPI
  const islandGroup = new THREE.Group();

  const islandGrassMat = new THREE.MeshStandardMaterial({
    color: 0x2d5332,
    roughness: 0.9,
    metalness: 0.0,
    flatShading: true,
  });

  const pineFoliageMat = new THREE.MeshStandardMaterial({
    color: 0x183c24,
    roughness: 0.8,
    flatShading: true,
  });

  const pineTrunkMat = new THREE.MeshStandardMaterial({
    color: 0x543219, // Tronco color canela (Arrayán / Pino)
    roughness: 0.9,
  });

  // Función para poblar un islote con pinos estilizados
  function createIslandMesh(x, z, radius, name) {
    const islandMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.9, radius * 1.15, 12, 12),
      islandGrassMat
    );
    islandMesh.position.set(x, 2.5, z);
    islandMesh.receiveShadow = true;
    islandMesh.castShadow = true;
    islandGroup.add(islandMesh);

    // Añadir pinos patagónicos estilizados
    const treeCount = Math.floor(radius * 0.45);
    for (let t = 0; t < treeCount; t++) {
      const r = Math.random() * (radius * 0.75);
      const theta = Math.random() * Math.PI * 2;
      const tx = x + Math.cos(theta) * r;
      const tz = z + Math.sin(theta) * r;

      const tree = new THREE.Group();
      // Tronco
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 5, 5), pineTrunkMat);
      trunk.position.y = 2.5;
      trunk.castShadow = true;
      tree.add(trunk);

      // Follaje cónico escalonado
      for (let f = 0; f < 3; f++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(3.6 - f * 0.8, 4.5, 6),
          pineFoliageMat
        );
        cone.position.y = 5.2 + f * 2.8;
        cone.castShadow = true;
        tree.add(cone);
      }

      tree.position.set(tx, 8, tz);
      tree.scale.setScalar(0.75 + Math.random() * 0.5);
      islandGroup.add(tree);
    }
  }

  // Crear Isla Victoria e islotes según las coordenadas sincronizadas
  createIslandMesh(0, 0, 65, 'Isla Victoria');
  createIslandMesh(260, 220, 45, 'Islote Huemul');
  createIslandMesh(-280, -180, 40, 'Península Quetrihué');
  createIslandMesh(-180, 240, 35, 'Islote Centinela');
  createIslandMesh(300, -220, 40, 'Punta Este');

  scene.add(islandGroup);

  return {
    sunLight,
    cloudsGroup,
    update: (dt) => {
      // Movimiento suave y continuo de las nubes sobre el lago
      cloudsGroup.children.forEach((cloud) => {
        cloud.userData.angle += (cloud.userData.speed * 0.0003) * dt * 60;
        cloud.position.x = Math.cos(cloud.userData.angle) * cloud.userData.initialDist;
        cloud.position.z = Math.sin(cloud.userData.angle) * cloud.userData.initialDist;
      });
    },
  };
}
