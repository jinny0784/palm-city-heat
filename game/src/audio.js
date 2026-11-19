// audio.js — every sound in Palm City Heat is synthesised with WebAudio on
// the spot: no audio files, nothing to download. Short one-shot blips for
// shots, crashes and pickups, plus two little loops (engine and siren) whose
// pitch follows the action. M toggles a master mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;

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

  function blip(freqA, freqB, dur, type, vol, delay) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freqA, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t0 + dur);
    gain.gain.setValueAtTime(vol || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq) {
    if (!ensure()) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq || 1200;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  const sounds = {
    shot() { noiseBurst(0.11, 0.5, 2600); blip(220, 60, 0.09, 'square', 0.25); },
    copshot() { noiseBurst(0.09, 0.32, 2200); blip(190, 70, 0.08, 'square', 0.16); },
    hit() { noiseBurst(0.06, 0.25, 900); },
    thud() { noiseBurst(0.16, 0.5, 420); blip(90, 40, 0.14, 'sine', 0.4); },
    crash() { noiseBurst(0.28, 0.55, 700); blip(140, 35, 0.22, 'sawtooth', 0.2); },
    door() { blip(160, 90, 0.07, 'square', 0.18); blip(120, 80, 0.06, 'square', 0.14, 0.08); },
    steal() { blip(300, 140, 0.12, 'square', 0.2); noiseBurst(0.1, 0.2, 1500); },
    pickup() { blip(660, 990, 0.1, 'sine', 0.22); blip(990, 1320, 0.12, 'sine', 0.18, 0.07); },
    cash() { blip(880, 880, 0.05, 'square', 0.14); blip(1174, 1174, 0.09, 'square', 0.14, 0.05); },
    spray() { noiseBurst(0.5, 0.16, 4000); blip(520, 780, 0.3, 'sine', 0.12, 0.4); },
    mission() { blip(523, 523, 0.1, 'triangle', 0.25); blip(659, 659, 0.1, 'triangle', 0.25, 0.1); blip(784, 784, 0.16, 'triangle', 0.25, 0.2); },
    complete() { [523, 659, 784, 1046].forEach((f, i) => blip(f, f, 0.16, 'triangle', 0.25, i * 0.12)); },
    busted() { blip(392, 392, 0.14, 'square', 0.2); blip(311, 311, 0.14, 'square', 0.2, 0.16); blip(233, 233, 0.3, 'square', 0.2, 0.32); },
    wasted() { blip(330, 55, 0.7, 'sawtooth', 0.22); },
    siren() { /* loop handled below; a single whoop on spawn */ blip(660, 990, 0.18, 'triangle', 0.1); },
  };

  function play(name) {
    if (muted) return;
    const fn = sounds[name];
    if (fn) fn();
  }

  function setEngine(on, load) {
    if (!ensure()) return;
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineGain.gain.value = 0.0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    if (engineOsc) {
      const target = on ? 0.05 + load * 0.05 : 0;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + load * 130, ctx.currentTime, 0.08);
      if (!on && target === 0) {
        const osc = engineOsc;
        const gain = engineGain;
        engineOsc = null;
        engineGain = null;
        setTimeout(() => { try { osc.stop(); gain.disconnect(); } catch (e) { /* already gone */ } }, 350);
      }
    }
  }

  function setSiren(on) {
    if (!ensure()) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenLfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 820;
      sirenLfo.frequency.value = 0.7;
      lfoGain.gain.value = 170;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain.gain.value = 0.0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    }
    if (sirenOsc) {
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.035 : 0, ctx.currentTime, 0.15);
      if (!on) {
        const osc = sirenOsc;
        const lfo = sirenLfo;
        const gain = sirenGain;
        sirenOsc = null;
        sirenLfo = null;
        sirenGain = null;
        setTimeout(() => { try { osc.stop(); lfo.stop(); gain.disconnect(); } catch (e) { /* already gone */ } }, 500);
      }
    }
  }

  return {
    unlock() { ensure(); },
    play,
    setEngine,
    setSiren,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
  };
}
