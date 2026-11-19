// Deterministic staged scenes for the entry screenshots. Each one builds
// the world from the shot's seed, puts the player and the traffic exactly
// where the scene needs them, and (in main.js) steps the simulation a
// fixed number of fixed-length steps before the frame is captured — so
// the same seed always produces the same picture.

import { startRun, spawnPoliceCar } from './world.js';

export const SHOT_NAMES = ['title', 'street', 'driving', 'chase'];

export function stageShot(world, name) {
  if (name === 'title') {
    world.mode = 'title';
    // Look out over the marina: beach, water, the boat, palms, city behind.
    world.camOverride = { x: 3300, y: 620 };
    return;
  }

  startRun(world, null);
  world.camOverride = null;
  const p = world.player;

  if (name === 'street') {
    // On foot on the pavement at the start of mission 1, phone fresh with
    // Mara's first message, pedestrians close by, traffic flowing past.
    p.x = 1220;
    p.y = 1310;
    p.angle = 0.5;
    const near = [[170, -70], [120, 130], [-60, 180]];
    world.peds.slice(0, 3).forEach((ped, i) => {
      ped.x = p.x + near[i][0];
      ped.y = p.y + near[i][1];
      ped.state = 'walk';
    });
    return;
  }

  if (name === 'driving') {
    // Behind the wheel on the avenue, rolling south with the traffic.
    const car = world.cars.find((c) => c.kind === 'parked' && c.type === 'sedan') ?? world.cars.find((c) => c.kind === 'parked');
    car.x = 1820 - 32;
    car.y = 560;
    car.angle = Math.PI / 2;
    car.speed = 232;
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    // Company on the road: two traffic cars ahead in the same flow.
    const traffic = world.cars.filter((c) => c.kind === 'traffic');
    if (traffic[0]) { traffic[0].axis = 'v'; traffic[0].road = 1820; traffic[0].dirSign = 1; traffic[0].x = 1820 - 32; traffic[0].y = 1180; traffic[0].speed = traffic[0].cruise; }
    if (traffic[1]) { traffic[1].axis = 'v'; traffic[1].road = 1820; traffic[1].dirSign = -1; traffic[1].x = 1820 + 32; traffic[1].y = 640; traffic[1].speed = traffic[1].cruise; }
    return;
  }

  if (name === 'chase') {
    // Three stars, a fast car, and the law arriving from behind.
    const car = world.cars.find((c) => c.kind === 'parked' && c.type === 'sports') ?? world.cars.find((c) => c.kind === 'parked');
    car.x = 1560;
    car.y = 1120 + 32;
    car.angle = 0;
    car.speed = 268;
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    world.wanted = 3;
    spawnPoliceCar(world, car.x - 190, car.y - 55, 0.15);
    spawnPoliceCar(world, car.x - 300, car.y + 45, -0.1);
    spawnPoliceCar(world, car.x - 130, car.y + 105, 0.3);
    for (const c of world.cars) if (c.kind === 'police') c.speed = 300;
    return;
  }
}
