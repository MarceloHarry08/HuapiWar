import * as THREE from 'three';
import { setupNahuelHuapiEnvironment } from './environment.js';
import { createNahuelHuapiWater, getLakeWaveHeight, createShipFoamRing } from './water.js';
import { buildShipMesh } from './shipBuilder.js';
import { initVFX } from './vfx.js';
import { audioEngine } from './audio.js';
import { networkClient } from './network.js';

/**
 * HUAPI WAR - Bucle Principal y Orquestador del Juego
 * Three.js, Física Lacustre, Snapshot Interpolation, Editor 3D y Combate en Tiempo Real.
 */

// Estados del Juego
const STATES = {
  MENU: 'menu',
  CUSTOMIZER: 'customizer',
  QUEUE: 'queue',
  COMBAT: 'combat',
  GAMEOVER: 'gameover',
};

let currentState = STATES.MENU;

// Configuración actual del barco del jugador
let currentShipConfig = {
  name: 'Furia del Nahuel',
  chassis: 'brigantine',
  faction: 'Argentinos',
  cannon: 'bronze',
  special_weapon: 'greek_fire',
  hud_color: '#00e5ff',
};

// Referencias Three.js
let scene, camera, renderer, waterSystem, envSystem, vfxSystem;
let previewShipMesh = null;
const enemyShipMeshes = new Map(); // id -> { mesh, foamRing, config }
const cannonballMeshes = new Map(); // id -> mesh
const chestMeshes = new Map(); // id -> { group, beam, type }

// Posición despejada en aguas abiertas para el astillero
const CUSTOMIZER_SHIP_POS = new THREE.Vector3(0, 0.6, 175);
let customizerView = 'orbit'; // 'orbit', 'side', 'front', 'back', 'top'

// Estado local del jugador
let localPlayerShipMesh = null;
let localShipFoamRing = null;
let localPlayerData = null;

// Cámara y Controles
const cameraOffset = new THREE.Vector3(0, 14, -32);
let cameraLookAt = new THREE.Vector3(0, 4, 0);
let customizerOrbitAngle = 0;
let isDraggingPreview = false;
let previousMouseX = 0;

const keysPressed = {
  forward: 0,
  steer: 0,
  firing: false,
};

// Generador de mallas de cofres flotantes
function createChestVisualMesh(type) {
  const group = new THREE.Group();

  // Caja de madera del cofre
  const boxGeom = new THREE.BoxGeometry(2.8, 1.8, 1.8);
  const woodMat = new THREE.MeshStandardMaterial({
    color: type === 'health' ? 0x14532d : 0x5c3d2e,
    roughness: 0.75,
    metalness: 0.15,
  });
  const box = new THREE.Mesh(boxGeom, woodMat);
  box.position.y = 0.9;
  box.castShadow = true;
  group.add(box);

  // Ribetes dorados y herrajes de bronce
  const rimGeom = new THREE.BoxGeometry(3.0, 0.35, 2.0);
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a853,
    roughness: 0.35,
    metalness: 0.85,
  });
  const rim = new THREE.Mesh(rimGeom, brassMat);
  rim.position.y = 1.4;
  group.add(rim);

  // Baliza de luz vertical estilizada (verde para salud, cian para bombas)
  const beamColor = type === 'health' ? 0x10b981 : 0x00e5ff;
  const beamGeom = new THREE.CylinderGeometry(0.35, 1.6, 45, 8);
  const beamMat = new THREE.MeshBasicMaterial({
    color: beamColor,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeom, beamMat);
  beam.position.y = 23;
  group.add(beam);

  return { group, beam, type };
}

// -------------------------------------------------------------
// Inicialización del Motor Gráfico Three.js
// -------------------------------------------------------------
function initThree() {
  const canvas = document.getElementById('three-canvas');
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a4568, 0.0006);

  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 4000);
  camera.position.set(0, 25, -60);

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  // Entorno del Nahuel Huapi y Agua
  envSystem = setupNahuelHuapiEnvironment(scene);
  waterSystem = createNahuelHuapiWater(scene, envSystem.sunLight.position);
  vfxSystem = initVFX(scene);

  window.addEventListener('resize', onWindowResize);
  setupInputListeners();
  setupUIEventListeners();
  loadSavedShipsDropdown();

  // Iniciar bucle de renderizado
  requestAnimationFrame(animate);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// -------------------------------------------------------------
