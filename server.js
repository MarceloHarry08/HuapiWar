#!/usr/bin/env node
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;
const TICK_RATE = 25; // 25 updates per second (40ms per tick)
const MAP_RADIUS = 750; // Radius of Lake Nahuel Huapi combat arena

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));
app.use('/vendor/tone', express.static(path.join(__dirname, 'node_modules/tone/build')));
app.use('/vendor/howler', express.static(path.join(__dirname, 'node_modules/howler/dist')));
app.use('/vendor/socket.io', express.static(path.join(__dirname, 'node_modules/socket.io/client-dist')));
app.use('/vendor/nipplejs', express.static(path.join(__dirname, 'node_modules/nipplejs/dist')));

// -------------------------------------------------------------
// Database Initialization (SQLite)
// -------------------------------------------------------------
const db = new sqlite3.Database(path.join(__dirname, 'huapi_war.db'), (err) => {
  if (err) {
    console.error('[-] Error al conectar con la base de datos SQLite:', err.message);
  } else {
    console.log('[+] Base de datos SQLite conectada correctamente: huapi_war.db');
  }
});

db.serialize(() => {
  // Table for saved ships
  db.run(`
    CREATE TABLE IF NOT EXISTS saved_ships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      chassis TEXT NOT NULL,
      faction TEXT NOT NULL,
      cannon TEXT NOT NULL,
      special_weapon TEXT NOT NULL,
      hud_color TEXT NOT NULL,
      ship_color TEXT DEFAULT '#4a2b13',
      lantern_color TEXT DEFAULT '#ffd166',
      has_lanterns INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migraciones para bases de datos existentes
  db.run(`ALTER TABLE saved_ships ADD COLUMN ship_color TEXT DEFAULT '#4a2b13'`, () => {});
  db.run(`ALTER TABLE saved_ships ADD COLUMN lantern_color TEXT DEFAULT '#ffd166'`, () => {});
  db.run(`ALTER TABLE saved_ships ADD COLUMN has_lanterns INTEGER DEFAULT 1`, () => {});

  // Table for global leaderboard
  db.run(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      ships_sunk INTEGER NOT NULL,
      ship_name TEXT,
      faction TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default leaderboard entries if empty
  db.get('SELECT COUNT(*) as count FROM leaderboard', (err, row) => {
    if (!err && row && row.count === 0) {
      const stmt = db.prepare(`
        INSERT INTO leaderboard (player_name, score, ships_sunk, ship_name, faction)
        VALUES (?, ?, ?, ?, ?)
      `);
      const defaults = [
        ['Almirante Brown', 4500, 8, 'Hércules', 'Argentinos'],
        ['Capitán Barbanegra', 3800, 6, 'Venganza', 'Piratas'],
        ['Comodoro Nicole', 3100, 5, 'El Orgullo de Nicole', 'Portugueses'],
        ['Corsario Bouchard', 2750, 4, 'La Argentina', 'Argentinos'],
        ['Capitán Hook', 1900, 3, 'Jolly Roger', 'Piratas'],
      ];
      defaults.forEach((d) => stmt.run(d));
      stmt.finalize();
      console.log('[+] Leaderboard inicial poblado con capitanes destacados.');
    }
  });
});

// -------------------------------------------------------------
// REST API Endpoints
// -------------------------------------------------------------
app.get('/api/ships', (req, res) => {
  db.all('SELECT * FROM saved_ships ORDER BY created_at DESC LIMIT 30', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/ships', (req, res) => {
  const { name, chassis, faction, cannon, special_weapon, hud_color, ship_color, lantern_color, has_lanterns } = req.body;
  if (!name || !chassis || !faction) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para el barco.' });
  }
  const stmt = db.prepare(`
    INSERT INTO saved_ships (name, chassis, faction, cannon, special_weapon, hud_color, ship_color, lantern_color, has_lanterns)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    [
      name.trim(),
      chassis,
      faction,
      cannon || 'bronze',
      special_weapon || 'greek_fire',
      hud_color || '#00e5ff',
      ship_color || '#4a2b13',
      lantern_color || '#ffd166',
      has_lanterns !== undefined ? (has_lanterns ? 1 : 0) : 1,
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Barco guardado exitosamente.' });
    }
  );
  stmt.finalize();
});

