// Palm City Heat — all sound is synthesised with WebAudio. There are no
// audio files: a gunshot is a noise burst, a coin is two sine notes, the
// engine is a sawtooth whose pitch follows the car's speed, and the siren
// is a triangle wave sliding between two tones. The context is created
// lazily on the first user gesture, as browsers require.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine loop.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(master);
      engineOsc.start();
      // Siren loop.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 800;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'sine';
      sirenLfo.frequency.value = 0.55;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 160;
      sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
      sirenLfo.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.3, freq = 1800, when = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  const sounds = {
    shot() { noise(0.11, 0.5, 2600); tone(160, 0.08, 'square', 0.16, 0, 60); },
    dry() { tone(1200, 0.04, 'square', 0.08); },
    reload() { tone(500, 0.05, 'square', 0.1); tone(760, 0.05, 'square', 0.1, 0.09); },
    hit() { tone(220, 0.06, 'square', 0.12, 0, 140); },
    down() { tone(140, 0.16, 'sine', 0.22, 0, 60); noise(0.1, 0.14, 700); },
    pickup() { tone(880, 0.07, 'sine', 0.16); tone(1318, 0.1, 'sine', 0.16, 0.06); },
    bribe() { tone(660, 0.07, 'sine', 0.15); tone(880, 0.07, 'sine', 0.15, 0.06); tone(990, 0.12, 'sine', 0.15, 0.12); },
    mission() { tone(523, 0.09, 'triangle', 0.18); tone(784, 0.12, 'triangle', 0.18, 0.08); },
    complete() { tone(523, 0.1, 'triangle', 0.2); tone(659, 0.1, 'triangle', 0.2, 0.09); tone(784, 0.1, 'triangle', 0.2, 0.18); tone(1046, 0.22, 'triangle', 0.22, 0.27); },
    fail() { tone(392, 0.14, 'triangle', 0.18); tone(311, 0.2, 'triangle', 0.18, 0.12); },
    crash() { noise(0.22, 0.42, 900); tone(90, 0.2, 'sine', 0.25, 0, 45); },
    enter() { tone(300, 0.06, 'sine', 0.12, 0, 420); },
    exit() { tone(420, 0.06, 'sine', 0.12, 0, 300); },
    spray() { noise(0.5, 0.1, 3200); tone(784, 0.12, 'triangle', 0.16, 0.3); tone(1046, 0.18, 'triangle', 0.16, 0.42); },
    busted() { tone(220, 0.3, 'square', 0.16); tone(185, 0.42, 'square', 0.16, 0.22); },
    wasted() { tone(196, 0.4, 'sawtooth', 0.14, 0, 98); tone(147, 0.6, 'sawtooth', 0.14, 0.3, 65); },
    click() { tone(700, 0.04, 'sine', 0.1); },
  };

  return {
    unlock() { ensure(); },
    play(name) {
      if (muted) return;
      const fn = sounds[name];
      if (fn) fn();
    },
    /** speedNorm 0..1 while driving; inCar false silences the engine. */
    setEngine(speedNorm, inCar) {
      if (!ctx || !engineGain) return;
      const t = ctx.currentTime;
      const target = inCar && !muted ? 0.05 + Math.abs(speedNorm) * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, t, 0.09);
      engineOsc.frequency.setTargetAtTime(52 + Math.abs(speedNorm) * 130, t, 0.09);
      engineFilter.frequency.setTargetAtTime(280 + Math.abs(speedNorm) * 700, t, 0.1);
    },
    /** level 0..1 by the nearest police unit's distance. */
    setSiren(level) {
      if (!ctx || !sirenGain) return;
      sirenGain.gain.setTargetAtTime(muted ? 0 : level * 0.045, ctx.currentTime, 0.2);
    },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.03);
      return muted;
    },
    get muted() { return muted; },
  };
}