// Gestión de Estados y UI
// -------------------------------------------------------------
function switchState(newState) {
  currentState = newState;

  document.getElementById('menu-screen').classList.toggle('hidden', newState !== STATES.MENU);
  document.getElementById('customizer-screen').classList.toggle('hidden', newState !== STATES.CUSTOMIZER);
  document.getElementById('queue-modal').classList.toggle('hidden', newState !== STATES.QUEUE);
  document.getElementById('combat-hud').classList.toggle('hidden', newState !== STATES.COMBAT);
  document.getElementById('game-over-modal').classList.toggle('hidden', newState !== STATES.GAMEOVER);

  if (newState === STATES.CUSTOMIZER) {
    createOrUpdatePreviewShip();
  } else if (previewShipMesh && newState !== STATES.CUSTOMIZER) {
    scene.remove(previewShipMesh);
    previewShipMesh = null;
  }

  if (newState === STATES.COMBAT) {
    audioEngine.startBattleMusic();
  } else {
    audioEngine.stopBattleMusic();
  }
}

// -------------------------------------------------------------
// Editor y Personalizador 3D de Barcos
// -------------------------------------------------------------
function createOrUpdatePreviewShip() {
  if (previewShipMesh) {
    scene.remove(previewShipMesh);
  }

  previewShipMesh = buildShipMesh({
    name: currentShipConfig.name,
    chassis: currentShipConfig.chassis,
    faction: currentShipConfig.faction,
    cannon: currentShipConfig.cannon,
    specialWeapon: currentShipConfig.special_weapon,
    hudColor: currentShipConfig.hud_color,
  });

  // Posicionar en aguas abiertas despejadas del Nahuel Huapi
  previewShipMesh.position.copy(CUSTOMIZER_SHIP_POS);
  scene.add(previewShipMesh);

  // Actualizar títulos en el escenario
  const titles = {
    corvette: 'Corbeta Ligera',
    brigantine: 'Bergantín Patagónico',
    frigate: 'Fragata Nahuel',
    galleon: 'Galeón Pesado',
    monitor: 'Monitor Acorazado',
  };
  document.getElementById('stage-ship-title').textContent = titles[currentShipConfig.chassis] || 'Navío de Combate';
  document.getElementById('stage-faction-subtitle').textContent = `Facción: ${currentShipConfig.faction} - Lago Nahuel Huapi`;
}

function randomizeShip() {
  const chassisList = ['corvette', 'brigantine', 'frigate', 'galleon', 'monitor'];
  const factionList = ['Argentinos', 'Piratas', 'Españoles', 'Portugueses', 'Franceses'];
  const cannonList = ['bronze', 'pivot', 'carronade', 'culverin', 'mortar'];
  const specialList = ['greek_fire', 'cluster_bomb', 'torpedo', 'grape_shot', 'seismic_charge'];
  const hudList = ['#00e5ff', '#ffd166', '#ff3366', '#10b981', '#a855f7'];

  const randomNames = [
    'El Orgullo de Nicole',
    'Furia de Caetano',
    'El Huemul Austral',
    'Viento Patagónico',
    'Corsario del Nahuel',
    'Rayo Andino',
    'Tronador',
    'La Alianza del Sur',
  ];

  currentShipConfig = {
    name: randomNames[Math.floor(Math.random() * randomNames.length)],
    chassis: chassisList[Math.floor(Math.random() * chassisList.length)],
    faction: factionList[Math.floor(Math.random() * factionList.length)],
    cannon: cannonList[Math.floor(Math.random() * cannonList.length)],
    special_weapon: specialList[Math.floor(Math.random() * specialList.length)],
    hud_color: hudList[Math.floor(Math.random() * hudList.length)],
  };

  // Sincronizar UI del editor
  document.getElementById('input-ship-name').value = currentShipConfig.name;
  updateEditorActiveButtons();
}

function updateEditorActiveButtons() {
  const setActive = (containerId, value) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    Array.from(container.children).forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  };

  setActive('chassis-options', currentShipConfig.chassis);
  setActive('faction-options', currentShipConfig.faction);
  setActive('cannon-options', currentShipConfig.cannon);
  setActive('special-options', currentShipConfig.special_weapon);
  setActive('hud-color-options', currentShipConfig.hud_color);
}

// -------------------------------------------------------------
// Redes: Eventos de Socket.io y Cola de Espera
// -------------------------------------------------------------
networkClient.onQueueStatus = (status) => {
  if (status.inQueue) {
    document.getElementById('queue-position-num').textContent = status.position;
    switchState(STATES.QUEUE);
  }
};