app.get('/api/leaderboard', (req, res) => {
  db.all(
    'SELECT * FROM leaderboard ORDER BY score DESC, ships_sunk DESC LIMIT 25',
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/leaderboard', (req, res) => {
  const { player_name, score, ships_sunk, ship_name, faction } = req.body;
  if (!player_name || score === undefined) {
    return res.status(400).json({ error: 'Faltan datos para el registro de puntuación.' });
  }
  const stmt = db.prepare(`
    INSERT INTO leaderboard (player_name, score, ships_sunk, ship_name, faction)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    [
      player_name.trim(),
      parseInt(score, 10) || 0,
      parseInt(ships_sunk, 10) || 0,
      ship_name || 'Desconocido',
      faction || 'Argentinos',
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Puntuación registrada en la tabla global.' });
    }
  );
  stmt.finalize();
});

// -------------------------------------------------------------
// Multiplayer State & Physics Engine
// -------------------------------------------------------------
const activePlayers = new Map(); // socket.id -> Player
const waitingQueue = []; // Array of socket instances waiting in FIFO order
const cannonballs = []; // Active projectiles
const gameEvents = []; // Transient events for current tick

let projectileIdCounter = 1;

// Island obstacles inside Lake Nahuel Huapi (position x, z, radius)
const ISLANDS = [
  { x: 0, z: 0, radius: 65, name: 'Isla Victoria' },
  { x: 260, z: 220, radius: 45, name: 'Islote Huemul' },
  { x: -280, z: -180, radius: 40, name: 'Península Quetrihué' },
  { x: -180, z: 240, radius: 35, name: 'Islote Centinela' },
  { x: 300, z: -220, radius: 40, name: 'Punta Este' },
];

// Chassis specifications
const CHASSIS_SPECS = {
  corvette: { speed: 38, turnRate: 1.4, health: 90, drag: 0.96 },
  galleon: { speed: 28, turnRate: 0.9, health: 140, drag: 0.95 },
  brigantine: { speed: 34, turnRate: 1.2, health: 110, drag: 0.96 },
  frigate: { speed: 32, turnRate: 1.1, health: 120, drag: 0.96 },
  monitor: { speed: 26, turnRate: 0.85, health: 160, drag: 0.94 },
};

// -------------------------------------------------------------
// Floating Chests System (Cofres Flotantes de Salud y Bombas)
// -------------------------------------------------------------
const floatingChests = [];
let chestIdCounter = 1;

function generateChest(id) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 90 + Math.random() * (MAP_RADIUS - 160);
  const x = Number((Math.cos(angle) * dist).toFixed(1));
  const z = Number((Math.sin(angle) * dist).toFixed(1));

  // Verificar que no aparezca dentro de una isla
  for (const island of ISLANDS) {
    if (Math.hypot(x - island.x, z - island.z) < island.radius + 18) {
      return generateChest(id);
    }
  }

  return {
    id: id || chestIdCounter++,
    x,
    z,
    type: Math.random() > 0.4 ? 'health' : 'ammo', // 60% salud, 40% bombas especiales
    active: true,
    respawnTimer: 0,
  };
}

// Generar 18 cofres iniciales a lo largo del lago
for (let i = 0; i < 18; i++) {
  floatingChests.push(generateChest());
}

// Cooldown de embestidas entre barcos
const ramCooldowns = new Map();

function getRandomSpawn() {
  const angle = Math.random() * Math.PI * 2;
  const dist = 180 + Math.random() * (MAP_RADIUS - 280);
  return {
    x: Math.cos(angle) * dist,
    y: 0,
    z: Math.sin(angle) * dist,
    rotation: angle + Math.PI,
  };
}

class Player {
  constructor(socket, config) {
    this.id = socket.id;
    this.name = (config.name || 'Capitán del Huapi').substring(0, 24);
    this.chassis = config.chassis || 'brigantine';
    this.faction = config.faction || 'Argentinos';
    this.cannon = config.cannon || 'bronze';
    this.specialWeapon = config.special_weapon || config.specialWeapon || 'greek_fire';
    this.hudColor = config.hud_color || config.hudColor || '#00e5ff';
    this.shipColor = config.ship_color || config.shipColor || '#4a2b13';
    this.lanternColor = config.lantern_color || config.lanternColor || '#ffd166';
    this.hasLanterns = config.has_lanterns !== undefined ? Boolean(config.has_lanterns) : (config.hasLanterns !== undefined ? Boolean(config.hasLanterns) : true);

    const specs = CHASSIS_SPECS[this.chassis] || CHASSIS_SPECS.brigantine;
    this.maxHealth = specs.health;
    this.health = this.maxHealth;
    this.maxSpeed = specs.speed;
    this.turnRate = specs.turnRate;
    this.drag = specs.drag;

    const spawn = getRandomSpawn();
    this.x = spawn.x;
    this.y = 0;
    this.z = spawn.z;
    this.rotation = spawn.rotation; // heading in radians (Y-axis)
    this.speed = 0;
    this.steer = 0; // -1 left, 1 right
    this.throttle = 0; // -1 reverse, 1 forward

    // Combat State
    this.score = 0;
    this.shipsSunk = 0;
    this.specialsRemaining = 3;

    // Cannon Overheat System
    // Continuous firing for 10s -> 15s overheat lockout
    this.cannonHeat = 0; // 0 to 100
    this.isOverheated = false;
    this.overheatTimer = 0; // remaining seconds of lockout
    this.lastFireTime = 0;
    this.fireCooldown = 0.35; // seconds between shots
    this.isFiring = false;

    this.inputs = {
      forward: 0,
      steer: 0,
      firing: false,
      fireSpecial: false,
    };
  }

  update(dt) {
    if (this.health <= 0) return;

    // Movement physics
    const targetSpeed = this.inputs.forward * this.maxSpeed;
    if (this.inputs.forward !== 0) {
      this.speed += (targetSpeed - this.speed) * (dt * 2.5);
    } else {
      this.speed *= Math.pow(this.drag, dt * 60);
    }

    // Steering (effective when moving)
    const steerEff = Math.max(0.2, Math.min(1.0, Math.abs(this.speed) / (this.maxSpeed * 0.4)));
    this.rotation += this.inputs.steer * this.turnRate * steerEff * dt;

    // Translate based on heading
    this.x += Math.sin(this.rotation) * this.speed * dt;
    this.z += Math.cos(this.rotation) * this.speed * dt;

    // Arena lake boundary clamping
    const distFromCenter = Math.hypot(this.x, this.z);
    if (distFromCenter > MAP_RADIUS) {
      const angle = Math.atan2(this.z, this.x);
      this.x = Math.cos(angle) * MAP_RADIUS;
      this.z = Math.sin(angle) * MAP_RADIUS;
      this.speed *= -0.3; // bounce off lake shore
    }

    // Island collision check
    for (const island of ISLANDS) {
      const d = Math.hypot(this.x - island.x, this.z - island.z);
      if (d < island.radius + 6) {
        const nx = (this.x - island.x) / d;
        const nz = (this.z - island.z) / d;
        this.x = island.x + nx * (island.radius + 6);
        this.z = island.z + nz * (island.radius + 6);
        this.speed *= -0.2;
      }
    }

    // Cannon Overheat & Cooling logic
    if (this.isOverheated) {
      this.overheatTimer -= dt;
      this.cannonHeat = Math.max(0, (this.overheatTimer / 15.0) * 100);
      if (this.overheatTimer <= 0) {
        this.isOverheated = false;
        this.cannonHeat = 0;
      }
    } else {
      if (this.inputs.firing) {
        // Continuous firing builds 10% per second (10s total to reach 100%)
        this.cannonHeat = Math.min(100, this.cannonHeat + dt * 10.0);
        if (this.cannonHeat >= 100) {
          this.isOverheated = true;
          this.overheatTimer = 15.0; // 15 seconds lockout
          gameEvents.push({
            type: 'player_overheated',
            playerId: this.id,
          });
        }
      } else {
        // Cool down at 15% per second when not firing
        this.cannonHeat = Math.max(0, this.cannonHeat - dt * 15.0);
      }
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      chassis: this.chassis,
      faction: this.faction,
      cannon: this.cannon,
      specialWeapon: this.specialWeapon,
      hudColor: this.hudColor,
      shipColor: this.shipColor,
      lanternColor: this.lanternColor,
      hasLanterns: this.hasLanterns,
      x: Number(this.x.toFixed(2)),
      y: Number(this.y.toFixed(2)),
      z: Number(this.z.toFixed(2)),
      rotation: Number(this.rotation.toFixed(3)),
      speed: Number(this.speed.toFixed(2)),
      health: Math.max(0, Math.round(this.health)),
      maxHealth: this.maxHealth,
      cannonHeat: Math.round(this.cannonHeat),
      isOverheated: this.isOverheated,
      overheatTimer: Number(this.overheatTimer.toFixed(1)),
      specialsRemaining: this.specialsRemaining,
      score: this.score,
      shipsSunk: this.shipsSunk,
    };
  }
}

// -------------------------------------------------------------
// Socket.io Connection & Queue System
// -------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`[*] Nuevo cliente conectado: ${socket.id}`);

  // Send initial static lake configuration
  socket.emit('world:init', {
    mapRadius: MAP_RADIUS,
    islands: ISLANDS,
    maxPlayers: MAX_PLAYERS,
  });

  // Client requests to join combat with a chosen ship configuration
  socket.on('player:join', (shipConfig = {}) => {
    // If player is already active, ignore
    if (activePlayers.has(socket.id)) return;

    // Check if waiting in queue already
    const queueIndex = waitingQueue.findIndex((s) => s.id === socket.id);
    if (queueIndex !== -1) {
      socket.emit('queue:joined', { position: queueIndex + 1 });
      return;
    }

    // Room limit check (Max 10 players)
    if (activePlayers.size >= MAX_PLAYERS) {
      // Put in queue
      socket.shipConfig = shipConfig;
      waitingQueue.push(socket);
      const position = waitingQueue.length;
      console.log(`[!] Sala llena (${activePlayers.size}/${MAX_PLAYERS}). Jugador ${socket.id} colocado en la cola, posición ${position}`);
      socket.emit('queue:joined', { position });
      return;
    }

    // Spawn player into active match
    spawnPlayer(socket, shipConfig);
  });

  // Inputs received from client
  socket.on('player:input', (inputData) => {
    const player = activePlayers.get(socket.id);
    if (!player || player.health <= 0) return;

    if (typeof inputData.forward === 'number') player.inputs.forward = Math.max(-1, Math.min(1, inputData.forward));
    if (typeof inputData.steer === 'number') player.inputs.steer = Math.max(-1, Math.min(1, inputData.steer));
    if (typeof inputData.firing === 'boolean') player.inputs.firing = inputData.firing;
  });

  // Fire normal cannons (broadside or forward based on side)
  socket.on('player:fire', (data = {}) => {
    const player = activePlayers.get(socket.id);
    if (!player || player.health <= 0 || player.isOverheated) return;

    const now = Date.now() / 1000;
    if (now - player.lastFireTime < player.fireCooldown) return;
    player.lastFireTime = now;

    // Fire dual cannonballs left and right (broadside) or aimed
    const side = data.side || 'both'; // 'left', 'right', 'both'
    const forwardAngle = player.rotation;
    const baseSpeed = 95;

    const spawnCannonball = (angleOffset, offsetX, offsetZ) => {
      const shotAngle = forwardAngle + angleOffset;
      const vx = Math.sin(shotAngle) * baseSpeed + Math.sin(forwardAngle) * (player.speed * 0.5);
      const vz = Math.cos(shotAngle) * baseSpeed + Math.cos(forwardAngle) * (player.speed * 0.5);
      const vy = 12 + Math.random() * 4;

      cannonballs.push({
        id: projectileIdCounter++,
        ownerId: player.id,
        x: player.x + offsetX,
        y: 2.2,
        z: player.z + offsetZ,
        vx,
        vy,
        vz,
        radius: 1.5,
        damage: 12 + Math.floor(Math.random() * 6), // Daño moderado para duelos estratégicos
        isSpecial: false,
        specialType: null,
        lifetime: 3.8,
      });
    };

    if (side === 'both' || side === 'left') {
      // Left broadside
      const leftAngle = forwardAngle - Math.PI / 2;
      spawnCannonball(-Math.PI / 2, Math.sin(leftAngle) * 3, Math.cos(leftAngle) * 3);
    }
    if (side === 'both' || side === 'right') {
      // Right broadside
      const rightAngle = forwardAngle + Math.PI / 2;
      spawnCannonball(Math.PI / 2, Math.sin(rightAngle) * 3, Math.cos(rightAngle) * 3);
    }

    // Transient event for client sound / VFX triggers
    gameEvents.push({
      type: 'cannon_fire',
      playerId: player.id,
      side: side,
      x: player.x,
      y: player.y,
      z: player.z,
    });
  });

  // Fire special bomb (limited to 3 per life)
  socket.on('player:fire_special', (data = {}) => {
    const player = activePlayers.get(socket.id);
    if (!player || player.health <= 0 || player.specialsRemaining <= 0) return;

    player.specialsRemaining--;
    const forwardAngle = player.rotation;
    const specialType = player.specialWeapon;
    const baseSpeed = specialType === 'torpedo' ? 120 : 85;

    // Aimed forward
    const vx = Math.sin(forwardAngle) * baseSpeed;
    const vz = Math.cos(forwardAngle) * baseSpeed;
    const vy = specialType === 'torpedo' ? 0 : 18;

    let damage = 55;
    let radius = 3.5;
    if (specialType === 'seismic_charge') {
      damage = 80;
      radius = 6.0;
    } else if (specialType === 'cluster_bomb') {
      damage = 45;
      radius = 4.0;
    } else if (specialType === 'greek_fire') {
      damage = 60;
      radius = 5.0;
    }

    cannonballs.push({
      id: projectileIdCounter++,
      ownerId: player.id,
      x: player.x + Math.sin(forwardAngle) * 8,
      y: specialType === 'torpedo' ? 0.2 : 3.0,
      z: player.z + Math.cos(forwardAngle) * 8,
      vx,
      vy,
      vz,
      radius,
      damage,
      isSpecial: true,
      specialType,
      lifetime: specialType === 'torpedo' ? 4.0 : 4.5,
    });

    gameEvents.push({
      type: 'special_fire',
      playerId: player.id,
      specialType,
      x: player.x,
      y: player.y,
      z: player.z,
      remaining: player.specialsRemaining,
    });

    socket.emit('player:special_used', { remaining: player.specialsRemaining });
  });

  // Player disconnect
  socket.on('disconnect', () => {
    console.log(`[-] Cliente desconectado: ${socket.id}`);

    // If was active player, remove and check queue
    if (activePlayers.has(socket.id)) {
      activePlayers.delete(socket.id);
      io.emit('player:left', { id: socket.id });
      promoteNextFromQueue();
    } else {
      // If was in queue, remove from queue
      const qIdx = waitingQueue.findIndex((s) => s.id === socket.id);
      if (qIdx !== -1) {
        waitingQueue.splice(qIdx, 1);
        updateQueuePositions();
      }
    }
  });
});

function spawnPlayer(socket, shipConfig) {
  const player = new Player(socket, shipConfig);
  activePlayers.set(socket.id, player);

  console.log(`[+] Jugador ingresó al combate: ${player.name} (${player.faction} - ${player.chassis}). Activos: ${activePlayers.size}/${MAX_PLAYERS}`);

  // Notify the joining player
  socket.emit('match:joined', {
    player: player.toJSON(),
    maxPlayers: MAX_PLAYERS,
    activeCount: activePlayers.size,
  });

  // Notify other players
  socket.broadcast.emit('player:entered', player.toJSON());
}

function promoteNextFromQueue() {
  if (waitingQueue.length > 0 && activePlayers.size < MAX_PLAYERS) {
    const nextSocket = waitingQueue.shift();
    if (nextSocket && nextSocket.connected) {
      console.log(`[>>>] Promoviendo jugador ${nextSocket.id} de la cola al combate en el lago.`);
      spawnPlayer(nextSocket, nextSocket.shipConfig || {});
      updateQueuePositions();
    } else {
      // If disconnected while in queue, recurse
      promoteNextFromQueue();
    }
  }
}

function updateQueuePositions() {
  waitingQueue.forEach((s, idx) => {
    if (s.connected) {
      s.emit('queue:update', { position: idx + 1, totalInQueue: waitingQueue.length });
    }
  });
}

// -------------------------------------------------------------
// Server Game Loop (25 Ticks per second)
// -------------------------------------------------------------
let lastTickTime = Date.now();

setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - lastTickTime) / 1000);
  lastTickTime = now;

  // 1. Update all active ships
  for (const player of activePlayers.values()) {
    player.update(dt);
  }

  // 2. Update cannonballs and check hit detection
  for (let i = cannonballs.length - 1; i >= 0; i--) {
    const ball = cannonballs[i];

    // Physics
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    if (ball.specialType !== 'torpedo') {
      ball.vy -= 22 * dt; // Gravity
      ball.y += ball.vy * dt;
    }
    ball.lifetime -= dt;

    let hitOccurred = false;

    // Check hit against active players (excluding shooter)
    for (const target of activePlayers.values()) {
      if (target.id === ball.ownerId || target.health <= 0) continue;

      const dist = Math.hypot(ball.x - target.x, ball.z - target.z);
      // Rango de golpe ampliado y más generoso
      const hitThreshold = target.chassis === 'galleon' || target.chassis === 'monitor' ? 12.5 : 10.8;

      // Hit detected (rango vertical y horizontal amplio)
      if (dist < hitThreshold && ball.y <= 6.0 && ball.y >= -2.0) {
        hitOccurred = true;
        target.health = Math.max(0, target.health - ball.damage);

        const shooter = activePlayers.get(ball.ownerId);
        if (shooter) {
          shooter.score += 100;
          io.to(shooter.id).emit('combat:hit_confirmed', {
            targetId: target.id,
            damage: ball.damage,
            score: shooter.score,
          });
        }

        // Damage event broadcast for VFX (explosion & sound)
        gameEvents.push({
          type: 'cannon_hit',
          x: ball.x,
          y: Math.max(0.5, ball.y),
          z: ball.z,
          damage: ball.damage,
          isSpecial: ball.isSpecial,
          specialType: ball.specialType,
          targetId: target.id,
        });

        // Check if target ship sank
        if (target.health <= 0) {
          if (shooter) {
            shooter.score += 500;
            shooter.shipsSunk += 1;
            io.to(shooter.id).emit('combat:enemy_sunk', {
              sunkPlayerName: target.name,
              score: shooter.score,
              shipsSunk: shooter.shipsSunk,
            });
          }

          gameEvents.push({
            type: 'ship_sunk',
            playerId: target.id,
            playerName: target.name,
            killerId: ball.ownerId,
            x: target.x,
            z: target.z,
          });

          // Inform sunk player with final stats
          io.to(target.id).emit('combat:destroyed', {
            finalScore: target.score,
            shipsSunk: target.shipsSunk,
            shipName: target.name,
            faction: target.faction,
          });

          // Remove sunk player from active combat
          activePlayers.delete(target.id);
          promoteNextFromQueue();
        }
        break;
      }
    }

    // Splash into water or expired
    if (!hitOccurred && (ball.y <= 0 || ball.lifetime <= 0)) {
      if (ball.y <= 0.5) {
        gameEvents.push({
          type: 'water_splash',
          x: ball.x,
          z: ball.z,
          isSpecial: ball.isSpecial,
          specialType: ball.specialType,
        });
      }
      cannonballs.splice(i, 1);
    } else if (hitOccurred) {
      cannonballs.splice(i, 1);
    }
  }

  // 3. Sistema de Embestida / Colisión entre Barcos (30% de Daño a Ambos)
  const playerList = Array.from(activePlayers.values());
  for (let i = 0; i < playerList.length; i++) {
    for (let j = i + 1; j < playerList.length; j++) {
      const pA = playerList[i];
      const pB = playerList[j];
      if (pA.health <= 0 || pB.health <= 0) continue;

      const dist = Math.hypot(pA.x - pB.x, pA.z - pB.z);
      const collisionThreshold = 11.5;

      if (dist < collisionThreshold) {
        const pairKey = pA.id < pB.id ? `${pA.id}_${pB.id}` : `${pB.id}_${pA.id}`;
        const nowMs = Date.now();
        const lastRam = ramCooldowns.get(pairKey) || 0;

        if (nowMs - lastRam > 2500) { // Cooldown de 2.5s entre colisiones
          ramCooldowns.set(pairKey, nowMs);

          // 30% de daño estructural sobre la vida máxima de cada barco
          const dmgA = Math.round(pA.maxHealth * 0.30);
          const dmgB = Math.round(pB.maxHealth * 0.30);

          pA.health = Math.max(0, pA.health - dmgA);
          pB.health = Math.max(0, pB.health - dmgB);

          // Separación física por rebote
          const nx = dist > 0.01 ? (pB.x - pA.x) / dist : 1;
          const nz = dist > 0.01 ? (pB.z - pA.z) / dist : 0;
          pA.x -= nx * 6.5;
          pA.z -= nz * 6.5;
          pB.x += nx * 6.5;
          pB.z += nz * 6.5;

          pA.speed *= -0.5;
          pB.speed *= -0.5;

          gameEvents.push({
            type: 'ship_collision',
            x: Number(((pA.x + pB.x) * 0.5).toFixed(1)),
            z: Number(((pA.z + pB.z) * 0.5).toFixed(1)),
            playerA: pA.name,
            playerB: pB.name,
            damageA: dmgA,
            damageB: dmgB,
          });

          // Verificar si alguno de los barcos se hundió por la colisión
          [pA, pB].forEach((ship, idx) => {
            const other = idx === 0 ? pB : pA;
            if (ship.health <= 0) {
              other.score += 500;
              other.shipsSunk += 1;
              io.to(other.id).emit('combat:enemy_sunk', {
                sunkPlayerName: ship.name,
                score: other.score,
                shipsSunk: other.shipsSunk,
              });
              gameEvents.push({
                type: 'ship_sunk',
                playerId: ship.id,
                playerName: ship.name,
                killerId: other.id,
                x: ship.x,
                z: ship.z,
              });
              io.to(ship.id).emit('combat:destroyed', {
                finalScore: ship.score,
                shipsSunk: ship.shipsSunk,
                shipName: ship.name,
                faction: ship.faction,
              });
              activePlayers.delete(ship.id);
              promoteNextFromQueue();
            }
          });
        }
      }
    }
  }

  // 4. Actualizar Cofres Flotantes y Detección de Recogida
  for (const chest of floatingChests) {
    if (!chest.active) {
      chest.respawnTimer -= dt;
      if (chest.respawnTimer <= 0) {
        const replacement = generateChest(chest.id);
        chest.x = replacement.x;
        chest.z = replacement.z;
        chest.type = replacement.type;
        chest.active = true;
      }
      continue;
    }

    // Verificar si algún barco pasa sobre el cofre
    for (const player of activePlayers.values()) {
      if (player.health <= 0) continue;
      const d = Math.hypot(player.x - chest.x, player.z - chest.z);
      if (d < 8.5) {
        chest.active = false;
        chest.respawnTimer = 24.0; // Reaparece en 24 segundos

        if (chest.type === 'health') {
          const healAmount = 35;
          player.health = Math.min(player.maxHealth, player.health + healAmount);
          gameEvents.push({
            type: 'chest_collected',
            subType: 'health',
            playerId: player.id,
            playerName: player.name,
            x: chest.x,
            z: chest.z,
            amount: healAmount,
            currentHealth: player.health,
          });
        } else {
          player.specialsRemaining = Math.min(3, player.specialsRemaining + 1);
          gameEvents.push({
            type: 'chest_collected',
            subType: 'ammo',
            playerId: player.id,
            playerName: player.name,
            x: chest.x,
            z: chest.z,
            specialsRemaining: player.specialsRemaining,
          });
        }
        break;
      }
    }
  }

  // 5. Broadcast Snapshot to all connected clients
  const snapshot = {
    timestamp: now,
    players: Array.from(activePlayers.values()).map((p) => p.toJSON()),
    cannonballs: cannonballs.map((b) => ({
      id: b.id,
      x: Number(b.x.toFixed(2)),
      y: Number(b.y.toFixed(2)),
      z: Number(b.z.toFixed(2)),
      isSpecial: b.isSpecial,
      specialType: b.specialType,
    })),
    chests: floatingChests.filter((c) => c.active).map((c) => ({
      id: c.id,
      x: c.x,
      z: c.z,
      type: c.type,
    })),
    events: [...gameEvents],
  };

  io.emit('state:snapshot', snapshot);

  // Clear transient events for next tick
  gameEvents.length = 0;
}, 1000 / TICK_RATE);

// -------------------------------------------------------------
// Start Server
// -------------------------------------------------------------
server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================================');
  console.log('       HUAPI WAR - SERVIDOR DE COMBATE NAVAL');
  console.log('            Ambientado en el Lago Nahuel Huapi');
  console.log('========================================================');
  console.log(`[+] Servidor web y WebSocket activo en: http://localhost:${PORT}`);
  console.log(`[+] Capacidad máxima de la sala: ${MAX_PLAYERS} jugadores simultáneos.`);
  console.log(`[+] Sistema de cola FIFO y Snapshot Interpolation: ACTIVADO (25 Hz).`);
  console.log('========================================================');
});
