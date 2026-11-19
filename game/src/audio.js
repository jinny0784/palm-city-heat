// Palm City Heat — sound, all synthesized with WebAudio: no audio files.
// An engine hum that follows your speed, a two-tone siren when the police
// are close, and little one-shot voices for shots, hits, pickups and the
// mission jingle. Everything is created lazily on the first user gesture,
// because browsers will not start an AudioContext before one.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engine = null;
  let siren = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.45;
    master.connect(ctx.destination);
    return true;
  }

  function tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, { vol = 0.3, freq = 1200, delay = 0 } = {}) {
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
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.45;
      return muted;
    },
    shot() { noise(0.14, { vol: 0.32, freq: 2600 }); tone(120, 0.1, { type: 'square', vol: 0.1, slide: -70 }); },
    click() { tone(900, 0.05, { type: 'square', vol: 0.08 }); },
    hit() { tone(190, 0.12, { type: 'sawtooth', vol: 0.16, slide: -80 }); },
    crash() { noise(0.3, { vol: 0.34, freq: 700 }); tone(70, 0.28, { type: 'sine', vol: 0.22, slide: -30 }); },
    enter() { tone(320, 0.07, { type: 'triangle', vol: 0.14 }); tone(430, 0.08, { type: 'triangle', vol: 0.12, delay: 0.06 }); },
    pickup() { tone(660, 0.08, { type: 'triangle', vol: 0.16 }); tone(990, 0.1, { type: 'triangle', vol: 0.16, delay: 0.07 }); },
    cash() { tone(1180, 0.06, { type: 'square', vol: 0.1 }); tone(1560, 0.09, { type: 'square', vol: 0.1, delay: 0.05 }); },
    jingle() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.17, delay: i * 0.09 })); },
    respray() { [392, 523, 659].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.14, delay: i * 0.07 })); },
    sting() { tone(220, 0.5, { type: 'sawtooth', vol: 0.18, slide: -120 }); tone(110, 0.6, { type: 'sawtooth', vol: 0.14, slide: -50, delay: 0.05 }); },
    setEngine(on, load) {
      if (!ensure()) return;
      if (on && !engine) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        gain.gain.value = 0.0;
        osc.connect(filter).connect(gain).connect(master);
        osc.start();
        engine = { osc, gain };
      }
      if (engine) {
        const target = on ? 0.05 + load * 0.05 : 0;
        engine.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
        engine.osc.frequency.setTargetAtTime(52 + load * 165, ctx.currentTime, 0.08);
        if (!on && target === 0) {
          const e = engine;
          engine = null;
          setTimeout(() => { try { e.osc.stop(); } catch { /* already stopped */ } }, 350);
        }
      }
    },
    setSiren(on) {
      if (!ensure()) return;
      if (on && !siren) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 820;
        lfo.frequency.value = 0.65;
        lfoGain.gain.value = 140;
        lfo.connect(lfoGain).connect(osc.frequency);
        gain.gain.value = 0.0;
        osc.connect(gain).connect(master);
        osc.start();
        lfo.start();
        siren = { osc, lfo, gain };
      }
      if (siren) {
        siren.gain.gain.setTargetAtTime(on ? 0.028 : 0, ctx.currentTime, 0.15);
        if (!on) {
          const s = siren;
          siren = null;
          setTimeout(() => { try { s.osc.stop(); s.lfo.stop(); } catch { /* already stopped */ } }, 500);
        }
      }
    },
  };
}