networkClient.onMatchJoined = (data) => {
  localPlayerData = data.player;
  document.getElementById('hud-active-players').textContent = `${data.activeCount} / ${data.maxPlayers}`;
  document.getElementById('hud-ship-name-display').textContent = localPlayerData.name;
  document.getElementById('hud-faction-tag').textContent = localPlayerData.faction;

  // Aplicar color de acento de HUD
  document.documentElement.style.setProperty('--primary-accent', localPlayerData.hudColor || '#00e5ff');

  // Construir barco local
  if (localPlayerShipMesh) scene.remove(localPlayerShipMesh);
  localPlayerShipMesh = buildShipMesh(localPlayerData);
  localPlayerShipMesh.position.set(localPlayerData.x, localPlayerData.y, localPlayerData.z);
  scene.add(localPlayerShipMesh);

  if (!localShipFoamRing) {
    localShipFoamRing = createShipFoamRing();
    scene.add(localShipFoamRing);
  }

  // Inicializar ranuras de bombas especiales
  updateSpecialBombUI(3);

  switchState(STATES.COMBAT);
};

networkClient.onPlayerLeft = (id) => {
  if (enemyShipMeshes.has(id)) {
    const enemy = enemyShipMeshes.get(id);
    scene.remove(enemy.mesh);
    scene.remove(enemy.foamRing);
    enemyShipMeshes.delete(id);
  }
};

networkClient.onEvent = (evt) => {
  if (evt.type === 'cannon_fire') {
    audioEngine.playCannonShot(evt);
    const forward = new THREE.Vector3(Math.sin(0), 0, Math.cos(0));
    vfxSystem.createCannonBlast(new THREE.Vector3(evt.x, 2.5, evt.z), forward);
  } else if (evt.type === 'cannon_hit') {
    audioEngine.playHullHit(evt);
    vfxSystem.createHullHit(evt.x, evt.y, evt.z, evt.damage);
  } else if (evt.type === 'ship_collision') {
    audioEngine.playHullHit(evt);
    vfxSystem.createWoodCollisionCrash(new THREE.Vector3(evt.x, 2.5, evt.z));
    addCombatFeed(`💥 ¡EMBESTIDA! ${evt.playerA} y ${evt.playerB} chocaron (-30% VIDA)!`);
  } else if (evt.type === 'chest_collected') {
    if (evt.subType === 'health') {
      vfxSystem.createHealingSparkles(new THREE.Vector3(evt.x, 2.0, evt.z));
      addCombatFeed(`💚 ¡${evt.playerName} recogió un Botín de Curación (+35 HP)!`);
    } else {
      vfxSystem.createSpecialDetonation(evt.x, 2, evt.z, 'cluster_bomb');
      addCombatFeed(`⚡ ¡${evt.playerName} recargó munición especial (+1 Bomba)!`);
    }
  } else if (evt.type === 'water_splash') {
    audioEngine.playWaterSplash(evt);
    vfxSystem.createWaterSplash(evt.x, evt.z);
  } else if (evt.type === 'special_fire' || evt.type === 'special_detonation') {
    audioEngine.playSpecialExplosion(evt, evt.specialType);
    vfxSystem.createSpecialDetonation(evt.x, evt.y || 1, evt.z, evt.specialType);
  } else if (evt.type === 'ship_sunk') {
    addCombatFeed(`☠️ ¡${evt.playerName} fue hundido en el Nahuel Huapi!`);
    vfxSystem.createSpecialDetonation(evt.x, 2, evt.z, 'seismic_charge');
  }
};

