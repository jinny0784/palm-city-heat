// audio.js — all sound is synthesized with WebAudio: short blips and
// noise bursts for effects, an oscillator for the engine and a two-tone
// siren. No audio files, nothing loaded.

let ctx = null;
let master = null;
let muted = false;
let engineNodes = null;
let sirenNodes = null;

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
  return true;
}

export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.03);
}

export function isMuted() {
  return muted;
}

function tone(freq, dur, { type = 'sine', gain = 0.2, slide = 0, delay = 0 } = {}) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, { freq = 1200, gain = 0.25, delay = 0 } = {}) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  shot() {
    noise(0.09, { freq: 2600, gain: 0.22 });
    tone(190, 0.08, { type: 'square', gain: 0.1, slide: -120 });
  },
  hit() {
    tone(320, 0.06, { type: 'triangle', gain: 0.14, slide: -140 });
  },
  pickup() {
    tone(660, 0.09, { type: 'sine', gain: 0.18 });
    tone(880, 0.12, { type: 'sine', gain: 0.18, delay: 0.07 });
  },
  cash() {
    tone(990, 0.07, { type: 'square', gain: 0.1 });
    tone(1320, 0.11, { type: 'square', gain: 0.1, delay: 0.06 });
  },
  mission() {
    tone(523, 0.11, { type: 'triangle', gain: 0.2 });
    tone(659, 0.11, { type: 'triangle', gain: 0.2, delay: 0.1 });
    tone(784, 0.16, { type: 'triangle', gain: 0.22, delay: 0.2 });
  },
  fail() {
    tone(392, 0.14, { type: 'triangle', gain: 0.18 });
    tone(311, 0.14, { type: 'triangle', gain: 0.18, delay: 0.13 });
    tone(233, 0.22, { type: 'triangle', gain: 0.18, delay: 0.26 });
  },
  enter() {
    tone(140, 0.07, { type: 'sine', gain: 0.22, slide: 60 });
  },
  crash() {
    noise(0.22, { freq: 700, gain: 0.3 });
    tone(90, 0.18, { type: 'sine', gain: 0.2, slide: -40 });
  },
  complete() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => tone(f, 0.16, { type: 'triangle', gain: 0.2, delay: i * 0.12 }));
  },
};

export function setEngine(on, speedNorm) {
  if (!ensure()) return;
  if (on && !engineNodes) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(filter).connect(g).connect(master);
    osc.start();
    engineNodes = { osc, filter, g };
  }
  if (engineNodes) {
    const t = ctx.currentTime;
    if (on) {
      engineNodes.osc.frequency.setTargetAtTime(55 + speedNorm * 130, t, 0.08);
      engineNodes.filter.frequency.setTargetAtTime(280 + speedNorm * 700, t, 0.08);
      engineNodes.g.gain.setTargetAtTime(0.05 + speedNorm * 0.06, t, 0.09);
    } else {
      engineNodes.g.gain.setTargetAtTime(0, t, 0.06);
      const nodes = engineNodes;
      engineNodes = null;
      setTimeout(() => { try { nodes.osc.stop(); } catch { /* already stopped */ } }, 250);
    }
  }
}

export function setSiren(on) {
  if (!ensure()) return;
  if (on && !sirenNodes) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 1.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g).connect(master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, lfo, g };
  }
  if (sirenNodes) {
    const t = ctx.currentTime;
    if (on) {
      sirenNodes.g.gain.setTargetAtTime(0.028, t, 0.2);
    } else {
      sirenNodes.g.gain.setTargetAtTime(0, t, 0.1);
      const nodes = sirenNodes;
      sirenNodes = null;
      setTimeout(() => {
        try { nodes.osc.stop(); nodes.lfo.stop(); } catch { /* already stopped */ }
      }, 300);
    }
  }
}
