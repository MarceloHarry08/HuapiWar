const fs = require('fs');
const path = require('path');

/**
 * HUAPI WAR - Generador de Banda Sonora Clásica Relajante
 * Sintetiza 5 obras clásicas para el combate con Howler.js:
 * 1. Beethoven - Sonata Claro de Luna (Adagio Sostenuto)
 * 2. Erik Satie - Gymnopédie No. 1
 * 3. J.S. Bach - Preludio en Do Mayor (BWV 846)
 * 4. J.S. Bach - Aria para la Cuerda de Sol
 * 5. C. Saint-Saëns - El Cisne / Barcarola Náutica
 */

const SAMPLE_RATE = 44100;

// Conversor de nombre de nota / MIDI a frecuencia (Hz)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteToFreq(noteStr) {
  const match = noteStr.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!match) return 440;
  let name = match[1];
  const octave = parseInt(match[2], 10);
  if (name === 'Db') name = 'C#';
  if (name === 'Eb') name = 'D#';
  if (name === 'Gb') name = 'F#';
  if (name === 'Ab') name = 'G#';
  if (name === 'Bb') name = 'A#';
  const semitone = NOTE_NAMES.indexOf(name);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Estructura de AudioBuffer estéreo en memoria
class AudioBufferStereo {
  constructor(length) {
    this.length = length;
    this.left = new Float32Array(length);
    this.right = new Float32Array(length);
  }

  // Agrega una nota de piano acústico / arpa (percusivo armónico)
  addPianoNote(freq, startTime, duration, velocity = 0.7, pan = 0.0) {
    const startSample = Math.floor(startTime * SAMPLE_RATE);
    const endSample = Math.min(this.length, Math.floor((startTime + duration + 1.2) * SAMPLE_RATE));
    const totalSamples = endSample - startSample;
    if (totalSamples <= 0 || startSample >= this.length) return;

    const panL = Math.cos((pan + 1) * Math.PI / 4);
    const panR = Math.sin((pan + 1) * Math.PI / 4);

    const harmonics = [
      { mult: 1.0, amp: 1.0, decay: 1.0 },
      { mult: 2.0, amp: 0.48, decay: 1.4 },
      { mult: 3.0, amp: 0.22, decay: 1.9 },
      { mult: 4.0, amp: 0.12, decay: 2.6 },
      { mult: 5.0, amp: 0.05, decay: 3.2 },
      { mult: 6.0, amp: 0.02, decay: 3.8 }
    ];

    for (let i = 0; i < totalSamples; i++) {
      const idx = startSample + i;
      if (idx >= this.length) break;
      const t = i / SAMPLE_RATE;

      // Ataque suave y decaimiento exponencial natural de cuerda percutida
      const attack = Math.min(1.0, t / 0.008);
      let sample = 0;

      for (let h = 0; h < harmonics.length; h++) {
        const harm = harmonics[h];
        const hFreq = freq * harm.mult;
        if (hFreq > 14000) continue;
        const decayRate = (0.75 + harm.decay * 0.45) / Math.sqrt(freq / 220);
        const env = Math.exp(-t * decayRate * 1.8);
        sample += Math.sin(2 * Math.PI * hFreq * t) * harm.amp * env;
      }

      sample *= attack * velocity * 0.28;
      this.left[idx] += sample * panL;
      this.right[idx] += sample * panR;
    }
  }

