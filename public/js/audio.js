import * as THREE from 'three';

/**
 * HUAPI WAR - Sistema de Audio Dinámico
 * 1. Tone.js: Secuencias musicales procedurales con base de Classic Rock / Heavy Metal.
 * 2. Howler.js: Audio espacial 3D estéreo posicional para cañones, impactos y explosiones.
 */

const camDir = new THREE.Vector3();

class SoundEngine {
  constructor() {
    this.isInitialized = false;
    this.musicPlaying = false;
    this.listenerPosition = { x: 0, y: 0, z: 0 };

    // Objetos Tone.js
    this.guitarSynth = null;
    this.bassSynth = null;
    this.drumKick = null;
    this.drumSnare = null;
    this.drumHihat = null;
    this.musicLoop = null;

    // Bancos Howler
    this.soundEffects = {};
  }

  /**
   * Carga Tone.js dinámicamente solo cuando el usuario interactúa con la página
   */
  async loadTone() {
    if (window.Tone) return window.Tone;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/tone/Tone.js';
      script.onload = () => resolve(window.Tone);
      script.onerror = (err) => {
        console.warn('[-] No se pudo cargar Tone.js local, intentando CDN...', err);
        const cdnScript = document.createElement('script');
        cdnScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js';
        cdnScript.onload = () => resolve(window.Tone);
        cdnScript.onerror = reject;
        document.head.appendChild(cdnScript);
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Inicializa Web Audio, Tone.js y Howler tras la primera interacción del usuario
   */
  async init() {
    if (this.isInitialized) return;

    try {
      await this.loadTone();
      if (window.Tone) {
        await window.Tone.start();
        console.log('[+] Tone.js audio context iniciado correctamente tras el gesto del usuario.');
        this.setupProceduralRockMusic();
      }

      this.setupHowlerSoundEffects();
      this.isInitialized = true;
    } catch (err) {
      console.warn('[-] Advertencia al inicializar audio:', err);
    }
  }

  /**
   * Configura la banda sonora procedural de Classic Rock / Heavy Metal con Tone.js
   */
  setupProceduralRockMusic() {
    const Tone = window.Tone;
    if (!Tone) return;

    // Distorsión pesada para la guitarra rítmica
    const dist = new Tone.Distortion(0.4).toDestination();
    const chorus = new Tone.Chorus(4, 2.5, 0.5).connect(dist);
    dist.wet.value = 0.6;

    // Sintetizador de Guitarra Eléctrica (Power Chords)
    this.guitarSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.02, decay: 0.25, sustain: 0.4, release: 0.6 },
    }).connect(chorus);
    this.guitarSynth.volume.value = -12;

