// shots.js — deterministic staged scenes for the entry screenshots. Each
// scene arranges a fresh world into a clean, readable 1280x800 frame: the
// title over the living city, the player on foot at a mission start, a drive
// down the avenue, and a police chase in full swing. Used via
// game/index.html?shot=<name>&seed=<n>; also handy for manual QA.

import { startMission } from './world.js';
import { HEAT_PER_STAR } from './config.js';

function placeInCar(state, car, x, y, angle, speed) {
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = speed;
  car.driver = 'player';
  state.player.carId = car.id;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
}

function trafficCars(state) {
  return state.cars.filter((c) => c.driver === 'traffic');
}

export function setupShot(state, name) {
  state.toasts = [];
  if (name === 'title') {
    state.mode = 'title';
    // Hover the camera over the heart of the city, with the player's ride
    // waiting on the street below the wordmark.
    state.camera = { x: 1900, y: 1250 };
    const ride = state.cars.find((c) => c.driver === 'parked' && c.kind === 'sedan') || state.cars[0];
    placeInCar(state, ride, 1850, 1384, 0, 0);
    return;
  }
  state.mode = 'playing';
  state.stats.startedAt = 0;
  startMission(state, 0);
  state.toasts = state.toasts.slice(-1); // keep Mara's first call on screen

  if (name === 'street') {
    // On foot on the sidewalk corner where the game begins; traffic rolls
    // past in the correct lanes and the docks objective sits on the banner.
    state.player.x = 1118;
    state.player.y = 750;
    state.player.angle = -0.5;
    const traffic = trafficCars(state);
    if (traffic[0]) { traffic[0].x = 1560; traffic[0].y = 776; traffic[0].angle = Math.PI; traffic[0].speed = 130; }
    if (traffic[1]) { traffic[1].x = 1830; traffic[1].y = 776; traffic[1].angle = Math.PI; traffic[1].speed = 130; }
    if (traffic[2]) { traffic[2].x = 1290; traffic[2].y = 824; traffic[2].angle = 0; traffic[2].speed = 130; }
    return;
  }

  if (name === 'driving' || name === 'chase') {
    // Behind the wheel on the big east-west street, west of the avenue
    // crossing so the road ahead reads clean.
    const car = state.cars.find((c) => c.driver === 'parked' && c.kind === 'sedan') || state.cars[0];
    placeInCar(state, car, 1250, 1384, 0, 235);
    const traffic = trafficCars(state);
    if (traffic[0]) { traffic[0].x = 1980; traffic[0].y = 1384; traffic[0].angle = 0; traffic[0].speed = 150; }
    if (traffic[1]) { traffic[1].x = 2290; traffic[1].y = 1384; traffic[1].angle = 0; traffic[1].speed = 150; }
    if (traffic[2]) { traffic[2].x = 2060; traffic[2].y = 1336; traffic[2].angle = Math.PI; traffic[2].speed = 150; }
    if (name === 'chase') {
      state.heat = 3 * HEAT_PER_STAR;
      state.player.hp = 82;
      // Two interceptors right on the player's tail, converted from traffic.
      if (traffic[3]) {
        traffic[3].kind = 'police';
        traffic[3].color = '#22303c';
        traffic[3].driver = 'police';
        traffic[3].x = 1085;
        traffic[3].y = 1340;
        traffic[3].angle = 0;
        traffic[3].speed = 255;
      }
      if (traffic[4]) {
        traffic[4].kind = 'police';
        traffic[4].color = '#22303c';
        traffic[4].driver = 'police';
        traffic[4].x = 985;
        traffic[4].y = 1428;
        traffic[4].angle = 0;
        traffic[4].speed = 255;
      }
    }
    return;
  }

  // Unknown scene name: fall back to the street frame.
  state.player.x = 1118;
  state.player.y = 750;
}