  // Agrega una nota de cuerdas / violonchelo / violín (sostenido suave con vibrato)
  addStringNote(freq, startTime, duration, velocity = 0.5, pan = 0.0) {
    const startSample = Math.floor(startTime * SAMPLE_RATE);
    const endSample = Math.min(this.length, Math.floor((startTime + duration + 0.5) * SAMPLE_RATE));
    const totalSamples = endSample - startSample;
    if (totalSamples <= 0 || startSample >= this.length) return;

    const panL = Math.cos((pan + 1) * Math.PI / 4);
    const panR = Math.sin((pan + 1) * Math.PI / 4);

    const attackTime = 0.18;
    const releaseTime = 0.35;

    for (let i = 0; i < totalSamples; i++) {
      const idx = startSample + i;
      if (idx >= this.length) break;
      const t = i / SAMPLE_RATE;

      // Envolvente de cuerdas ADSR suave
      let env = 1.0;
      if (t < attackTime) {
        env = t / attackTime;
      } else if (t > duration) {
        env = Math.max(0, 1 - (t - duration) / releaseTime);
      }

      // Vibrato suave a 5.2 Hz
      const vibrato = Math.sin(2 * Math.PI * 5.2 * t) * 0.006 * Math.min(1.0, t * 1.5);
      const modFreq = freq * (1 + vibrato);

      // Mezcla de ondas con armónicos pares e impares cálidos
      let sample = Math.sin(2 * Math.PI * modFreq * t) * 0.8
                 + Math.sin(2 * Math.PI * modFreq * 2 * t) * 0.35
                 + Math.sin(2 * Math.PI * modFreq * 3 * t) * 0.15
                 + Math.sin(2 * Math.PI * modFreq * 4 * t) * 0.06;

      sample *= env * velocity * 0.22;
      this.left[idx] += sample * panL;
      this.right[idx] += sample * panR;
    }
  }

  // Aplica reverberación convolutiva de sala de concierto
  applyConcertHallReverb(wet = 0.28) {
    const delayTimes = [0.031, 0.047, 0.061, 0.089, 0.113];
    const decayFactors = [0.55, 0.45, 0.38, 0.30, 0.22];

    const tempL = new Float32Array(this.left);
    const tempR = new Float32Array(this.right);

    for (let d = 0; d < delayTimes.length; d++) {
      const delaySamples = Math.floor(delayTimes[d] * SAMPLE_RATE);
      const decay = decayFactors[d] * wet;

      for (let i = delaySamples; i < this.length; i++) {
        // Panning cruzado en reflejos
        this.left[i] += tempR[i - delaySamples] * decay * 0.8;
        this.right[i] += tempL[i - delaySamples] * decay * 0.8;
      }
    }
  }

  // Convierte el buffer estéreo a un Buffer de archivo WAV de 16 bits
  toWavBuffer() {
    let maxAmp = 0.0001;
    for (let i = 0; i < this.length; i++) {
      const aL = Math.abs(this.left[i]);
      const aR = Math.abs(this.right[i]);
      if (aL > maxAmp) maxAmp = aL;
      if (aR > maxAmp) maxAmp = aR;
    }

    const normGain = maxAmp > 0.92 ? (0.92 / maxAmp) : 1.0;

    const numChannels = 2;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = SAMPLE_RATE * blockAlign;
    const dataSize = this.length * blockAlign;
    const buffer = Buffer.alloc(44 + dataSize);

    // Cabecera RIFF
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // Subchunk 'fmt '
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // 1 = PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(SAMPLE_RATE, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34); // BitsPerSample

    // Subchunk 'data'
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let i = 0; i < this.length; i++) {
      const sL = Math.max(-1, Math.min(1, this.left[i] * normGain));
      const sR = Math.max(-1, Math.min(1, this.right[i] * normGain));
      const intL = sL < 0 ? Math.floor(sL * 32768) : Math.floor(sL * 32767);
      const intR = sR < 0 ? Math.floor(sR * 32768) : Math.floor(sR * 32767);
      buffer.writeInt16LE(intL, offset);
      buffer.writeInt16LE(intR, offset + 2);
      offset += 4;
    }

    return buffer;
  }
}

