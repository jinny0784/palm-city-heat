// The screenshot scenes behind ?shot=title|street|driving|chase. Each one plays the
// real rules forward from a fresh world for a fixed number of steps with scripted
// inputs, so the frame is what a short game really looks like and the same seed
// always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const IDLE = { mx: 0, my: 0, sprint: false, handbrake: false, enterPressed: false, reloadPressed: false, fire: false, aimX: 0, aimY: 0 };

function driveInput(steer) {
  return { mx: steer, my: -1, sprint: false, handbrake: false, enterPressed: false, reloadPressed: false, fire: false, aimX: 0, aimY: 0 };
}

function stepFor(world, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step(STEP, input, false);
}

/** Put the player in the nearest parked car, placed on a road heading south. */
function stageDrive(world, x, y) {
  let car = null;
  let best = Infinity;
  for (const c of world.cars) {
    if (c.driver !== 'parked') continue;
    const d = Math.hypot(c.x - world.player.x, c.y - world.player.y);
    if (d < best) {
      best = d;
      car = c;
    }
  }
  if (!car) return;
  car.x = x;
  car.y = y;
  car.angle = Math.PI / 2;
  car.driver = 'player';
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  world.player.inCar = car;
  world.player.x = x;
  world.player.y = y;
}

/**
 * Set `world` to the named scene (title, street, driving or chase; any other name
 * is title) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'street' && name !== 'driving' && name !== 'chase') {
    // Title: the city alive behind the menu for five seconds.
    for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, IDLE, true);
    return { screen: SCREEN_TITLE };
  }
  if (name === 'street') {
    // On foot at a busy corner: traffic rolling past, pedestrians on the sidewalk.
    world.player.x = 1000;
    world.player.y = 800;
    world.player.angle = Math.PI / 2;
    stepFor(world, 6, IDLE);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'driving') {
    // Behind the wheel on Coral Row, traffic ahead, palms on the sidewalk.
    stageDrive(world, 932, 700);
    stepFor(world, 5, driveInput(0));
    return { screen: SCREEN_PLAY };
  }
  // Chase: three stars, two police cars closing in, the player flooring it.
  stageDrive(world, 932, 700);
  world.addWanted(3);
  stepFor(world, 3, driveInput(0));
  stepFor(world, 4, driveInput(0.4));
  stepFor(world, 2, driveInput(-0.3));
  return { screen: SCREEN_PLAY };
}
