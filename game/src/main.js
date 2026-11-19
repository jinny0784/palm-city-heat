// Palm City Heat — the browser shell. It owns the canvas, the clock, the
// save file and the game modes the simulation does not (title, pause,
// the end screens); the simulation itself lives in world.js, the drawing
// in render.js, and the screenshot staging in shots.js.
//
// With ?shot=<name>&seed=<n> in the URL the page stages one deterministic
// scene instead of starting at the title — that is how the entry's
// screenshots are captured (see shots.json and scripts/shots.mjs).

import { createWorld, startRun, stepWorld, tryInteract } from './world.js';
import { drawGame, cameraFor } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot, SHOT_NAMES } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { w: canvas.width, h: canvas.height };
const WORLD_SEED = 1123581321;

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const isShot = SHOT_NAMES.includes(shotName);
if (isShot) document.body.classList.add('shot');

const input = createInput(canvas);
const audio = createAudio();
window.addEventListener('keydown', () => audio.unlock(), { once: true });
window.addEventListener('mousedown', () => audio.unlock(), { once: true });

const SAVE_KEY = 'palm-city-heat-save-v1';
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function storeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: world.cash,
      mission: world.mission ? world.mission.index : 5,
      story: world.storyComplete,
    }));
  } catch {
    /* private mode: play without saving */
  }
}

let world = createWorld(isShot ? (Number(params.get('seed')) >>> 0 || 7) : WORLD_SEED);
world.ui = { hasSave: !!loadSave() };

if (isShot) {
  stageShot(world, shotName);
  // Let staged scenes settle: fixed steps, no player input — except the
  // driving scene, which holds the throttle down so the car is genuinely
  // rolling when the frame is taken.
  if (world.mode === 'play') {
    if (shotName === 'driving') world.input.moveY = -1;
    const settle = shotName === 'driving' ? 20 : 45;
    for (let i = 0; i < settle; i++) stepWorld(world, 1 / 60);
  }
  world.events.length = 0;
}

function freshWorld(save) {
  world = createWorld(WORLD_SEED);
  world.ui = { hasSave: !!loadSave() };
  startRun(world, save);
}

function restartAfterEnd() {
  const save = {
    cash: Math.max(50, world.cash - 150),
    mission: world.mission ? world.mission.index : 0,
    story: false,
  };
  freshWorld(save);
  storeSave();
}

window.addEventListener('keydown', (e) => {
  if (world.mode === 'title' && e.code === 'KeyN') {
    freshWorld(null);
    storeSave();
  }
});

function playEvents() {
  for (const e of world.events) {
    if (e === 'shot') audio.shot();
    else if (e === 'click') audio.click();
    else if (e === 'hit') audio.hit();
    else if (e === 'crash') audio.crash();
    else if (e === 'enter') audio.enter();
    else if (e === 'pickup') audio.pickup();
    else if (e === 'cash') audio.cash();
    else if (e === 'jingle') { audio.jingle(); storeSave(); }
    else if (e === 'respray') audio.respray();
    else if (e === 'wasted' || e === 'busted') audio.sting();
  }
  world.events.length = 0;
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (isShot) dt = 1 / 60;

  const flags = input.flags;
  if (flags.mute) { audio.toggleMute(); flags.mute = false; }

  if (world.mode === 'title') {
    world.ui.hasSave = !!loadSave();
    if (flags.confirm) {
      flags.confirm = false;
      freshWorld(loadSave());
      storeSave();
    }
  } else if (world.mode === 'pause') {
    if (flags.pause || flags.confirm) { world.mode = 'play'; flags.pause = false; flags.confirm = false; }
  } else if (world.mode === 'wasted' || world.mode === 'busted') {
    if (flags.confirm) { flags.confirm = false; restartAfterEnd(); }
  } else if (world.mode === 'story') {
    if (flags.confirm) { flags.confirm = false; world.mode = 'play'; storeSave(); }
  } else if (world.mode === 'play') {
    if (flags.pause) {
      world.mode = 'pause';
      flags.pause = false;
    } else if (isShot) {
      // Staged scenes drive themselves: the driving shot keeps its
      // throttle down, the others hold still.
      world.input.moveX = 0;
      world.input.moveY = shotName === 'driving' ? -1 : 0;
      world.input.fire = false;
      stepWorld(world, dt);
    } else {
      input.applyTo(world, cameraFor(world, view));
      if (flags.interact) { tryInteract(world); flags.interact = false; }
      stepWorld(world, dt);
    }
  }
  // One-shot flags live for exactly one frame: whatever a mode did not
  // consume is dropped, so a click made while driving cannot restart the
  // game on the wasted screen a minute later.
  flags.interact = false;
  flags.pause = false;
  flags.confirm = false;

  playEvents();
  audio.setEngine(world.mode === 'play' && world.engineOn, world.engineLoad);
  audio.setSiren(world.mode === 'play' && world.wanted >= 2 && world.policeNear);
  drawGame(ctx, world, view);
  window.__palmReady = true;
}
requestAnimationFrame(frame);

// A debug hook for tests and curious players: the live world and the
// pieces needed to stage and step it.
window.__palm = {
  get world() { return world; },
  createWorld,
  startRun,
  stepWorld,
  stageShot,
  freshWorld,
};