// ------------------------------------------------------------------
// Pista 1: Beethoven - Claro de Luna (Sonata No. 14 en Do# menor)
// ------------------------------------------------------------------
function renderMoonlightSonata() {
  const bpm = 54;
  const beatSec = 60 / bpm;
  const tripletSec = beatSec / 3;
  const bars = 16;
  const totalDuration = bars * 4 * beatSec + 3.0;
  const buf = new AudioBufferStereo(Math.floor(totalDuration * SAMPLE_RATE));

  const arpeggios = [
    { bass: 'C#2', oct: 'C#3', arp: ['G#3', 'C#4', 'E4'] },
    { bass: 'C#2', oct: 'C#3', arp: ['G#3', 'C#4', 'E4'] },
    { bass: 'B1', oct: 'B2', arp: ['G#3', 'C#4', 'E4'] },
    { bass: 'A1', oct: 'A2', arp: ['A3', 'C#4', 'E4'] },
    { bass: 'F#1', oct: 'F#2', arp: ['A3', 'D4', 'F#4'] },
    { bass: 'G#1', oct: 'G#2', arp: ['G#3', 'C4', 'F#4'] },
    { bass: 'C#2', oct: 'C#3', arp: ['G#3', 'C#4', 'E4'] },
    { bass: 'G#1', oct: 'G#2', arp: ['G#3', 'C#4', 'E4'] },
    { bass: 'C#2', oct: 'C#3', arp: ['G#3', 'C#4', 'E4'] },
    { bass: 'C#2', oct: 'C#3', arp: ['G#3', 'C#4', 'E4'] },
    { bass: 'B1', oct: 'B2', arp: ['G#3', 'D4', 'F4'] },
    { bass: 'A1', oct: 'A2', arp: ['A3', 'C#4', 'E4'] },
    { bass: 'F#1', oct: 'F#2', arp: ['A3', 'D4', 'F#4'] },
    { bass: 'G#1', oct: 'G#2', arp: ['G#3', 'C4', 'F#4'] },
    { bass: 'C#2', oct: 'C#3', arp: ['G#3', 'C#4', 'E4'] },
    { bass: 'C#1', oct: 'C#2', arp: ['G#3', 'C#4', 'E4'] },
  ];

  const melody = [
    { t: 8 * beatSec, note: 'G#4', dur: beatSec * 2.8, vel: 0.85 },
    { t: 11 * beatSec, note: 'G#4', dur: beatSec * 0.9, vel: 0.75 },
    { t: 12 * beatSec, note: 'G#4', dur: beatSec * 2.8, vel: 0.85 },
    { t: 15 * beatSec, note: 'A4', dur: beatSec * 0.9, vel: 0.8 },
    { t: 16 * beatSec, note: 'G#4', dur: beatSec * 2.0, vel: 0.85 },
    { t: 18 * beatSec, note: 'F#4', dur: beatSec * 1.8, vel: 0.8 },
    { t: 20 * beatSec, note: 'E4', dur: beatSec * 3.5, vel: 0.85 },
    { t: 24 * beatSec, note: 'G#4', dur: beatSec * 2.5, vel: 0.85 },
    { t: 27 * beatSec, note: 'B4', dur: beatSec * 1.2, vel: 0.8 },
    { t: 28 * beatSec, note: 'A4', dur: beatSec * 2.5, vel: 0.85 },
    { t: 31 * beatSec, note: 'F#4', dur: beatSec * 1.2, vel: 0.8 },
    { t: 32 * beatSec, note: 'G#4', dur: beatSec * 3.8, vel: 0.9 },
    { t: 36 * beatSec, note: 'C#4', dur: beatSec * 4.0, vel: 0.8 },
  ];

  let time = 0.5;
  for (let bar = 0; bar < arpeggios.length; bar++) {
    const pat = arpeggios[bar];
    buf.addPianoNote(noteToFreq(pat.bass), time, beatSec * 3.8, 0.85, -0.4);
    buf.addPianoNote(noteToFreq(pat.oct), time, beatSec * 3.8, 0.7, -0.2);
    buf.addStringNote(noteToFreq(pat.oct), time, beatSec * 4.0, 0.25, 0.0);

    for (let p = 0; p < 4; p++) {
      for (let noteIdx = 0; noteIdx < 3; noteIdx++) {
        const note = pat.arp[noteIdx];
        const nTime = time + (p * 3 + noteIdx) * tripletSec;
        buf.addPianoNote(noteToFreq(note), nTime, tripletSec * 2.5, 0.52, 0.2);
      }
    }
    time += 4 * beatSec;
  }

  melody.forEach((m) => {
    buf.addPianoNote(noteToFreq(m.note), m.t + 0.5, m.dur, m.vel, 0.15);
    buf.addStringNote(noteToFreq(m.note), m.t + 0.5, m.dur * 0.9, m.vel * 0.35, 0.3);
  });

  buf.applyConcertHallReverb(0.35);
  return buf.toWavBuffer();
}