    // Bajo de Rock Galopante (Heavy Metal Bass)
    const bassDrive = new Tone.Chebyshev(2).toDestination();
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: 'square' },
      filter: { Q: 3, type: 'lowpass', frequency: 750 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
    }).connect(bassDrive);
    this.bassSynth.volume.value = -8;

    // Batería Acústica de Rock
    this.drumKick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 5,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.3 },
    }).toDestination();
    this.drumKick.volume.value = -6;

    this.drumSnare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.005, decay: 0.18, sustain: 0 },
    }).toDestination();
    this.drumSnare.volume.value = -10;

    // Riff de Classic Rock / Metal en D Menor (Progresión D5 - F5 - G5 - C5)
    Tone.Transport.bpm.value = 132;

    const chords = [
      ['D3', 'A3', 'D4'],
      ['D3', 'A3', 'D4'],
      ['F3', 'C4', 'F4'],
      ['G3', 'D4', 'G4'],
      ['D3', 'A3', 'D4'],
      ['C3', 'G3', 'C4'],
      ['A2', 'E3', 'A3'],
      ['D3', 'A3', 'D4'],
    ];

    const bassNotes = [
      'D2', 'D2', 'D2', 'D2',
      'F2', 'F2', 'G2', 'G2',
      'D2', 'D2', 'D2', 'D2',
      'C2', 'C2', 'A1', 'C2',
    ];

    let step = 0;
    this.musicLoop = new Tone.Loop((time) => {
      // Ritmo de batería 4/4 contundente
      const beatInBar = step % 8;
      if (beatInBar === 0 || beatInBar === 4) {
        this.drumKick.triggerAttackRelease('C1', '8n', time);
      }
      if (beatInBar === 2 || beatInBar === 6) {
        this.drumSnare.triggerAttackRelease('16n', time);
      }

      // Bajo galopante en corcheas
      const bassIndex = step % bassNotes.length;
      this.bassSynth.triggerAttackRelease(bassNotes[bassIndex], '16n', time);

      // Riff de guitarra rítmica en tiempos clave
      if (beatInBar === 0 || beatInBar === 3 || beatInBar === 6) {
        const chordIndex = Math.floor(step / 4) % chords.length;
        this.guitarSynth.triggerAttackRelease(chords[chordIndex], '8n', time);
      }

      step++;
    }, '8n');
  }

  startBattleMusic() {
    if (!window.Tone || this.musicPlaying) return;
    try {
      window.Tone.Transport.start();
      if (this.musicLoop) this.musicLoop.start(0);
      this.musicPlaying = true;
      console.log('[+] Música de combate Tone.js iniciada.');
    } catch (e) {
      console.warn('[-] No se pudo iniciar música:', e);
    }
  }

  stopBattleMusic() {
    if (!window.Tone || !this.musicPlaying) return;
    try {
      window.Tone.Transport.stop();
      this.musicPlaying = false;
    } catch (e) {
      console.warn(e);
    }
  }

  /**
   * Generación y configuración de buffers de sonido para Howler.js
   */
  setupHowlerSoundEffects() {
    // Si Howler está disponible, usamos Web Audio API sintetizado para garantizar que
    // todos los sonidos funcionen sin depender de archivos de audio externos ausentes.
    const audioCtx = (window.Howler && window.Howler.ctx) ? window.Howler.ctx : new (window.AudioContext || window.webkitAudioContext)();
    this.audioCtx = audioCtx;
  }

  /**
   * Actualiza la posición y orientación de la cámara para el cálculo de audio espacial 3D
   */
  updateListener(camera) {
    if (!camera) return;
    this.listenerPosition.x = camera.position.x;
    this.listenerPosition.y = camera.position.y;
    this.listenerPosition.z = camera.position.z;

    if (window.Howler && window.Howler.pos) {
      window.Howler.pos(camera.position.x, camera.position.y, camera.position.z);
      camera.getWorldDirection(camDir);
      if (window.Howler.orientation) {
        window.Howler.orientation(camDir.x, camDir.y, camDir.z, 0, 1, 0);
      }
    }
  }

  /**
   * Disparo de Cañón con Audio Espacial 3D
   */
  playCannonShot(sourcePos) {
    this.playSpatialSound({
      pos: sourcePos,
      freqStart: 180,
      freqEnd: 35,
      duration: 0.55,
      type: 'sawtooth',
      noiseAmount: 0.7,
      volume: 0.85,
    });
  }

  /**
   * Impacto de Cañonazo en el Casco
   */
  playHullHit(sourcePos) {
    this.playSpatialSound({
      pos: sourcePos,
      freqStart: 240,
      freqEnd: 60,
      duration: 0.4,
      type: 'triangle',
      noiseAmount: 0.85,
      volume: 0.9,
    });
  }

  /**
   * Salpicadura en el agua
   */
  playWaterSplash(sourcePos) {
    this.playSpatialSound({
      pos: sourcePos,
      freqStart: 380,
      freqEnd: 110,
      duration: 0.35,
      type: 'sine',
      noiseAmount: 0.6,
      volume: 0.6,
    });
  }

  /**
   * Estallido de Bomba Especial
   */
  playSpecialExplosion(sourcePos, specialType) {
    let freqStart = 260;
    let duration = 0.9;
    if (specialType === 'seismic_charge') {
      freqStart = 110;
      duration = 1.4;
    } else if (specialType === 'greek_fire') {
      freqStart = 320;
      duration = 0.8;
    }

    this.playSpatialSound({
      pos: sourcePos,
      freqStart,
      freqEnd: 25,
      duration,
      type: 'sawtooth',
      noiseAmount: 0.9,
      volume: 1.0,
    });
  }

  /**
   * Alarma de Sobrecalentamiento de Cañón (Silbido de vapor a presión)
   */
  playOverheatHiss() {
    if (!this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.3);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.55);
    } catch (e) {
      console.warn(e);
    }
  }

  /**
   * Sintetizador Espacial 3D con PannerNode estéreo y atenuación por distancia
   */
  playSpatialSound(opts) {
    if (!this.audioCtx) return;

    try {
      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      // Cálculo de distancia y atenuación estéreo
      let panX = 0;
      let gainVal = opts.volume || 0.7;

      if (opts.pos && this.listenerPosition) {
        const dx = opts.pos.x - this.listenerPosition.x;
        const dy = (opts.pos.y || 0) - this.listenerPosition.y;
        const dz = opts.pos.z - this.listenerPosition.z;
        const dist = Math.hypot(dx, dy, dz);

        // Atenuación por distancia (rango de 600 unidades)
        const distFactor = Math.max(0.05, Math.min(1.0, 1.0 - (dist / 700)));
        gainVal *= distFactor;

        // Panning estéreo aproximado
        panX = Math.max(-1.0, Math.min(1.0, dx / 80));
      }

      // Nodo de Ganancia
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(gainVal, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + opts.duration);

      // Nodo de Panning Estéreo
      let panner = null;
      if (ctx.createStereoPanner) {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(panX, now);
      }

      // Oscilador de tono bajo / punch
      const osc = ctx.createOscillator();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(opts.freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, now + opts.duration);

      // Generador de Ruido Blanco para el estruendo de la pólvora
      const bufferSize = ctx.sampleRate * opts.duration;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * (1.0 - (i / bufferSize));
      }

      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = noiseBuffer;

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime((opts.noiseAmount || 0.5) * gainVal, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + opts.duration);

      // Conexiones de la cadena de audio
      osc.connect(gainNode);
      noiseNode.connect(noiseGain);

      if (panner) {
        gainNode.connect(panner);
        noiseGain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        gainNode.connect(ctx.destination);
        noiseGain.connect(ctx.destination);
      }

      osc.start(now);
      noiseNode.start(now);
      osc.stop(now + opts.duration + 0.05);
      noiseNode.stop(now + opts.duration + 0.05);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }
}

export const audioEngine = new SoundEngine();
