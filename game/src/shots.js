// Staged scenes for the screenshots. Each scene builds a world from a
// fixed seed and steps it with scripted inputs until it looks like a real
// moment of play, so the four shots in shots.json are honest frames of
// the game, not mock-ups.

import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { STEP } from './config.js';

const IDLE = { mx: 0, my: 0, sprint: false, handbrake: false, enterPressed: false, reloadPressed: false, fire: false, aimX: 0, aimY: 0 };

function step(world, input, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) world.step(STEP, input);
}

/** Walk the player to the nearest car and get in. Returns the car. */
function getInCar(world) {
  const p = world.player;
  let best = null;
  let bd = Infinity;
  for (const car of world.cars) {
    if (car.wrecked || car.driver === 'police') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bd) { bd = d; best = car; }
  }
  if (!best) return null;
  p.x = best.x + 40;
  p.y = best.y + 10;
  world.step(STEP, { ...IDLE, enterPressed: true });
  return world.player.inCar;
}

export function stageShot(name, seed) {
  const world = createWorld(createRandom(seed));
  if (name === 'title') {
    step(world, IDLE, 2.2);
    return { world, camCenter: { x: 1710, y: 1240 } };
  }
  if (name === 'street') {
    // On foot downtown, pistol out, Mara's first job on the banner.
    world.player.x = 1006;
    world.player.y = 806;
    step(world, { ...IDLE, aimX: 1400, aimY: 700 }, 3.4);
    return { world, camCenter: { x: world.player.x, y: world.player.y } };
  }
  if (name === 'driving') {
    const car = getInCar(world);
    if (car) {
      car.x = 1150;
      car.y = 1360 - 28;
      car.angle = 0;
      car.vx = 0;
      car.vy = 0;
      step(world, { ...IDLE, my: -1, aimX: car.x + 500, aimY: car.y }, 1.45);
    }
    const p = world.playerPos();
    return { world, camCenter: { x: p.x + 90, y: p.y } };
  }
  // chase: three stars, the law converging while the player runs east.
  const car = getInCar(world);
  if (car) {
    car.x = 1500;
    car.y = 1860 - 28;
    car.angle = 0;
    car.vx = 0;
    car.vy = 0;
    world.state.wanted = 3;
    step(world, { ...IDLE, my: -1, aimX: car.x + 500, aimY: car.y }, 4.2);
  }
  const p = world.playerPos();
  return { world, camCenter: { x: p.x + 60, y: p.y } };
}

export const SHOT_NAMES = ['title', 'street', 'driving', 'chase'];