// ------------------------------------------------------------------
// Pista 2: Erik Satie - Gymnopédie No. 1
// ------------------------------------------------------------------
function renderGymnopedie() {
  const bpm = 66;
  const beatSec = 60 / bpm;
  const bars = 16;
  const totalDuration = bars * 3 * beatSec + 3.0;
  const buf = new AudioBufferStereo(Math.floor(totalDuration * SAMPLE_RATE));

  const chords = [
    { bass: 'G2', chord: ['B3', 'D4', 'F#4'] },
    { bass: 'D2', chord: ['F#3', 'A3', 'C#4'] },
    { bass: 'G2', chord: ['B3', 'D4', 'F#4'] },
    { bass: 'D2', chord: ['F#3', 'A3', 'C#4'] },
    { bass: 'G2', chord: ['B3', 'D4', 'F#4'] },
    { bass: 'D2', chord: ['F#3', 'A3', 'C#4'] },
    { bass: 'G2', chord: ['B3', 'D4', 'F#4'] },
    { bass: 'D2', chord: ['F#3', 'A3', 'C#4'] },
    { bass: 'C2', chord: ['E3', 'G3', 'B3'] },
    { bass: 'G2', chord: ['B3', 'D4', 'F#4'] },
    { bass: 'E2', chord: ['G3', 'B3', 'E4'] },
    { bass: 'B2', chord: ['F#3', 'B3', 'D4'] },
    { bass: 'C2', chord: ['E3', 'G3', 'B3'] },
    { bass: 'D2', chord: ['F#3', 'A3', 'C#4'] },
    { bass: 'G2', chord: ['B3', 'D4', 'F#4'] },
    { bass: 'G1', chord: ['B2', 'D3', 'G3'] }
  ];

  const melody = [
    { t: 4 * 3 * beatSec, note: 'F#4', dur: beatSec * 2.8, vel: 0.8 },
    { t: 5 * 3 * beatSec - beatSec, note: 'A4', dur: beatSec * 1.8, vel: 0.75 },
    { t: 5 * 3 * beatSec + beatSec, note: 'B4', dur: beatSec * 2.8, vel: 0.85 },
    { t: 6 * 3 * beatSec + beatSec, note: 'C#5', dur: beatSec * 1.8, vel: 0.8 },
    { t: 7 * 3 * beatSec, note: 'D5', dur: beatSec * 3.5, vel: 0.9 },
    { t: 8 * 3 * beatSec + beatSec, note: 'A4', dur: beatSec * 2.5, vel: 0.85 },
    { t: 9 * 3 * beatSec + beatSec, note: 'F#4', dur: beatSec * 2.5, vel: 0.8 },
    { t: 10 * 3 * beatSec + beatSec, note: 'G4', dur: beatSec * 2.5, vel: 0.8 },
    { t: 11 * 3 * beatSec + beatSec, note: 'A4', dur: beatSec * 3.5, vel: 0.85 },
    { t: 13 * 3 * beatSec, note: 'F#4', dur: beatSec * 2.8, vel: 0.75 },
    { t: 14 * 3 * beatSec, note: 'D4', dur: beatSec * 4.0, vel: 0.75 }
  ];

  let time = 0.6;
  for (let b = 0; b < chords.length; b++) {
    const c = chords[b];
    const bFreq = noteToFreq(c.bass);
    buf.addPianoNote(bFreq, time, beatSec * 2.8, 0.75, -0.3);
    buf.addStringNote(bFreq, time, beatSec * 3.0, 0.2, -0.2);

    for (let p = 1; p <= 2; p++) {
      const chordTime = time + p * beatSec;
      c.chord.forEach((n, idx) => {
        const pan = -0.15 + idx * 0.15;
        buf.addPianoNote(noteToFreq(n), chordTime, beatSec * 1.6, 0.48, pan);
      });
    }

    time += 3 * beatSec;
  }

  melody.forEach((m) => {
    buf.addPianoNote(noteToFreq(m.note), m.t + 0.6, m.dur, m.vel, 0.2);
    buf.addStringNote(noteToFreq(m.note), m.t + 0.6, m.dur, m.vel * 0.4, 0.25);
  });

  buf.applyConcertHallReverb(0.38);
  return buf.toWavBuffer();
}

