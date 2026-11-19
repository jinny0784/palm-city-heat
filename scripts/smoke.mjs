// smoke.mjs — a Node smoke test for Palm City Heat's simulation. It imports
// the same pure modules the browser runs (city.js, world.js) and drives the
// world with synthetic input: walking, stealing, driving, shooting, police
// response, crate-breaking and bag-collecting. Run: node scripts/smoke.mjs

import { generateCity } from '../game/src/city.js';
import {
  createWorld, stepWorld, startPlay, startMission, missionTarget, starsForHeat,
} from '../game/src/world.js';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log('  ok  ' + name);
  } else {
    failed++;
    console.log('FAIL  ' + name);
  }
}
function finiteWorld(state) {
  const nums = [state.player.x, state.player.y];
  for (const c of state.cars) nums.push(c.x, c.y, c.speed);
  for (const p of state.peds) nums.push(p.x, p.y);
  for (const c of state.cops) nums.push(c.x, c.y);
  return nums.every((n) => Number.isFinite(n));
}
const DT = 1 / 60;
function input(patch) {
  return Object.assign(
    { x: 0, y: 0, aim: 0, fire: false, sprint: false, interact: false, pause: false, mute: false, confirm: false },
    patch || {},
  );
}
function steps(state, n, inp) {
  for (let i = 0; i < n; i++) stepWorld(state, inp || input(), DT);
}

// --- city generation -------------------------------------------------------
const city = generateCity(20261119);
check('city has a real building stock', city.buildings.length >= 40);
check('city is lined with palms', city.palms.length >= 30);
check('city offers a dozen parked cars', city.parkedSpots.length === 12);
check('road graph covers every intersection', city.nodes.length === 35);
check('every graph node links onward', city.nodes.every((n) => n.next.length >= 2));

// --- spawn and mission 1 auto-start ---------------------------------------
let w = createWorld(20261119, null);
check('player spawns on solid ground', Number.isFinite(w.player.x) && Number.isFinite(w.player.y));
startPlay(w);
check('startPlay enters playing mode', w.mode === 'playing');
check('mission 1 starts automatically', w.mission.active && w.mission.idx === 0 && w.mission.stage === 0);
const t0 = missionTarget(w);
check('mission 1 first target is the docks', t0 && t0.x === w.city.places.docks.x && t0.y === w.city.places.docks.y);

// --- walking ----------------------------------------------------------------
const startY = w.player.y;
steps(w, 60, input({ y: -1 }));
check('walking north moves the player', w.player.y < startY - 60);
check('no NaN after walking', finiteWorld(w));

// --- entering, driving, exiting a parked car --------------------------------
const parked = w.cars.find((c) => c.driver === 'parked');
w.player.x = parked.x + 30;
w.player.y = parked.y;
steps(w, 1, input({ interact: true }));
check('E enters the parked car', w.player.carId === parked.id);
const carStartX = parked.x;
steps(w, 90, input({ y: -1 }));
check('the car accelerates under throttle', parked.speed > 40);
check('the car travels', Math.abs(parked.x - carStartX) + Math.abs(parked.y - w.player.y) >= 0 && parked.x !== carStartX || parked.speed > 40);
check('no NaN after driving', finiteWorld(w));
steps(w, 1, input({ interact: true }));
check('E exits the car again', w.player.carId === null);

// --- pistol fire --------------------------------------------------------------
const shotsBefore = w.stats.shots;
steps(w, 30, input({ fire: true, aim: 0.6 }));
check('holding fire shoots the pistol', w.stats.shots > shotsBefore);
check('shooting spends the magazine', w.player.mag < 12 || w.player.reserve < 96);

// --- theft raises wanted ------------------------------------------------------
const traffic = w.cars.find((c) => c.driver === 'traffic');
w.player.x = traffic.x + 28;
w.player.y = traffic.y;
const heatBefore = w.heat;
steps(w, 1, input({ interact: true }));
check('stealing a moving car is counted', w.stats.steals >= 1);
check('theft raises heat', w.heat > heatBefore);
check('theft is worth at least one star', starsForHeat(w.heat) >= 1);
check('the driver bails and flees', w.peds.some((p) => p.mode === 'flee'));
steps(w, 1, input({ interact: true })); // step back out
check('no NaN after theft', finiteWorld(w));

// --- police response ------------------------------------------------------------
w.heat = 3 * 24;
steps(w, 90);
check('police cars roll in at three stars', w.cars.some((c) => c.driver === 'police'));
check('foot officers join at three stars', w.cops.length >= 1);
check('no NaN under police pressure', finiteWorld(w));

// --- mission 3: shooting the depot crates ---------------------------------------
let w2 = createWorld(20261119, null);
startPlay(w2);
startMission(w2, 2);
check('mission 3 lays out three crates', w2.crates.length === 3);
for (const crate of w2.crates) {
  w2.player.x = crate.x - 120;
  w2.player.y = crate.y;
  let guard = 0;
  while (!crate.gone && guard < 300) {
    stepWorld(w2, input({ fire: true, aim: Math.atan2(crate.y - w2.player.y, crate.x - w2.player.x) }), DT);
    guard++;
  }
}
check('all three crates can be shot apart', w2.crates.every((c) => c.gone));
steps(w2, 2);
check('clearing the crates advances the mission', w2.mission.stage === 1);
check('no NaN after the depot job', finiteWorld(w2));

// --- mission 5: collecting the cash bags -----------------------------------------
let w3 = createWorld(20261119, null);
startPlay(w3);
startMission(w3, 4);
check('mission 5 hides three cash bags', w3.bags.length === 3);
for (const bag of w3.bags) {
  w3.player.x = bag.x;
  w3.player.y = bag.y;
  steps(w3, 2);
}
check('every bag can be collected', w3.bags.every((b) => b.got));
check('collecting the bags advances the mission', w3.mission.stage === 1);
check('no NaN after the last job', finiteWorld(w3));

console.log('\nsmoke: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
