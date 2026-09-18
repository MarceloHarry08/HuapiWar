/**
 * HUAPI WAR - Gestor de Red y Motor de Snapshot Interpolation (Socket.io)
 * Maneja el sistema de cola (límite de 10 jugadores), sincronización autoritativa
 * e interpolación de posiciones/rotaciones entre los dos últimos snapshots.
 */

class NetworkClient {
  constructor() {
    this.socket = null;
    this.localPlayerId = null;
    this.isInQueue = false;
    this.queuePosition = 0;
    this.isInMatch = false;

    // Búfer de Snapshot Interpolation
    this.snapshots = [];
    this.maxSnapshots = 40;
    this.interpolationDelay = 100; // ms de búfer de interpolación
    this.serverTimeOffset = 0;

    // Callbacks del juego
    this.onMatchJoined = null;
    this.onQueueStatus = null;
    this.onPlayerLeft = null;
    this.onEvent = null;
  }

  connect() {
    if (this.socket) return;

    // Conectar a Socket.io en el host actual
    const ioFunc = window.io;
    if (!ioFunc) {
      console.error('[-] Socket.io client no está disponible en window.io');
      return;
    }

    this.socket = ioFunc({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.localPlayerId = this.socket.id;
      console.log(`[+] Conectado al servidor de HUAPI WAR con ID: ${this.socket.id}`);
    });

    // 1. Manejo del Sistema de Cola de Espera (Requisito: Límite 10 jugadores)
    this.socket.on('queue:joined', (data) => {
      this.isInQueue = true;
      this.isInMatch = false;
      this.queuePosition = data.position;
      console.log(`[!] En cola de espera. Posición: ${this.queuePosition}`);
      if (this.onQueueStatus) {
        this.onQueueStatus({ inQueue: true, position: this.queuePosition });
      }
    });

    this.socket.on('queue:update', (data) => {
      this.queuePosition = data.position;
      if (this.onQueueStatus) {
        this.onQueueStatus({ inQueue: true, position: this.queuePosition });
      }
    });

    // 2. Ingreso Exitoso a la Partida
    this.socket.on('match:joined', (data) => {
      this.isInQueue = false;
      this.isInMatch = true;
      console.log('[+] ¡Ingreso concedido al lago Nahuel Huapi!');
      if (this.onQueueStatus) {
        this.onQueueStatus({ inQueue: false });
      }
      if (this.onMatchJoined) {
        this.onMatchJoined(data);
      }
    });

    // 3. Recepción de Snapshots de Estado (25 Hz)
    this.socket.on('state:snapshot', (snapshot) => {
      const now = Date.now();

      // Estimar desfase de reloj cliente-servidor en el primer snapshot
      if (this.snapshots.length === 0) {
        this.serverTimeOffset = now - snapshot.timestamp;
      }

      this.snapshots.push(snapshot);
      if (this.snapshots.length > this.maxSnapshots) {
        this.snapshots.shift();
      }

      // Procesar eventos inmediatos del snapshot (fogonazos, salpicaduras, golpes)
      if (snapshot.events && snapshot.events.length > 0 && this.onEvent) {
        snapshot.events.forEach((evt) => this.onEvent(evt));
      }
    });

    this.socket.on('player:left', (data) => {
      if (this.onPlayerLeft) this.onPlayerLeft(data.id);
    });

    this.socket.on('disconnect', () => {
      console.log('[-] Desconectado del servidor.');
      this.isInMatch = false;
      this.isInQueue = false;
    });
  }

  joinMatch(shipConfig) {
    if (!this.socket) this.connect();
    this.socket.emit('player:join', shipConfig);
  }

  sendInput(inputData) {
    if (!this.socket || !this.isInMatch) return;
    this.socket.emit('player:input', inputData);
  }

  fireCannons(side = 'both') {
    if (!this.socket || !this.isInMatch) return;
    this.socket.emit('player:fire', { side });
  }

  fireSpecial() {
    if (!this.socket || !this.isInMatch) return;
    this.socket.emit('player:fire_special');
  }

  /**
   * MOTOR DE SNAPSHOT INTERPOLATION (MITIGACIÓN DE LAG)
   * Devuelve el estado interpolado para el tiempo de renderizado actual.
   */
  getInterpolatedState() {
    if (this.snapshots.length === 0) return null;

    // Si solo hay un snapshot, devolverlo directamente
    if (this.snapshots.length === 1) {
      return this.snapshots[0];
    }

    // Calcular el tiempo de renderizado objetivo con el retraso de interpolación
    const renderTime = Date.now() - this.serverTimeOffset - this.interpolationDelay;

    // Encontrar los dos snapshots (s0 y s1) que encierran a renderTime
    let s0 = null;
    let s1 = null;

    for (let i = 0; i < this.snapshots.length - 1; i++) {
      if (this.snapshots[i].timestamp <= renderTime && this.snapshots[i + 1].timestamp >= renderTime) {
        s0 = this.snapshots[i];
        s1 = this.snapshots[i + 1];
        break;
      }
    }

    // Si renderTime es más reciente que el último snapshot (pérdida de paquetes temporal),
    // tomamos los dos últimos y extrapolamos ligeramente
    if (!s0 || !s1) {
      s0 = this.snapshots[this.snapshots.length - 2];
      s1 = this.snapshots[this.snapshots.length - 1];
    }

    const timeDelta = s1.timestamp - s0.timestamp;
    const alpha = timeDelta > 0 ? Math.max(0, Math.min(1.2, (renderTime - s0.timestamp) / timeDelta)) : 1.0;

    // Interpolación de Jugadores
    const interpolatedPlayers = [];
    const playerMap0 = new Map(s0.players.map((p) => [p.id, p]));

    s1.players.forEach((p1) => {
      const p0 = playerMap0.get(p1.id);
      if (!p0) {
        interpolatedPlayers.push(p1);
        return;
      }

      // Interpolación lineal de posición (Lerp)
      const x = p0.x + (p1.x - p0.x) * alpha;
      const y = p0.y + (p1.y - p0.y) * alpha;
      const z = p0.z + (p1.z - p0.z) * alpha;

      // Interpolación angular del rumbo de timón (evitando el salto de 360 grados)
      let diff = p1.rotation - p0.rotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      const rotation = p0.rotation + diff * alpha;

      interpolatedPlayers.push({
        ...p1,
        x,
        y,
        z,
        rotation,
      });
    });

    // Proyectiles y Cofres Flotantes
    return {
      timestamp: renderTime,
      players: interpolatedPlayers,
      cannonballs: s1.cannonballs,
      chests: s1.chests || [],
    };
  }
}

export const networkClient = new NetworkClient();