// ------------------------------------------------------------------
// Pista 3: J.S. Bach - Preludio en Do Mayor (BWV 846)
// ------------------------------------------------------------------
function renderBachPrelude() {
  const bpm = 72;
  const beatSec = 60 / bpm;
  const semiSec = beatSec / 4;
  const bars = 16;
  const totalDuration = bars * 4 * beatSec + 3.0;
  const buf = new AudioBufferStereo(Math.floor(totalDuration * SAMPLE_RATE));

  const patterns = [
    ['C3', 'E3', 'G3', 'C4', 'E4'],
    ['C3', 'D3', 'A3', 'D4', 'F4'],
    ['B2', 'D3', 'G3', 'D4', 'F4'],
    ['C3', 'E3', 'G3', 'C4', 'E4'],
    ['C3', 'E3', 'A3', 'E4', 'A4'],
    ['C3', 'D3', 'F#3', 'A3', 'D4'],
    ['B2', 'D3', 'G3', 'D4', 'G4'],
    ['B2', 'C3', 'E3', 'G3', 'C4'],
    ['A2', 'C3', 'E3', 'G3', 'C4'],
    ['D2', 'A2', 'D3', 'F#3', 'C4'],
    ['G2', 'B2', 'D3', 'G3', 'B3'],
    ['G2', 'A#2', 'E3', 'G3', 'C#4'],
    ['F2', 'A2', 'D3', 'A3', 'D4'],
    ['G2', 'B2', 'F3', 'G3', 'D4'],
    ['C2', 'G2', 'E3', 'G3', 'C4'],
    ['C1', 'G2', 'C3', 'E3', 'G3']
  ];

  let time = 0.5;
  patterns.forEach((chord) => {
    for (let rep = 0; rep < 2; rep++) {
      const repTime = time + rep * 8 * semiSec;
      const sequence = [
        { note: chord[0], t: 0, pan: -0.4, vel: 0.8 },
        { note: chord[1], t: 1, pan: -0.2, vel: 0.7 },
        { note: chord[2], t: 2, pan: 0.0, vel: 0.6 },
        { note: chord[3], t: 3, pan: 0.2, vel: 0.65 },
        { note: chord[4], t: 4, pan: 0.4, vel: 0.7 },
        { note: chord[2], t: 5, pan: 0.0, vel: 0.55 },
        { note: chord[3], t: 6, pan: 0.2, vel: 0.6 },
        { note: chord[4], t: 7, pan: 0.4, vel: 0.65 }
      ];

      sequence.forEach((s) => {
        const nTime = repTime + s.t * semiSec;
        buf.addPianoNote(noteToFreq(s.note), nTime, semiSec * 3.5, s.vel * 0.85, s.pan);
      });
    }

    buf.addStringNote(noteToFreq(chord[0]), time, beatSec * 4.0, 0.18, -0.3);
    time += 4 * beatSec;
  });

  buf.applyConcertHallReverb(0.32);
  return buf.toWavBuffer();
}