// -------------------------------------------------------------
// Controles de Entrada (WASD, Disparo, Bombas)
// -------------------------------------------------------------
function setupInputListeners() {
  window.addEventListener('keydown', (e) => {
    if (currentState !== STATES.COMBAT) return;

    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
      keysPressed.forward = 1;
      sendCurrentInputs();
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
      keysPressed.forward = -1;
      sendCurrentInputs();
    } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
      keysPressed.steer = -1;
      sendCurrentInputs();
    } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
      keysPressed.steer = 1;
      sendCurrentInputs();
    } else if (e.key === ' ' || e.code === 'Space') {
      keysPressed.firing = true;
      networkClient.fireCannons('both');
      sendCurrentInputs();
    } else if (e.key === 'e' || e.key === 'E' || e.key === 'q' || e.key === 'Q') {
      networkClient.fireSpecial();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (currentState !== STATES.COMBAT) return;

    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
      keysPressed.forward = keysPressed.forward === 1 ? 0 : keysPressed.forward;
      sendCurrentInputs();
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
      keysPressed.forward = keysPressed.forward === -1 ? 0 : keysPressed.forward;
      sendCurrentInputs();
    } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
      keysPressed.steer = keysPressed.steer === -1 ? 0 : keysPressed.steer;
      sendCurrentInputs();
    } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
      keysPressed.steer = keysPressed.steer === 1 ? 0 : keysPressed.steer;
      sendCurrentInputs();
    } else if (e.key === ' ' || e.code === 'Space') {
      keysPressed.firing = false;
      sendCurrentInputs();
    }
  });

  // Disparo con botón del ratón
  window.addEventListener('mousedown', (e) => {
    if (currentState === STATES.COMBAT && e.button === 0) {
      keysPressed.firing = true;
      networkClient.fireCannons('both');
      sendCurrentInputs();
    } else if (currentState === STATES.CUSTOMIZER && e.button === 0) {
      isDraggingPreview = true;
      previousMouseX = e.clientX;
    }
  });

  window.addEventListener('mouseup', () => {
    if (currentState === STATES.COMBAT) {
      keysPressed.firing = false;
      sendCurrentInputs();
    }
    isDraggingPreview = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (currentState === STATES.CUSTOMIZER && isDraggingPreview) {
      const deltaX = e.clientX - previousMouseX;
      customizerOrbitAngle += deltaX * 0.015;
      previousMouseX = e.clientX;
      customizerView = 'orbit';

      const orbitBtn = document.querySelector('#customizer-view-buttons .btn-view[data-view="orbit"]');
      if (orbitBtn) {
        document.querySelectorAll('#customizer-view-buttons .btn-view').forEach((b) => b.classList.remove('active'));
        orbitBtn.classList.add('active');
      }
    }
  });
}

function sendCurrentInputs() {
  networkClient.sendInput({
    forward: keysPressed.forward,
    steer: keysPressed.steer,
    firing: keysPressed.firing,
  });
}

