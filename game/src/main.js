// main.js — the browser bootstrap for Palm City Heat. It builds the world,
// wires keyboard/mouse input and the synth audio to it, runs the fixed-feel
// rAF loop (dt clamped so a stutter never teleports anyone), persists
// progress to localStorage, and exposes a small debug hook at window.__palm.
// Screenshot scenes (?shot=title|street|driving|chase&seed=N) freeze after a
// short warm-up so the frame is deterministic.

import { createWorld, stepWorld, startPlay, resetRun } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { drawGame } from './render.js';
import { setupShot } from './shots.js';
import { VIEW_W, VIEW_H } from './config.js';

const SAVE_KEY = 'palmCityHeatSaveV1';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 7) || 7;
const WORLD_SEED = 20261119;

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function storeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.player.cash,
      missionIndex: state.mission.idx,
      storyComplete: state.storyComplete,
    }));
  } catch (e) { /* private mode etc. — the game plays on without saving */ }
}

let saved = loadSave();
let state = createWorld(shotsActive() ? seed : WORLD_SEED, saved);
state.hasSave = !!saved;
state.savedMission = saved ? saved.missionIndex : 0;

const input = createInput(canvas);
const audio = createAudio();
let menuKey = '';

function shotsActive() {
  return !!shotName;
}

window.addEventListener('keydown', (e) => {
  audio.unlock();
  const k = e.key.toLowerCase();
  if (k === 'enter' || k === 'c') menuKey = k;
});
canvas.addEventListener('mousedown', () => audio.unlock());

if (shotsActive()) {
  document.body.classList.add('shot');
  setupShot(state, shotName);
  // Warm the scene up so traffic and walkers sit mid-stride, then freeze.
  const idle = { x: 0, y: 0, aim: 0, fire: false, sprint: false, interact: false, pause: false, mute: false, confirm: false };
  for (let i = 0; i < 45; i++) stepWorld(state, idle, 1 / 60);
  state.sfx.length = 0;
  drawGame(ctx, state);
  window.__palm = { state, shot: shotName, ready: true };
} else {
  window.__palm = { state, createWorld, stepWorld, startPlay };
  let last = performance.now();
  let started = false;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) return;

    // Aim from the mouse through the camera the renderer last used.
    const cam = state._cam || { x: 0, y: 0 };
    const aim = Math.atan2(
      (cam.y + input.mouse.y) - state.player.y,
      (cam.x + input.mouse.x) - state.player.x,
    );
    const frameInput = input.read(aim);
    state.muted = audio.isMuted();
    if (frameInput.mute) audio.toggleMute();

    if (state.mode === 'title') {
      stepWorld(state, frameInput, dt);
      if (menuKey === 'enter') {
        // Fresh run: wipe progress and rebuild the world clean.
        try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
        saved = null;
        state = createWorld(WORLD_SEED, null);
        state.hasSave = false;
        window.__palm.state = state;
        startPlay(state);
        started = true;
      } else if (menuKey === 'c' && saved) {
        startPlay(state);
        started = true;
      }
      menuKey = '';
    } else if (state.mode === 'playing') {
      if (frameInput.pause) {
        state.mode = 'paused';
      } else {
        stepWorld(state, frameInput, dt);
      }
    } else if (state.mode === 'paused') {
      if (frameInput.pause || frameInput.confirm) state.mode = 'playing';
    } else if (state.mode === 'busted' || state.mode === 'wasted' || state.mode === 'complete') {
      if (menuKey === 'enter' || frameInput.confirm) {
        resetRun(state);
      }
      menuKey = '';
    }

    if (state.saveDirty) {
      state.saveDirty = false;
      saved = { cash: state.player.cash, missionIndex: state.mission.idx, storyComplete: state.storyComplete };
      storeSave(state);
      state.hasSave = true;
      state.savedMission = state.mission.idx;
    }

    // Sound: drain one-shots, then set the loops from the live state.
    for (const s of state.sfx) audio.play(s);
    state.sfx.length = 0;
    const car = state.player.carId ? state.cars.find((c) => c.id === state.player.carId) : null;
    const driving = !!car && state.mode === 'playing';
    audio.setEngine(driving, car ? Math.abs(car.speed) / 340 : 0);
    const chaseNear = state.cars.some((c) => c.driver === 'police' &&
      Math.hypot(c.x - state.player.x, c.y - state.player.y) < 720);
    audio.setSiren(chaseNear && state.mode === 'playing');

    drawGame(ctx, state);
    void started;
  }
  requestAnimationFrame(frame);
}

void VIEW_W;
void VIEW_H;
