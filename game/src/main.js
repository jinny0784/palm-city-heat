// main.js — browser bootstrap: wires input, simulation, rendering and
// sound together, runs the title / pause / end-screen state machine, and
// persists progress (cash, mission, story completion) in localStorage.
// With ?shot=<name>&seed=<n> it instead stages one deterministic scene
// for the entry screenshots and flags the page ready.

import { createWorld, stepWorld, startMission } from './world.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { buildShotScene } from './shots.js';
import { sfx, setEngine, setSiren, setMuted, isMuted } from './audio.js';
import { SAVE_KEY, VIEW_W, VIEW_H, WORLD_W, WORLD_H } from './config.js';
import { clamp } from './random.js';

const params = new URLSearchParams(window.location.search);
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const input = createInput(canvas);

const IDLE = {
  moveX: 0, moveY: 0, sprint: false, fire: false, aim: 0,
  interact: false, throttle: 0, steer: 0,
};

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const shotName = params.get('shot');
if (shotName) {
  const seed = Number.parseInt(params.get('seed') || '7', 10) || 7;
  const world = buildShotScene(shotName, seed);
  document.body.classList.add('shot');
  const ui = { mode: shotName === 'title' ? 'title' : 'play', saveExists: false, muted: false, overKind: null };
  renderer.draw(world, ui);
  window.__palm = { world, createWorld, stepWorld, buildShotScene };
  requestAnimationFrame(() => {
    renderer.draw(world, ui);
    document.body.classList.add('shot-ready');
  });
} else {
  let world = createWorld(7);
  let mode = 'title';
  let overKind = null;
  let saveExists = !!loadSave();
  let saveT = 0;

  window.__palm = {
    get world() { return world; },
    createWorld,
    stepWorld,
  };

  function storeSave() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: world.player.cash,
        missionIndex: world.missionIndex,
        storyComplete: world.storyComplete,
      }));
      saveExists = true;
    } catch {
      /* storage unavailable: the run simply will not persist */
    }
  }

  function freshWorld() {
    return createWorld(((Math.random() * 90000) | 0) + 11);
  }

  function newGame() {
    world = freshWorld();
    mode = 'play';
    overKind = null;
    storeSave();
  }

  function continueGame() {
    const save = loadSave();
    world = freshWorld();
    if (save) {
      if (typeof save.cash === 'number') world.player.cash = save.cash;
      if (save.storyComplete) {
        world.storyComplete = true;
        world.mission = null;
        world.missionIndex = 5;
      } else if (save.missionIndex >= 1 && save.missionIndex <= 4) {
        startMission(world, save.missionIndex);
      }
    }
    mode = 'play';
    overKind = null;
  }

  function drainEvents() {
    for (const e of world.events.splice(0)) {
      const fn = sfx[e] || (e === 'wasted' || e === 'busted' ? sfx.fail : null);
      if (fn) fn();
    }
  }

  function buildSimInput() {
    const axis = input.axis();
    const p = world.player;
    const camX = clamp(p.x, VIEW_W / 2, WORLD_W - VIEW_W / 2);
    const camY = clamp(p.y, VIEW_H / 2, WORLD_H - VIEW_H / 2);
    const aimX = camX + (input.mouse.x - VIEW_W / 2);
    const aimY = camY + (input.mouse.y - VIEW_H / 2);
    const inCar = !!p.inCar;
    return {
      moveX: axis.x,
      moveY: axis.y,
      sprint: input.down('ShiftLeft') || input.down('ShiftRight'),
      fire: input.mouse.down || input.down('Space'),
      aim: Math.atan2(aimY - p.y, aimX - p.x),
      interact: input.pressed('KeyE'),
      throttle: inCar ? (axis.y < 0 ? 1 : axis.y > 0 ? -1 : 0) : 0,
      steer: inCar ? axis.x : 0,
    };
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (input.pressed('KeyM')) setMuted(!isMuted());

    if (mode === 'title') {
      stepWorld(world, IDLE, dt);
      world.events.length = 0;
      if (input.pressed('Enter')) newGame();
      else if (saveExists && input.pressed('KeyC')) continueGame();
    } else if (mode === 'play') {
      if (input.pressed('Escape') || input.pressed('KeyP')) {
        mode = 'pause';
      } else {
        stepWorld(world, buildSimInput(), dt);
        drainEvents();
        if (world.over) {
          mode = 'over';
          overKind = world.over;
          setEngine(false, 0);
          setSiren(false);
          storeSave();
        }
        saveT += dt;
        if (saveT > 4) {
          saveT = 0;
          storeSave();
        }
      }
    } else if (mode === 'pause') {
      if (input.pressed('Escape') || input.pressed('KeyP')) mode = 'play';
    } else if (mode === 'over') {
      if (overKind === 'complete' && input.pressed('KeyC')) {
        world.over = null;
        mode = 'play';
      } else if (input.pressed('Enter')) {
        try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
        newGame();
      }
    }

    if (mode === 'play') {
      const p = world.player;
      setEngine(!!p.inCar, p.inCar ? Math.abs(p.inCar.speed) / 430 : 0);
      const policeNear = world.cars.some(
        (c) => c.kind === 'police' && !c.dead && (c.x - p.x) ** 2 + (c.y - p.y) ** 2 < 560 * 560,
      );
      setSiren(policeNear && world.wanted.heat >= 2);
    }

    renderer.draw(world, { mode, overKind, saveExists, muted: isMuted() });
    input.postFrame();
  }
  requestAnimationFrame(frame);
}