// ------------------------------------------------------------------
// Pista 4: J.S. Bach - Aria para la Cuerda de Sol (Suite No. 3)
// ------------------------------------------------------------------
function renderAirOnGString() {
  const bpm = 48;
  const beatSec = 60 / bpm;
  const bars = 12;
  const totalDuration = bars * 4 * beatSec + 3.5;
  const buf = new AudioBufferStereo(Math.floor(totalDuration * SAMPLE_RATE));

  const walkingBass = [
    'D3', 'D3', 'C#3', 'C#3', 'B2', 'B2', 'A2', 'A2',
    'G2', 'G2', 'F#2', 'F#2', 'E2', 'E2', 'A2', 'A2',
    'D3', 'C#3', 'B2', 'A2', 'G2', 'A2', 'B2', 'C#3',
    'D3', 'D3', 'C#3', 'C#3', 'B2', 'B2', 'A2', 'A2',
    'G2', 'G2', 'G#2', 'G#2', 'A2', 'A2', 'A1', 'A1',
    'D2', 'F#2', 'A2', 'D3', 'D2', 'D2', 'D2', 'D2'
  ];

  const violinMelody = [
    { t: 0.8, note: 'F#4', dur: beatSec * 3.8, vel: 0.85 },
    { t: 0.8 + 4 * beatSec, note: 'G4', dur: beatSec * 1.5, vel: 0.8 },
    { t: 0.8 + 5.5 * beatSec, note: 'E4', dur: beatSec * 2.2, vel: 0.75 },
    { t: 0.8 + 8 * beatSec, note: 'A4', dur: beatSec * 3.8, vel: 0.9 },
    { t: 0.8 + 12 * beatSec, note: 'B4', dur: beatSec * 1.8, vel: 0.85 },
    { t: 0.8 + 14 * beatSec, note: 'G4', dur: beatSec * 1.8, vel: 0.8 },
    { t: 0.8 + 16 * beatSec, note: 'F#4', dur: beatSec * 3.5, vel: 0.85 },
    { t: 0.8 + 20 * beatSec, note: 'E4', dur: beatSec * 3.5, vel: 0.8 },
    { t: 0.8 + 24 * beatSec, note: 'D4', dur: beatSec * 4.0, vel: 0.85 }
  ];

  const midHarmony = [
    { bar: 0, chord: ['A3', 'D4'] },
    { bar: 1, chord: ['A3', 'C#4'] },
    { bar: 2, chord: ['F#3', 'B3'] },
    { bar: 3, chord: ['F#3', 'A3'] },
    { bar: 4, chord: ['D3', 'G3'] },
    { bar: 5, chord: ['D3', 'F#3'] },
    { bar: 6, chord: ['C#3', 'E3'] },
    { bar: 7, chord: ['C#3', 'E3', 'A3'] },
    { bar: 8, chord: ['D3', 'F#3'] },
    { bar: 9, chord: ['D3', 'G3'] },
    { bar: 10, chord: ['C#3', 'E3', 'A3'] },
    { bar: 11, chord: ['D3', 'F#3', 'A3'] }
  ];

  walkingBass.forEach((bNote, idx) => {
    const bTime = 0.8 + idx * (beatSec * 0.5);
    buf.addStringNote(noteToFreq(bNote), bTime, beatSec * 0.45, 0.55, -0.35);
    buf.addPianoNote(noteToFreq(bNote), bTime, beatSec * 0.45, 0.45, -0.3);
  });

  midHarmony.forEach((mh) => {
    const mTime = 0.8 + mh.bar * beatSec * 4;
    mh.chord.forEach((n) => {
      buf.addStringNote(noteToFreq(n), mTime, beatSec * 3.8, 0.35, 0.1);
    });
  });

  violinMelody.forEach((v) => {
    buf.addStringNote(noteToFreq(v.note), v.t, v.dur, v.vel, 0.25);
    buf.addPianoNote(noteToFreq(v.note), v.t, v.dur * 0.7, v.vel * 0.35, 0.2);
  });

  buf.applyConcertHallReverb(0.40);
  return buf.toWavBuffer();
}

