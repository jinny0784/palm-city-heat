// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, paused,
// wasted, busted and story-complete. Progress (cash, mission, story flag) is saved
// to localStorage; the title screen offers Continue when a save exists.
//
// ?seed=N fixes the city and every spawn. ?shot=title|street|driving|chase
// (with &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_FAIL, EVENT_HIT, EVENT_MISSION_DONE, EVENT_PICKUP, EVENT_SHOT, EVENT_STORY, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_RELOAD, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
// Debug hook for play-tests: the real world, live.
window.__palm = { world, seed };

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || typeof save !== 'object') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.saveData()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { hasSave: false, muted: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let saveTimer = 0;
  let newGameKey = false;
  // One-shot presses handleActions drains each frame; step() takes them from here
  // (a fixed step may run more than once per frame, so they are spent once).
  let pendingEnter = false;
  let pendingReload = false;
  let accumulator = 0;
  let last = performance.now();

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && !event.repeat) newGameKey = true;
  });

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fromSave) {
    world.reset();
    if (fromSave && save) world.applySave(save);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(fromSave ? 'Continuing your story in Palm City.' : 'Playing Palm City Heat.');
  }

  function endTo(next) {
    screen = next;
    writeSave();
    if (next === SCREEN_WASTED) announce('Wasted. Press Space to try again.');
    else if (next === SCREEN_BUSTED) announce('Busted. Press Space to try again.');
    else if (next === SCREEN_STORY) announce('Story complete. Press Space to keep playing in free roam.');
  }

  function cameraFor() {
    const pp = world.playerPos();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: Math.max(vw / 2, Math.min(4000 - vw / 2, pp.x)),
      y: Math.max(vh / 2, Math.min(3000 - vh / 2, pp.y)),
    };
  }

  function buildInput() {
    const move = input.move();
    const aim = input.aim();
    const cam = cameraFor();
    const inCar = !!world.player.inCar;
    return {
      mx: move.mx,
      my: move.my,
      sprint: input.sprint(),
      handbrake: inCar && input.space(),
      enterPressed: false,
      reloadPressed: false,
      fire: !inCar && (input.mouseDown() || input.space()),
      aimX: aim.x + cam.x - window.innerWidth / 2,
      aimY: aim.y + cam.y - window.innerHeight / 2,
    };
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    pendingEnter = !!(actions & ACTION_ENTER);
    pendingReload = !!(actions & ACTION_RELOAD);
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(!!save);
      else if (newGameKey && save) {
        save = null;
        startGame(false);
      }
      newGameKey = false;
      return;
    }
    newGameKey = false;
    if (screen === SCREEN_PLAY && (actions & ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (screen === SCREEN_PAUSED && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if ((screen === SCREEN_WASTED || screen === SCREEN_BUSTED || screen === SCREEN_STORY) && (actions & ACTION_CONFIRM)) {
      if (screen === SCREEN_STORY) {
        // Keep playing in free roam with the story done.
        screen = SCREEN_PLAY;
        announce('Free roam. The city is yours.');
      } else {
        startGame(!!save);
      }
    }
  }

  function react(events) {
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CRASH) audio.crash(0.6);
    if (events & EVENT_MISSION_DONE) {
      audio.jingle();
      writeSave();
    }
    if (events & EVENT_FAIL) audio.fail();
    if (events & EVENT_WASTED) endTo(SCREEN_WASTED);
    if (events & EVENT_BUSTED) endTo(SCREEN_BUSTED);
    if (events & EVENT_STORY) endTo(SCREEN_STORY);
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, sprint: false, handbrake: false, enterPressed: false, reloadPressed: false, fire: false, aimX: 0, aimY: 0 }, true);
      return;
    }
    const built = buildInput();
    built.enterPressed = pendingEnter;
    built.reloadPressed = pendingReload;
    pendingEnter = false;
    pendingReload = false;
    const events = world.step(STEP, built, false);
    react(events);
    // Engine hum + siren follow the live state, not events.
    const car = world.player.inCar;
    const speedNorm = car ? Math.min(1, Math.hypot(car.vx, car.vy) / 520) : 0;
    audio.engine(speedNorm, !!car);
    let policeNear = false;
    if (world.state.wanted >= 2) {
      const pp = world.playerPos();
      for (const c of world.cars) {
        if (c.driver === 'police' && Math.hypot(c.x - pp.x, c.y - pp.y) < 700) { policeNear = true; break; }
      }
    }
    audio.siren(policeNear);
    saveTimer += STEP;
    if (saveTimer >= 5) {
      saveTimer = 0;
      writeSave();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, { hasSave: !!save, muted: audio.muted });
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Palm City Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
