// Synthesised sound only (WebAudio, no files): gunshots, hits, pickups, crashes,
// a mission jingle, an engine hum while driving and a siren wail when the heat is
// on. The context is created lazily on the first user gesture; M mutes everything.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst(seconds, filterFreq, gainValue) {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.stop(ctx.currentTime + seconds);
  }

  function tone(freq, seconds, type, gainValue, slideTo) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    shoot() {
      burst(0.14, 1800, 0.5);
      tone(180, 0.08, 'square', 0.18, 60);
    },
    hit() {
      tone(220, 0.08, 'triangle', 0.25, 140);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.3);
      setTimeout(() => tone(990, 0.12, 'sine', 0.3), 70);
    },
    cash() {
      tone(880, 0.07, 'sine', 0.25);
      setTimeout(() => tone(1174, 0.1, 'sine', 0.25), 60);
    },
    crash(intensity) {
      burst(0.25, 500, Math.min(0.7, 0.25 + intensity * 0.4));
      tone(90, 0.2, 'sine', 0.3, 40);
    },
    jingle() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((n, i) => setTimeout(() => tone(n, 0.16, 'triangle', 0.3), i * 110));
    },
    fail() {
      tone(320, 0.3, 'sawtooth', 0.2, 160);
    },
    /** Continuous engine hum: level 0..1, on while driving. */
    engine(level, on) {
      if (!ensure()) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 60;
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 420;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const target = on ? 0.05 + level * 0.1 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + level * 130, ctx.currentTime, 0.08);
    },
    /** Two-tone siren while the police are close; off otherwise. */
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 750;
        sirenLfo = ctx.createOscillator();
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 0.55;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 260;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.045;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenLfo.start();
      } else if (!on && sirenOsc) {
        try {
          sirenOsc.stop();
          sirenLfo.stop();
        } catch {
          // Already stopped.
        }
        sirenOsc = null;
        sirenLfo = null;
        sirenGain = null;
      }
    },
  };
}