// -------------------------------------------------------------
// Eventos de Interfaz de Usuario (UI)
// -------------------------------------------------------------
function setupUIEventListeners() {
  // Inicio: Barco Aleatorio
  document.getElementById('btn-random-ship').addEventListener('click', async () => {
    await audioEngine.init();
    randomizeShip();
    networkClient.connect();
    networkClient.joinMatch(currentShipConfig);
  });

  // Inicio: Abrir Editor
  document.getElementById('btn-open-customizer').addEventListener('click', async () => {
    await audioEngine.init();
    switchState(STATES.CUSTOMIZER);
  });

  // Editor: Selector de Vistas de Cámara del Barco
  const viewButtonsContainer = document.getElementById('customizer-view-buttons');
  if (viewButtonsContainer) {
    viewButtonsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-view');
      if (btn && btn.dataset.view) {
        customizerView = btn.dataset.view;
        Array.from(viewButtonsContainer.querySelectorAll('.btn-view')).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  }

  // Inicio: Abrir Leaderboard
  document.getElementById('btn-open-leaderboard-menu').addEventListener('click', () => {
    openLeaderboardModal();
  });

  // Editor: Nombre del Barco
  document.getElementById('input-ship-name').addEventListener('input', (e) => {
    currentShipConfig.name = e.target.value || 'Navío';
    createOrUpdatePreviewShip();
  });

  // Editor: Chasis
  document.getElementById('chassis-options').addEventListener('click', (e) => {
    if (e.target.dataset.value) {
      currentShipConfig.chassis = e.target.dataset.value;
      updateEditorActiveButtons();
      createOrUpdatePreviewShip();
    }
  });

  // Editor: Facción
  document.getElementById('faction-options').addEventListener('click', (e) => {
    if (e.target.dataset.value) {
      currentShipConfig.faction = e.target.dataset.value;
      updateEditorActiveButtons();
      createOrUpdatePreviewShip();
    }
  });

  // Editor: Cañones
  document.getElementById('cannon-options').addEventListener('click', (e) => {
    if (e.target.dataset.value) {
      currentShipConfig.cannon = e.target.dataset.value;
      updateEditorActiveButtons();
      createOrUpdatePreviewShip();
    }
  });

  // Editor: Armamento Especial
  document.getElementById('special-options').addEventListener('click', (e) => {
    if (e.target.dataset.value) {
      currentShipConfig.special_weapon = e.target.dataset.value;
      updateEditorActiveButtons();
      createOrUpdatePreviewShip();
    }
  });

  // Editor: Color HUD
  document.getElementById('hud-color-options').addEventListener('click', (e) => {
    if (e.target.dataset.value) {
      currentShipConfig.hud_color = e.target.dataset.value;
      updateEditorActiveButtons();
      createOrUpdatePreviewShip();
    }
  });

  // Editor: Guardar Barco en SQLite
  document.getElementById('btn-save-ship').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/ships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentShipConfig),
      });
      const data = await res.json();
      if (res.ok) {
        alert('¡Barco guardado exitosamente en la base de datos!');
        loadSavedShipsDropdown();
      } else {
        alert('Error al guardar barco: ' + data.error);
      }
    } catch (err) {
      alert('Error de conexión con el servidor.');
    }
  });

  // Editor: Zarpar al Nahuel Huapi
  document.getElementById('btn-launch-custom-ship').addEventListener('click', () => {
    networkClient.connect();
    networkClient.joinMatch(currentShipConfig);
  });

  // Editor: Volver al Menú
  document.getElementById('btn-back-to-menu').addEventListener('click', () => {
    switchState(STATES.MENU);
  });

  // Cancelar Cola de Espera
  document.getElementById('btn-cancel-queue').addEventListener('click', () => {
    location.reload();
  });

  // Game Over: Guardar en Tabla de Líderes SQLite
  document.getElementById('btn-save-leaderboard').addEventListener('click', async () => {
    const playerName = document.getElementById('input-leaderboard-name').value.trim();
    if (!playerName) {
      alert('Por favor, ingresa tu Nombre y Apellido.');
      return;
    }

    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: playerName,
          score: localPlayerData ? localPlayerData.score : 0,
          ships_sunk: localPlayerData ? localPlayerData.shipsSunk : 0,
          ship_name: currentShipConfig.name,
          faction: currentShipConfig.faction,
        }),
      });

      if (res.ok) {
        openLeaderboardModal();
      }
    } catch (e) {
      console.warn(e);
    }
  });

  document.getElementById('btn-game-over-menu').addEventListener('click', () => {
    location.reload();
  });

  document.getElementById('btn-close-leaderboard').addEventListener('click', () => {
    document.getElementById('leaderboard-modal').classList.add('hidden');
  });

  document.getElementById('btn-refresh-leaderboard').addEventListener('click', () => {
    loadLeaderboardData();
  });
}