// ------------------------------------------------------------------
// Pista 5: C. Saint-Saëns - El Cisne / Barcarola Náutica
// ------------------------------------------------------------------
function renderTheSwan() {
  const bpm = 58;
  const beatSec = 60 / bpm;
  const dottedQuarterSec = beatSec * 1.5;
  const eighthSec = beatSec * 0.5;
  const bars = 16;
  const totalDuration = bars * 6 * eighthSec + 3.5;
  const buf = new AudioBufferStereo(Math.floor(totalDuration * SAMPLE_RATE));

  const harpRipples = [
    { bass: 'G2', arp: ['G3', 'D4', 'B4', 'D4', 'B4', 'D4'] },
    { bass: 'B2', arp: ['G3', 'D4', 'B4', 'D4', 'B4', 'D4'] },
    { bass: 'C3', arp: ['G3', 'E4', 'C5', 'E4', 'C5', 'E4'] },
    { bass: 'C#3', arp: ['G3', 'E4', 'C#5', 'E4', 'C#5', 'E4'] },
    { bass: 'D3', arp: ['A3', 'F#4', 'D5', 'F#4', 'D5', 'F#4'] },
    { bass: 'B2', arp: ['G3', 'D4', 'B4', 'D4', 'B4', 'D4'] },
    { bass: 'C3', arp: ['G3', 'E4', 'C5', 'E4', 'C5', 'E4'] },
    { bass: 'D3', arp: ['A3', 'F#4', 'C5', 'F#4', 'C5', 'F#4'] },
    { bass: 'G2', arp: ['G3', 'D4', 'B4', 'D4', 'B4', 'D4'] },
    { bass: 'G2', arp: ['G3', 'D4', 'B4', 'D4', 'B4', 'D4'] },
    { bass: 'E2', arp: ['G3', 'B3', 'E4', 'B3', 'E4', 'B3'] },
    { bass: 'A2', arp: ['A3', 'C4', 'E4', 'C4', 'E4', 'C4'] },
    { bass: 'D2', arp: ['F#3', 'A3', 'D4', 'A3', 'D4', 'A3'] },
    { bass: 'D2', arp: ['F#3', 'C4', 'D4', 'C4', 'D4', 'C4'] },
    { bass: 'G2', arp: ['G3', 'B3', 'D4', 'B3', 'D4', 'B3'] },
    { bass: 'G1', arp: ['G2', 'B2', 'D3', 'G3', 'B3', 'D4'] }
  ];

  const celloMelody = [
    { t: 0.8, note: 'B3', dur: dottedQuarterSec * 1.8, vel: 0.85 },
    { t: 0.8 + 2 * 6 * eighthSec, note: 'D4', dur: dottedQuarterSec * 1.0, vel: 0.85 },
    { t: 0.8 + 2 * 6 * eighthSec + 3 * eighthSec, note: 'E4', dur: eighthSec * 2.8, vel: 0.8 },
    { t: 0.8 + 3 * 6 * eighthSec + 3 * eighthSec, note: 'F#4', dur: eighthSec * 2.8, vel: 0.85 },
    { t: 0.8 + 4 * 6 * eighthSec, note: 'G4', dur: dottedQuarterSec * 2.2, vel: 0.9 },
    { t: 0.8 + 6 * 6 * eighthSec, note: 'E4', dur: dottedQuarterSec * 1.8, vel: 0.85 },
    { t: 0.8 + 7 * 6 * eighthSec, note: 'D4', dur: dottedQuarterSec * 1.8, vel: 0.8 },
    { t: 0.8 + 8 * 6 * eighthSec, note: 'B3', dur: dottedQuarterSec * 3.5, vel: 0.85 },
    { t: 0.8 + 10 * 6 * eighthSec, note: 'G3', dur: dottedQuarterSec * 2.0, vel: 0.8 },
    { t: 0.8 + 12 * 6 * eighthSec, note: 'A3', dur: dottedQuarterSec * 2.0, vel: 0.8 },
    { t: 0.8 + 14 * 6 * eighthSec, note: 'G3', dur: dottedQuarterSec * 3.5, vel: 0.85 }
  ];

  let time = 0.8;
  harpRipples.forEach((ripple) => {
    buf.addPianoNote(noteToFreq(ripple.bass), time, dottedQuarterSec * 1.9, 0.75, -0.3);
    buf.addStringNote(noteToFreq(ripple.bass), time, dottedQuarterSec * 2.0, 0.28, -0.25);

    ripple.arp.forEach((note, nIdx) => {
      const nTime = time + nIdx * eighthSec;
      const pan = -0.2 + (nIdx % 3) * 0.2;
      buf.addPianoNote(noteToFreq(note), nTime, eighthSec * 2.2, 0.52, pan);
    });

    time += 6 * eighthSec;
  });

  celloMelody.forEach((c) => {
    buf.addStringNote(noteToFreq(c.note), c.t, c.dur, c.vel, 0.15);
    buf.addPianoNote(noteToFreq(c.note), c.t, c.dur * 0.6, c.vel * 0.3, 0.1);
  });

  buf.applyConcertHallReverb(0.36);
  return buf.toWavBuffer();
}

