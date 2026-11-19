// Palm City Heat — the browser shell. It owns the canvas, the clock, the
// title / play / game-over flow, the save in localStorage, and the sound
// wiring. All simulation lives in world.js; this file only feeds it input
// and draws what it holds. With ?shot=<name>&seed=<n> it renders one
// staged frame instead, for the screenshots.

import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { drawHUD, drawOver, drawPaused, drawTitle, drawWorld, titleButtons } from './render.js';
import { stageShot } from './shots.js';
import { SAVE_KEY, STEP, VIEW_H, VIEW_W, WORLD } from './config.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');

const audio = createAudio();

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSave(world) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(world.saveData()));
  } catch {
    // Private mode or a full store: the game plays on without saving.
  }
}

// ------------------------------------------------------------ shot mode

if (shotName) {
  document.body.classList.add('shot');
  const seed = parseInt(params.get('seed') || '7', 10) || 7;
  const { world, camCenter } = stageShot(shotName, seed);
  window.__palm = { world, seed };
  const cam = {
    x: Math.max(0, Math.min(WORLD.width - VIEW_W, camCenter.x - VIEW_W / 2)),
    y: Math.max(0, Math.min(WORLD.height - VIEW_H, camCenter.y - VIEW_H / 2)),
  };
  let frames = 0;
  const renderFrame = () => {
    if (shotName === 'title') drawTitle(ctx, world, cam, false, null);
    else {
      drawWorld(ctx, world, cam);
      drawHUD(ctx, world, {});
    }
    frames += 1;
    if (frames < 3) requestAnimationFrame(renderFrame);
    else window.__shotReady = true;
  };
  requestAnimationFrame(renderFrame);
} else {
  // ------------------------------------------------------------ live game
  let mode = 'title'; // title | play | over
  let paused = false;
  let world = createWorld(createRandom((Date.now() % 90000) + 11));
  window.__palm = { world, seed: 0 };
  let save = loadSave();
  let overTimer = 0;
  let saveTimer = 0;

  const input = createInput(canvas, {
    onAnyKey: () => audio.unlock(),
    onPause: () => {
      if (mode === 'play') paused = !paused;
    },
    onMute: () => audio.toggleMute(),
    onEnter: () => {
      if (mode === 'over') toTitle();
    },
    onClick: (x, y) => {
      if (mode !== 'title') return;
      for (const b of titleButtons(!!save)) {
        if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
          audio.play('click');
          startGame(b.id === 'continue' ? save : null);
        }
      }
    },
  });

  function toTitle() {
    mode = 'title';
    paused = false;
    world = createWorld(createRandom((Date.now() % 90000) + 11));
    window.__palm = { world, seed: 0 };
    save = loadSave();
  }

  function startGame(savedRun) {
    world = createWorld(createRandom((Date.now() % 90000) + 11));
    if (savedRun) world.applySave(savedRun);
    window.__palm = { world, seed: 0 };
    mode = 'play';
    paused = false;
    overTimer = 0;
  }

  function cameraFor(target) {
    const shake = world.state.shake;
    const sx = shake > 0.1 ? (Math.random() * 2 - 1) * shake : 0;
    const sy = shake > 0.1 ? (Math.random() * 2 - 1) * shake : 0;
    return {
      x: Math.max(0, Math.min(WORLD.width - VIEW_W, target.x - VIEW_W / 2 + sx)),
      y: Math.max(0, Math.min(WORLD.height - VIEW_H, target.y - VIEW_H / 2 + sy)),
    };
  }

  let last = performance.now();
  let acc = 0;
  let titleCamX = 1500;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;

    if (mode === 'title') {
      // The city lives behind the title: traffic flows, nobody is wanted.
      acc += dt;
      while (acc > STEP) {
        world.step(STEP, { mx: 0, my: 0, fire: false });
        acc -= STEP;
      }
      titleCamX += dt * 26;
      if (titleCamX > 2350) titleCamX = 1500;
      const cam = { x: titleCamX, y: 980 };
      drawTitle(ctx, world, cam, !!save, input.mouse);
      audio.setEngine(0, false);
      audio.setSiren(0);
      return;
    }

    if (mode === 'play' && !paused) {
      const p = world.playerPos();
      const cam = cameraFor(p);
      acc += dt;
      let steps = 0;
      while (acc > STEP && steps < 5) {
        world.step(STEP, input.frame(cam, !!world.player.inCar));
        acc -= STEP;
        steps += 1;
      }
      if (steps === 5) acc = 0;
      for (const name of world.fx) audio.play(name);
      const car = world.player.inCar;
      audio.setEngine(car ? car.speed / 645 : 0, !!car);
      let siren = 0;
      if (world.state.wanted > 0) {
        let nearest = Infinity;
        for (const c of world.cars) {
          if (c.driver !== 'police') continue;
          nearest = Math.min(nearest, Math.hypot(c.x - p.x, c.y - p.y));
        }
        if (nearest < Infinity) siren = Math.max(0, 1 - nearest / 950);
      }
      audio.setSiren(siren);
      saveTimer += dt;
      if (saveTimer > 4) {
        saveTimer = 0;
        storeSave(world);
      }
      if (world.state.over) {
        overTimer += dt;
        if (overTimer > 1.1) {
          mode = 'over';
          storeSave(world);
        }
      }
    }

    const p = world.playerPos();
    const cam = cameraFor(p);
    drawWorld(ctx, world, cam);
    drawHUD(ctx, world, { muted: audio.muted });
    if (paused) drawPaused(ctx);
    if (mode === 'over') drawOver(ctx, world, world.state.over);
  }
  requestAnimationFrame(frame);
}