// -------------------------------------------------------------
// Consultas REST SQLite (Barcos Guardados y Leaderboard)
// -------------------------------------------------------------
async function loadSavedShipsDropdown() {
  try {
    const res = await fetch('/api/ships');
    const ships = await res.json();
    const select = document.getElementById('select-saved-ships');
    select.innerHTML = '<option value="">-- Seleccionar de la Base de Datos --</option>';

    ships.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.faction} - ${s.chassis})`;
      opt.dataset.ship = JSON.stringify(s);
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      const opt = e.target.selectedOptions[0];
      if (opt && opt.dataset.ship) {
        const s = JSON.parse(opt.dataset.ship);
        currentShipConfig = {
          name: s.name,
          chassis: s.chassis,
          faction: s.faction,
          cannon: s.cannon,
          special_weapon: s.special_weapon,
          hud_color: s.hud_color,
        };
        document.getElementById('input-ship-name').value = s.name;
        updateEditorActiveButtons();
        createOrUpdatePreviewShip();
      }
    });
  } catch (err) {
    console.warn('[-] No se pudieron cargar los barcos guardados:', err);
  }
}

async function openLeaderboardModal() {
  document.getElementById('leaderboard-modal').classList.remove('hidden');
  await loadLeaderboardData();
}

async function loadLeaderboardData() {
  const tbody = document.getElementById('leaderboard-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando capitanes...</td></tr>';

  try {
    const res = await fetch('/api/leaderboard');
    const leaders = await res.json();
    tbody.innerHTML = '';

    leaders.forEach((item, index) => {
      const row = document.createElement('tr');
      const rankClass = index === 0 ? 'rank-gold' : index === 1 ? 'rank-silver' : index === 2 ? 'rank-bronze' : '';
      const medal = index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : `#${index + 1} `;

      row.innerHTML = `
        <td class="${rankClass}">${medal}</td>
        <td><strong>${escapeHtml(item.player_name)}</strong></td>
        <td>${escapeHtml(item.ship_name || 'Desconocido')}</td>
        <td>${escapeHtml(item.faction || 'Argentinos')}</td>
        <td>${item.ships_sunk || 0}</td>
        <td class="${rankClass}"><strong>${item.score}</strong></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error al cargar datos.</td></tr>';
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

function addCombatFeed(text) {
  const feed = document.getElementById('combat-feed');
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.textContent = text;
  feed.appendChild(item);
  setTimeout(() => {
    if (item.parentNode) item.parentNode.removeChild(item);
  }, 4000);
}

function updateSpecialBombUI(remaining) {
  const orb1 = document.getElementById('orb-charge-1');
  const orb2 = document.getElementById('orb-charge-2');
  const orb3 = document.getElementById('orb-charge-3');

  orb1.classList.toggle('spent', remaining < 1);
  orb2.classList.toggle('spent', remaining < 2);
  orb3.classList.toggle('spent', remaining < 3);
}

// -------------------------------------------------------------
// Bucle Principal de Renderizado y Física Lacustre (Animation Loop)
// -------------------------------------------------------------
let lastFrameTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  const timeSeconds = now * 0.001;

  // 1. Actualizar entorno y shaders de agua
  if (waterSystem) waterSystem.update(timeSeconds);
  if (envSystem) envSystem.update(dt);
  if (vfxSystem) vfxSystem.update(dt);
  audioEngine.updateListener(camera);

  // 2. Comportamiento según el estado de la pantalla
  if (currentState === STATES.MENU) {
    // Órbita panorámica cinematográfica sobre el Nahuel Huapi
    const menuAngle = timeSeconds * 0.1;
    camera.position.x = Math.cos(menuAngle) * 160;
    camera.position.y = 45;
    camera.position.z = Math.sin(menuAngle) * 160;
    camera.lookAt(0, 10, 0);
  } else if (currentState === STATES.CUSTOMIZER) {
    // Visualización en el astillero (Aguas abiertas y despejadas)
    if (previewShipMesh) {
      const waveY = getLakeWaveHeight(CUSTOMIZER_SHIP_POS.x, CUSTOMIZER_SHIP_POS.z, timeSeconds);
      previewShipMesh.position.y = CUSTOMIZER_SHIP_POS.y + waveY * 0.45;
      previewShipMesh.rotation.z = Math.sin(timeSeconds * 1.2) * 0.035;
      previewShipMesh.rotation.x = Math.cos(timeSeconds * 1.5) * 0.025;
    }

    // Control de Vistas de Cámara del Editor
    let targetCamX = CUSTOMIZER_SHIP_POS.x;
    let targetCamY = 12;
    let targetCamZ = CUSTOMIZER_SHIP_POS.z;

    if (customizerView === 'orbit') {
      const dist = 38;
      targetCamX = CUSTOMIZER_SHIP_POS.x + Math.sin(customizerOrbitAngle) * dist;
      targetCamZ = CUSTOMIZER_SHIP_POS.z + Math.cos(customizerOrbitAngle) * dist;
      targetCamY = 12;
    } else if (customizerView === 'side') {
      targetCamX = CUSTOMIZER_SHIP_POS.x + 38;
      targetCamY = 9;
      targetCamZ = CUSTOMIZER_SHIP_POS.z;
    } else if (customizerView === 'front') {
      targetCamX = CUSTOMIZER_SHIP_POS.x;
      targetCamY = 9;
      targetCamZ = CUSTOMIZER_SHIP_POS.z + 38;
    } else if (customizerView === 'back') {
      targetCamX = CUSTOMIZER_SHIP_POS.x;
      targetCamY = 13;
      targetCamZ = CUSTOMIZER_SHIP_POS.z - 38;
    } else if (customizerView === 'top') {
      targetCamX = CUSTOMIZER_SHIP_POS.x + 0.1;
      targetCamY = 46;
      targetCamZ = CUSTOMIZER_SHIP_POS.z + 5;
    }

    camera.position.x += (targetCamX - camera.position.x) * (dt * 6.0);
    camera.position.y += (targetCamY - camera.position.y) * (dt * 6.0);
    camera.position.z += (targetCamZ - camera.position.z) * (dt * 6.0);
    camera.lookAt(CUSTOMIZER_SHIP_POS.x, CUSTOMIZER_SHIP_POS.y + 4.5, CUSTOMIZER_SHIP_POS.z);
  }
 else if (currentState === STATES.COMBAT) {
    // Estado de Combate en Vivo con Snapshot Interpolation
    const state = networkClient.getInterpolatedState();

    if (state && state.players) {
      const activeIds = new Set();

      state.players.forEach((p) => {
        activeIds.add(p.id);

        if (p.id === networkClient.localPlayerId) {
          // --- BARCO DEL JUGADOR LOCAL ---
          localPlayerData = p;

          if (localPlayerShipMesh) {
            localPlayerShipMesh.position.x = p.x;
            localPlayerShipMesh.position.z = p.z;
            localPlayerShipMesh.rotation.y = p.rotation;

            // Cabeceo y balanceo sobre las olas del Nahuel Huapi
            const waveH = getLakeWaveHeight(p.x, p.z, timeSeconds);
            localPlayerShipMesh.position.y = waveH;
            localPlayerShipMesh.rotation.z = Math.sin(timeSeconds * 2.0) * 0.05 * (1 + Math.abs(p.speed) * 0.02);
            localPlayerShipMesh.rotation.x = -p.speed * 0.002;

            if (localShipFoamRing) {
              localShipFoamRing.position.set(p.x, waveH + 0.15, p.z);
              localShipFoamRing.rotation.z = timeSeconds * 0.5;
            }
          }

            // Deterioro Visual Dinámico del Barco Local
            const hpRatio = p.health / p.maxHealth;
            if (hpRatio <= 0.75 && hpRatio > 0.40) {
              if (Math.random() < 0.22) {
                vfxSystem.createShipDamageSmoke(localPlayerShipMesh.position, 1.0);
              }
            } else if (hpRatio <= 0.40 && p.health > 0) {
              if (Math.random() < 0.32) {
                vfxSystem.createShipDeckFire(localPlayerShipMesh.position);
              }
              // Escora e inclinación por entrada de agua
              localPlayerShipMesh.position.y -= (0.40 - hpRatio) * 2.2;
              localPlayerShipMesh.rotation.z += 0.08;
            }
          }

          // Actualización de HUD
          const hpPercent = Math.max(0, Math.min(100, (p.health / p.maxHealth) * 100));
          const hpBar = document.getElementById('hud-hp-bar');
          hpBar.style.width = `${hpPercent}%`;
          hpBar.className = 'progress-fill fill-health' + (hpPercent < 30 ? ' danger' : hpPercent < 60 ? ' warning' : '');
          document.getElementById('hud-hp-text').textContent = `${p.health} / ${p.maxHealth}`;

          // Barra de Sobrecalentamiento
          const heatBar = document.getElementById('hud-heat-bar');
          heatBar.style.width = `${p.cannonHeat}%`;
          document.getElementById('hud-heat-text').textContent = `${p.cannonHeat}%`;

          const alertDiv = document.getElementById('hud-overheat-alert');
          if (p.isOverheated) {
            alertDiv.style.display = 'block';
            document.getElementById('hud-overheat-countdown').textContent = Math.ceil(p.overheatTimer);
            if (Math.random() < 0.08) audioEngine.playOverheatHiss();
          } else {
            alertDiv.style.display = 'none';
          }

          // Brújula
          const degrees = Math.round(((p.rotation * 180) / Math.PI + 360) % 360);
          const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
          const dirStr = dirs[Math.round(degrees / 45) % 8];
          document.getElementById('hud-compass').textContent = `${dirStr} ${String(degrees).padStart(3, '0')}°`;

          document.getElementById('hud-score-value').textContent = p.score;
          document.getElementById('hud-sunk-value').textContent = p.shipsSunk;
          updateSpecialBombUI(p.specialsRemaining);

          // Comprobar si el barco fue destruido
          if (p.health <= 0) {
            document.getElementById('game-over-score').textContent = p.score;
            document.getElementById('game-over-sunk-count').textContent = `Barcos Hundidos: ${p.shipsSunk}`;
            switchState(STATES.GAMEOVER);
          }
        } else {
          // --- BARCOS ENEMIGOS (SNAPSHOT INTERPOLATED) ---
          let enemyObj = enemyShipMeshes.get(p.id);

          if (!enemyObj) {
            const mesh = buildShipMesh(p);
            const foam = createShipFoamRing();
            scene.add(mesh);
            scene.add(foam);
            enemyObj = { mesh, foamRing: foam };
            enemyShipMeshes.set(p.id, enemyObj);
          }

          // Posición y rotación perfectamente fluidas gracias a Snapshot Interpolation
          enemyObj.mesh.position.x = p.x;
          enemyObj.mesh.position.z = p.z;
          enemyObj.mesh.rotation.y = p.rotation;

          const waveH = getLakeWaveHeight(p.x, p.z, timeSeconds);
          enemyObj.mesh.position.y = waveH;
          enemyObj.mesh.rotation.z = Math.sin(timeSeconds * 2.0 + p.x) * 0.05;

          enemyObj.foamRing.position.set(p.x, waveH + 0.15, p.z);

          // Deterioro visual de barcos enemigos
          const enemyHpRatio = p.health / p.maxHealth;
          if (enemyHpRatio <= 0.75 && enemyHpRatio > 0.40) {
            if (Math.random() < 0.2) {
              vfxSystem.createShipDamageSmoke(enemyObj.mesh.position, 1.0);
            }
          } else if (enemyHpRatio <= 0.40 && p.health > 0) {
            if (Math.random() < 0.3) {
              vfxSystem.createShipDeckFire(enemyObj.mesh.position);
            }
            enemyObj.mesh.position.y -= (0.40 - enemyHpRatio) * 2.0;
            enemyObj.mesh.rotation.z += 0.08;
          }
        }
      });

      // Limpiar barcos desconectados
      for (const [id, enemyObj] of enemyShipMeshes.entries()) {
        if (!activeIds.has(id)) {
          scene.remove(enemyObj.mesh);
          scene.remove(enemyObj.foamRing);
          enemyShipMeshes.delete(id);
        }
      }

      // Proyectiles (Balas de cañón)
      if (state.cannonballs) {
        const activeBallIds = new Set();
        const ballMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.3 });
        const specialBallMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });

        state.cannonballs.forEach((b) => {
          activeBallIds.add(b.id);
          let mesh = cannonballMeshes.get(b.id);
          if (!mesh) {
            mesh = new THREE.Mesh(
              new THREE.SphereGeometry(b.isSpecial ? 1.4 : 0.8, 8, 8),
              b.isSpecial ? specialBallMat : ballMat
            );
            scene.add(mesh);
            cannonballMeshes.set(b.id, mesh);
          }
          mesh.position.set(b.x, b.y, b.z);
        });

        for (const [id, mesh] of cannonballMeshes.entries()) {
          if (!activeBallIds.has(id)) {
            scene.remove(mesh);
            cannonballMeshes.delete(id);
          }
        }
      }

      // 4. Renderizado y Animación de Cofres Flotantes
      if (state.chests) {
        const activeChestIds = new Set();
        state.chests.forEach((c) => {
          activeChestIds.add(c.id);
          let chestObj = chestMeshes.get(c.id);
          if (!chestObj) {
            chestObj = createChestVisualMesh(c.type);
            scene.add(chestObj.group);
            chestMeshes.set(c.id, chestObj);
          }

          const waveH = getLakeWaveHeight(c.x, c.z, timeSeconds);
          chestObj.group.position.set(c.x, waveH + 0.3, c.z);
          chestObj.group.rotation.y = timeSeconds * 0.8;
          chestObj.beam.material.opacity = 0.35 + Math.sin(timeSeconds * 4.0 + c.id) * 0.15;
        });

        for (const [id, chestObj] of chestMeshes.entries()) {
          if (!activeChestIds.has(id)) {
            scene.remove(chestObj.group);
            chestMeshes.delete(id);
          }
        }
      }
    }

    // Cámara en 3ª persona detrás del barco del jugador
    if (localPlayerShipMesh && localPlayerData) {
      const heading = localPlayerData.rotation;
      const targetCamX = localPlayerData.x - Math.sin(heading) * 36;
      const targetCamZ = localPlayerData.z - Math.cos(heading) * 36;
      const targetCamY = 16;

      // Suavizado de cámara (Damping)
      camera.position.x += (targetCamX - camera.position.x) * (dt * 5.0);
      camera.position.y += (targetCamY - camera.position.y) * (dt * 5.0);
      camera.position.z += (targetCamZ - camera.position.z) * (dt * 5.0);

      cameraLookAt.set(
        localPlayerData.x + Math.sin(heading) * 12,
        localPlayerData.y + 3,
        localPlayerData.z + Math.cos(heading) * 12
      );
      camera.lookAt(cameraLookAt);
    }
  }

  renderer.render(scene, camera);
}

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  initThree();
});