// ------------------------------------------------------------------
// Función principal de exportación
// ------------------------------------------------------------------
async function generateAll() {
  const outputDir = path.join(__dirname, '..', 'public', 'audio', 'music');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('[+] Iniciando síntesis de la Banda Sonora Clásica Relajante...');

  console.log('[1/5] Generando "Claro de Luna" (Beethoven)...');
  const track1 = renderMoonlightSonata();
  fs.writeFileSync(path.join(outputDir, 'classical_1_moonlight.wav'), track1);
  console.log(`      ✓ Guardado: classical_1_moonlight.wav (${(track1.length / 1024 / 1024).toFixed(2)} MB)`);

  console.log('[2/5] Generando "Gymnopédie No. 1" (Satie)...');
  const track2 = renderGymnopedie();
  fs.writeFileSync(path.join(outputDir, 'classical_2_gymnopedie.wav'), track2);
  console.log(`      ✓ Guardado: classical_2_gymnopedie.wav (${(track2.length / 1024 / 1024).toFixed(2)} MB)`);

  console.log('[3/5] Generando "Preludio en Do Mayor" (J.S. Bach)...');
  const track3 = renderBachPrelude();
  fs.writeFileSync(path.join(outputDir, 'classical_3_bach_prelude.wav'), track3);
  console.log(`      ✓ Guardado: classical_3_bach_prelude.wav (${(track3.length / 1024 / 1024).toFixed(2)} MB)`);

  console.log('[4/5] Generando "Aria para la Cuerda de Sol" (J.S. Bach)...');
  const track4 = renderAirOnGString();
  fs.writeFileSync(path.join(outputDir, 'classical_4_air_g_string.wav'), track4);
  console.log(`      ✓ Guardado: classical_4_air_g_string.wav (${(track4.length / 1024 / 1024).toFixed(2)} MB)`);

  console.log('[5/5] Generando "El Cisne / Barcarola" (C. Saint-Saëns)...');
  const track5 = renderTheSwan();
  fs.writeFileSync(path.join(outputDir, 'classical_5_swan_lake.wav'), track5);
  console.log(`      ✓ Guardado: classical_5_swan_lake.wav (${(track5.length / 1024 / 1024).toFixed(2)} MB)`);

  console.log('\n[🎉] ¡Las 5 pistas de música clásica relajante fueron generadas exitosamente!');
}

generateAll().catch(console.error);
