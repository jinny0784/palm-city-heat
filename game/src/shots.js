// shots.js — deterministic staged scenes for the entry screenshots.
// Each scene builds a fresh world from the seed, scripts a few seconds of
// simulation, and leaves it frozen in a photogenic state. Same seed and
// same script always produce the same frame.

import { createWorld, stepWorld, enterCar, addHeat } from './world.js';

const IDLE = {
  moveX: 0, moveY: 0, sprint: false, fire: false, aim: 0,
  interact: false, throttle: 0, steer: 0,
};

function run(world, input, seconds) {
  const steps = Math.round(seconds * 30);
  for (let i = 0; i < steps; i++) stepWorld(world, input, 1 / 30);
}

function nearestCar(world, kind) {
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    if (car.kind !== kind || car.dead) continue;
    const d = (car.x - world.player.x) ** 2 + (car.y - world.player.y) ** 2;
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** Put the player in a car, placed on the eastbound lane of the avenue
 *  (road y = 900, lane centre y = 932) heading east. */
function stageCarOnAvenue(world, x) {
  const car = nearestCar(world, 'parked') || nearestCar(world, 'traffic');
  if (!car) return null;
  car.x = x;
  car.y = 932;
  car.angle = 0;
  car.speed = 0;
  world.player.x = x;
  world.player.y = 932;
  enterCar(world, car);
  return car;
}

export function buildShotScene(name, seed) {
  const world = createWorld(seed);
  if (name === 'title') {
    // A scenic central intersection, traffic rolling through.
    world.shotCam = { x: 1560, y: 1500 };
    run(world, IDLE, 2.5);
  } else if (name === 'street') {
    // On foot downtown, Mara's first job on the banner, city alive.
    world.player.x = 1015;
    world.player.y = 985;
    run(world, IDLE, 2);
  } else if (name === 'driving') {
    // Rolling east down the avenue with a traffic car ahead in the lane.
    stageCarOnAvenue(world, 1060);
    const traffic = world.cars.find((c) => c.kind === 'traffic');
    if (traffic) {
      traffic.x = 1750;
      traffic.y = 932;
      traffic.angle = 0;
      traffic.speed = 150;
      traffic.ai = { road: 'h', line: 900, dir: 0, tx: 2180, ty: 932 };
    }
    run(world, { ...IDLE, throttle: 1 }, 1.4);
    run(world, { ...IDLE, throttle: 0.55 }, 0.4);
  } else if (name === 'chase') {
    // Three stars, throttle down — then two interceptors staged onto the
    // player's tail so the pursuit is in frame when it freezes.
    stageCarOnAvenue(world, 760);
    addHeat(world, 3.2);
    run(world, { ...IDLE, throttle: 1 }, 2.2);
    const mine = world.player.inCar;
    const cops = world.cars.filter((c) => c.kind === 'police' && !c.dead);
    if (mine && cops.length > 0) {
      const ca = Math.cos(mine.angle);
      const sa = Math.sin(mine.angle);
      cops[0].x = mine.x - ca * 128 - sa * 27;
      cops[0].y = mine.y - sa * 128 + ca * 27;
      cops[0].angle = mine.angle;
      cops[0].speed = Math.abs(mine.speed);
      if (cops[1]) {
        cops[1].x = mine.x - ca * 225 + sa * 30;
        cops[1].y = mine.y - sa * 225 - ca * 30;
        cops[1].angle = mine.angle;
        cops[1].speed = Math.abs(mine.speed);
      }
    }
    run(world, { ...IDLE, throttle: 0.8 }, 0.45);
  }
  return world;
}
