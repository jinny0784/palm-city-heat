// Palm City Heat — a Node smoke test for the simulation. It imports the
// same modules the browser runs and drives them with synthetic input:
// city generation, walking, mission 1, entering and driving a car, the
// pistol, theft and the wanted level, police, the depot crates and the
// final mission's cash bags. Run with:  node scripts/smoke.mjs

import { createWorld, startRun, startMission, stepWorld, tryInteract } from '../game/src/world.js';
import { buildCity } from '../game/src/city.js';
import { PLACES } from '../game/src/config.js';

const DT = 1 / 60;
let passed = 0;
let failed = 0;

function check(name, cond) {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}`); }
}

function steps(world, n) {
  for (let i = 0; i < n; i++) stepWorld(world, DT);
}

function allFinite(world) {
  const pts = [world.player, ...world.cars, ...world.peds, ...world.cops, ...world.bullets];
  return pts.every((o) => Number.isFinite(o.x) && Number.isFinite(o.y));
}

function clearHeat(world) {
  world.wanted = 0;
  world.cars = world.cars.filter((c) => c.kind !== 'police');
  world.cops = [];
  world.bustedMeter = 0;
}

function teleport(world, x, y) {
  const p = world.player;
  if (p.car) { p.car.x = x; p.car.y = y; }
  p.x = x; p.y = y;
}

// --- the city ------------------------------------------------------------
{
  const a = buildCity(7);
  const b = buildCity(7);
  check('city generation is deterministic', a.buildings.length === b.buildings.length && a.buildings[0].x === b.buildings[0].x);
  check('city has buildings, palms and blocks', a.buildings.length > 100 && a.palms.length > 20 && a.blocks.length >= 25);
}

// --- a fresh world ---------------------------------------------------------
const world = createWorld(7);
check('traffic is flowing', world.cars.filter((c) => c.kind === 'traffic').length >= 10);
check('parked cars are scattered', world.cars.filter((c) => c.kind === 'parked').length >= 10);
check('pedestrians are out', world.peds.length >= 26);

startRun(world, null);
check('run starts in play mode', world.mode === 'play');
check('mission 1 auto-starts', world.mission?.index === 0 && world.mission?.stage === 0);
check('mission 1 points at the docks', world.mission.marker.x === PLACES.docks.x && world.mission.marker.y === PLACES.docks.y);

// --- walking ---------------------------------------------------------------
{
  const y0 = world.player.y;
  world.input.moveY = -1;
  world.input.aimX = world.player.x;
  world.input.aimY = world.player.y - 200;
  steps(world, 60);
  world.input.moveY = 0;
  check('walking moves the player north', world.player.y < y0 - 90);
  check('no NaN after walking', allFinite(world));
}

// --- mission 1, both legs ----------------------------------------------------
{
  teleport(world, PLACES.docks.x, PLACES.docks.y);
  steps(world, 3);
  check('docks pickup advances mission 1', world.mission.stage === 1);
  teleport(world, PLACES.cafe.x, PLACES.cafe.y);
  steps(world, 3);
  check('delivery completes mission 1 and starts mission 2', world.mission.index === 1);
  check('mission 1 paid out', world.cash === 120 + 300);
}

// --- cars: enter, accelerate, exit -------------------------------------------
{
  const car = world.cars.find((c) => c.kind === 'parked');
  teleport(world, car.x + car.radius + 12, car.y);
  tryInteract(world);
  check('E enters a parked car', world.player.car === car);
  const x0 = car.x;
  const y0 = car.y;
  world.input.moveY = -1; // W: forward
  steps(world, 90);
  world.input.moveY = 0;
  check('the car accelerates', car.speed > 55);
  check('the car travels', Math.hypot(car.x - x0, car.y - y0) > 30);
  tryInteract(world);
  check('E exits the car', world.player.car === null);
  check('no NaN after driving', allFinite(world));
}

// --- the pistol ----------------------------------------------------------------
{
  const ammo0 = world.player.ammo;
  world.input.aimX = world.player.x + 220;
  world.input.aimY = world.player.y;
  world.input.fire = true;
  steps(world, 2);
  world.input.fire = false;
  check('firing spends a bullet', world.player.ammo === ammo0 - 1 && world.stats.shots >= 1);
  clearHeat(world);
}

// --- theft ----------------------------------------------------------------------
{
  const traffic = world.cars.find((c) => c.kind === 'traffic' && c.driver);
  teleport(world, traffic.x + traffic.radius + 12, traffic.y);
  const wanted0 = world.wanted;
  tryInteract(world);
  check('stealing a traffic car takes it over', world.player.car === traffic);
  check('theft raises the wanted level', world.wanted > wanted0);
  check('the theft is counted', world.stats.steals >= 1);
  tryInteract(world);
  clearHeat(world);
}

// --- mission 3: the depot crates --------------------------------------------------
{
  startMission(world, 2);
  teleport(world, PLACES.depot.x, PLACES.depot.y);
  steps(world, 3);
  check('arriving at the depot starts the loud part', world.mission.stage === 1);
  world.player.ammo = 300;
  for (const crate of world.crates) {
    teleport(world, crate.x - 62, crate.y);
    world.input.aimX = crate.x;
    world.input.aimY = crate.y;
    world.input.fire = true;
    for (let i = 0; i < 150 && crate.alive; i++) {
      stepWorld(world, DT);
      if (i % 20 === 0) clearHeat(world);
    }
    world.input.fire = false;
    check(`crate at ${crate.x},${crate.y} shot apart`, !crate.alive);
  }
  steps(world, 3);
  check('all crates down advances mission 3', world.mission.stage === 2);
  clearHeat(world);
}

// --- mission 5: the cash bags -------------------------------------------------------
{
  startMission(world, 4);
  for (const bag of world.bags) {
    teleport(world, bag.x, bag.y);
    steps(world, 3);
  }
  check('all 3 bags collected', world.mission.bagsGot === 3);
  check('the boat leg begins', world.mission.stage === 1 && world.mission.marker.x === PLACES.boat.x);
  teleport(world, PLACES.boat.x, PLACES.boat.y);
  steps(world, 3);
  check('reaching the boat completes the story', world.storyComplete === true && world.mode === 'story');
}

// --- police ---------------------------------------------------------------------------
{
  const w2 = createWorld(11);
  startRun(w2, null);
  w2.wanted = 3;
  for (let i = 0; i < 10; i++) {
    w2.policeSpawnCd = 0;
    steps(w2, 6);
  }
  check('police cars respond at 3 stars', w2.cars.some((c) => c.kind === 'police'));
  check('foot cops respond at 3 stars', w2.cops.length >= 1);
  check('no NaN under police pressure', allFinite(w2));
}

// --- a save-shaped restart ---------------------------------------------------------------
{
  const w3 = createWorld(3);
  startRun(w3, { cash: 500, mission: 2, story: false });
  check('a save restores cash and mission', w3.cash === 500 && w3.mission.index === 2);
}

// --- a long, messy drive ---------------------------------------------------------------------
{
  const w4 = createWorld(99);
  startRun(w4, null);
  const car = w4.cars.find((c) => c.kind === 'parked');
  teleport(w4, car.x + car.radius + 12, car.y);
  tryInteract(w4);
  const moves = [[-1, 0], [-1, 1], [0, 1], [1, 0], [0, -1], [-1, -1]];
  for (let s = 0; s < 24; s++) {
    const [my, mx] = moves[s % moves.length];
    w4.input.moveY = my;
    w4.input.moveX = mx;
    steps(w4, 50);
  }
  check('a long drive stays finite', allFinite(w4));
  check('the player stays in the world', w4.player.x >= 0 && w4.player.x <= 4000 && w4.player.y >= 0 && w4.player.y <= 3000);
}

console.log(`\nsmoke: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
