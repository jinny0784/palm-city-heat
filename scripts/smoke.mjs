// smoke.mjs — headless checks for the Palm City Heat simulation.
// Imports the pure modules (city + world) and steps the world with
// scripted input: city generation, walking, Mara's first mission
// auto-starting, entering and exiting a car, acceleration, pistol fire,
// theft raising the wanted level, police spawning, shooting the depot
// crates and collecting the final job's cash bags. Exits non-zero on any
// failure.

import { createWorld, stepWorld, startMission, addHeat, starsOf, missionTarget } from '../game/src/world.js';
import { generateCity, PLACES } from '../game/src/city.js';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`ok   ${name}`); }
  else { failed++; console.log(`FAIL ${name}`); }
}

const IDLE = {
  moveX: 0, moveY: 0, sprint: false, fire: false, aim: 0,
  interact: false, throttle: 0, steer: 0,
};
function step(w, input, n) {
  for (let i = 0; i < n; i++) stepWorld(w, input, 1 / 30);
}
function finite(w) {
  const ents = [w.player, ...w.cars, ...w.peds, ...w.cops, ...w.bullets];
  return ents.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y));
}
function calm(w) {
  // Reset the law so later stages are not interrupted.
  w.wanted.heat = 0;
  w.cars = w.cars.filter((c) => c.kind !== 'police');
  w.cops = [];
  w.player.hp = 100;
  w.player.busted = 0;
}

// --- city generation -------------------------------------------------------
const city = generateCity(7);
check('city generates buildings', city.buildings.length > 40);
check('city generates parking spots', city.parkingSpots.length >= 12);
check('city generates palms', city.palms.length > 20);
check('city generates props', city.props.length > 40);

// --- world boot and the first mission --------------------------------------
const w = createWorld(7);
check('player spawns at the spawn point', Math.abs(w.player.x - PLACES.spawn.x) < 1 && Math.abs(w.player.y - PLACES.spawn.y) < 1);
check('mission 1 auto-starts', !!w.mission && w.mission.index === 0 && w.mission.stage === 0);
check('mission 1 target is the docks', (() => {
  const t = missionTarget(w);
  return !!t && t.x === PLACES.docks.x && t.y === PLACES.docks.y;
})());
check('traffic is on the road', w.cars.some((c) => c.kind === 'traffic'));
check('about a dozen parked cars', w.cars.filter((c) => c.kind === 'parked').length >= 10);
check('pedestrians are walking', w.peds.length > 15);

// --- walking ---------------------------------------------------------------
const startX = w.player.x;
step(w, { ...IDLE, moveX: 1, aim: 0 }, 45);
check('walking moves the player', w.player.x > startX + 40);
check('positions stay finite while walking', finite(w));

// --- entering, driving, exiting --------------------------------------------
const parked = w.cars.find((c) => c.kind === 'parked');
w.player.x = parked.x;
w.player.y = parked.y;
step(w, { ...IDLE, interact: true }, 1);
check('E enters a parked car', !!w.player.inCar);
const myCar = w.player.inCar;
// Put the car on a clear stretch of the north-south avenue for the run.
myCar.x = 940;
myCar.y = 640;
myCar.angle = -Math.PI / 2;
myCar.speed = 0;
let topSpeed = 0;
for (let i = 0; i < 80; i++) {
  stepWorld(w, { ...IDLE, throttle: 1 }, 1 / 30);
  topSpeed = Math.max(topSpeed, Math.abs(myCar.speed));
}
check('the car accelerates hard', topSpeed > 130);
check('the car covers ground', Math.hypot(myCar.x - 940, myCar.y - 640) > 60);
step(w, { ...IDLE, interact: true }, 1);
check('E exits the car', w.player.inCar === null);

// --- pistol fire -------------------------------------------------------------
const ammoBefore = w.player.ammo;
let sawBullet = false;
for (let i = 0; i < 12; i++) {
  stepWorld(w, { ...IDLE, fire: true, aim: 0.6 }, 1 / 30);
  if (w.bullets.length > 0) sawBullet = true;
}
check('the pistol fires bullets', sawBullet);
check('firing spends ammo', w.player.ammo < ammoBefore);

// --- theft -------------------------------------------------------------------
const traffic = w.cars.find((c) => c.kind === 'traffic');
w.player.x = traffic.x;
w.player.y = traffic.y;
const heatBefore = w.wanted.heat;
step(w, { ...IDLE, interact: true }, 1);
check('E steals the traffic car', w.player.inCar === traffic);
check('theft raises the wanted level a star', w.wanted.heat >= heatBefore + 0.99 && starsOf(w) >= 1);
step(w, { ...IDLE, interact: true }, 1);
check('the stolen car can be exited', w.player.inCar === null);

// --- police response ---------------------------------------------------------
addHeat(w, 2.2);
step(w, IDLE, 160);
check('police cars spawn at three stars', w.cars.some((c) => c.kind === 'police'));
check('positions stay finite under pursuit', finite(w));

// --- mission 3: depot crates ---------------------------------------------------
calm(w);
startMission(w, 2);
check('mission 3 resets three live crates', w.crates.filter((c) => c.alive).length === 3);
const crate = w.crates[0];
w.player.x = crate.x - 90;
w.player.y = crate.y;
w.player.ammo = 60;
let broke = false;
for (let i = 0; i < 240 && !broke; i++) {
  const aim = Math.atan2(crate.y - w.player.y, crate.x - w.player.x);
  stepWorld(w, { ...IDLE, fire: true, aim }, 1 / 30);
  if (!crate.alive) broke = true;
}
check('shooting destroys a depot crate', broke);

// --- mission 5: the cash bags --------------------------------------------------
calm(w);
startMission(w, 4);
check('mission 5 starts with three bags', w.mission.bags.filter((b) => !b.taken).length === 3);
for (const bag of [...w.mission.bags]) {
  w.player.x = bag.x;
  w.player.y = bag.y;
  step(w, IDLE, 3);
}
check('all three bags collect', w.mission.bags.every((b) => b.taken) && w.mission.stage === 1);
check('positions stay finite at the end', finite(w));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
