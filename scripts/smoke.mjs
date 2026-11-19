// Palm City Heat — Node smoke test. Drives the real simulation modules
// (no browser, no DOM) through the game's core verbs and checks each one
// lands: the city generates, the player walks, Mara's first job starts on
// its own, cars can be entered, driven and stolen, the pistol fires,
// crates break, the police turn up, and the Last Job's cash bags collect.
// Run: node scripts/smoke.mjs — exits non-zero if any check fails.

import { createRandom } from '../game/src/random.js';
import { createWorld } from '../game/src/world.js';
import { STEP, ZONES } from '../game/src/config.js';

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`ok   ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name} ${detail}`);
  }
}

const IDLE = { mx: 0, my: 0, sprint: false, handbrake: false, enterPressed: false, reloadPressed: false, fire: false, aimX: 0, aimY: 0 };
function step(w, input, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) w.step(STEP, input);
}
function finiteWorld(w) {
  const pts = [w.player, ...w.cars, ...w.peds, ...w.cops, ...w.bullets];
  return pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}
function nearestCarTo(w, x, y, filter) {
  let best = null;
  let bd = Infinity;
  for (const car of w.cars) {
    if (!filter(car)) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

const w = createWorld(createRandom(7));
const st = w.state;

// --- the city generates
check('city has buildings', w.city.buildings.length > 60, `got ${w.city.buildings.length}`);
check('city has palms', w.city.palms.length > 60, `got ${w.city.palms.length}`);
check('traffic and parked cars exist', w.cars.length >= 28, `got ${w.cars.length}`);
check('the gold Comet exists', !!w.comet && w.comet.target === true);
check('pedestrians exist', w.peds.length >= 20, `got ${w.peds.length}`);
check('player spawns at the spawn point', w.player.x === ZONES.spawn.x && w.player.y === ZONES.spawn.y);

// --- walking
const startX = w.player.x;
step(w, { ...IDLE, mx: 1 }, 1);
check('walking east moves the player', w.player.x > startX + 120, `x ${startX} -> ${w.player.x}`);
check('no NaN after walking', finiteWorld(w));

// --- mission M1 auto-starts
step(w, IDLE, 3.2);
check('mission 1 auto-starts', st.missionActive && st.missionIndex === 0, `active=${st.missionActive} idx=${st.missionIndex}`);
const obj = w.currentObjective();
check('objective points at the docks', !!obj && obj.kind === 'goto' && Math.abs(obj.x - ZONES.docks.x) < 2, JSON.stringify(obj));

// --- M1 leg 1 completes on arrival (walk the player there directly)
w.player.x = ZONES.docks.x;
w.player.y = ZONES.docks.y;
step(w, IDLE, 0.2);
check('M1 leg 1 completes at the docks', st.missionObj === 1, `obj=${st.missionObj}`);

// --- enter a parked car, accelerate, exit
const parked = nearestCarTo(w, w.player.x, w.player.y, (c) => c.driver === 'parked' && !c.wrecked);
w.player.x = parked.x + 30;
w.player.y = parked.y;
step(w, { ...IDLE, enterPressed: true }, 0.05);
check('E enters a parked car', w.player.inCar === parked, `inCar=${!!w.player.inCar}`);
step(w, { ...IDLE, my: -1 }, 1.1);
check('the car accelerates', parked.speed > 140, `speed=${parked.speed.toFixed(0)}`);
check('the car moved', Math.hypot(parked.x - (ZONES.docks.x + 30), parked.y - ZONES.docks.y) > 60);
step(w, { ...IDLE, enterPressed: true }, 0.05);
check('E exits the car', w.player.inCar === null);

// --- pistol fire
const shotsBefore = st.stats.shots;
step(w, { ...IDLE, fire: true, aimX: w.player.x + 300, aimY: w.player.y }, 0.4);
check('the pistol fires', st.stats.shots > shotsBefore, `shots=${st.stats.shots}`);
check('ammo is spent', w.player.ammo < 12, `ammo=${w.player.ammo}`);

// --- stealing a traffic car raises the wanted level
const traffic = nearestCarTo(w, w.player.x, w.player.y, (c) => c.driver === 'traffic');
w.player.x = traffic.x + 20;
w.player.y = traffic.y;
const wantedBefore = st.wanted;
step(w, { ...IDLE, enterPressed: true }, 0.05);
check('a traffic car can be stolen', w.player.inCar === traffic && st.stats.stolen >= 1);
check('theft raises wanted', st.wanted > wantedBefore, `wanted ${wantedBefore} -> ${st.wanted}`);
step(w, { ...IDLE, enterPressed: true }, 0.05); // step back out

// --- police spawn at three stars
st.wanted = 3;
let policeSeen = false;
for (let i = 0; i < 60 * 25 && !policeSeen; i += 1) {
  w.step(STEP, IDLE);
  policeSeen = w.cars.some((c) => c.driver === 'police');
}
check('police cars spawn and give chase', policeSeen);
check('no NaN with police active', finiteWorld(w));

// --- shooting a depot crate breaks it
const crate = w.crates[0];
w.player.x = crate.x - 60;
w.player.y = crate.y;
w.player.ammo = 12;
let guard = 0;
while (!crate.dead && guard < 60 * 6) {
  w.step(STEP, { ...IDLE, fire: true, aimX: crate.x, aimY: crate.y });
  guard += 1;
}
check('a depot crate can be shot apart', crate.dead, `hp=${crate.hp} after ${guard} ticks`);

// --- the Last Job: bags collect and the leg advances
st.missionActive = false;
st.missionIndex = 4;
st.missionWait = 0.01;
st.wanted = 0;
step(w, IDLE, 0.3);
check('mission 5 starts', st.missionActive && st.missionIndex === 4, `active=${st.missionActive}`);
check('bags are live', w.bags.every((b) => b.active && !b.got));
for (const bag of w.bags) {
  w.player.x = bag.x;
  w.player.y = bag.y;
  step(w, IDLE, 0.15);
}
check('all 3 bags collect', st.bagsGot === 3, `bags=${st.bagsGot}`);
check('the boat leg follows', st.missionObj === 1, `obj=${st.missionObj}`);

// --- a long mixed drive leaves nothing NaN and nothing out of the world
const car2 = nearestCarTo(w, w.player.x, w.player.y, (c) => !c.wrecked && c.driver !== 'police');
w.player.x = car2.x + 20;
w.player.y = car2.y;
step(w, { ...IDLE, enterPressed: true }, 0.05);
step(w, { ...IDLE, my: -1, mx: 0.2 }, 6);
step(w, { ...IDLE, my: -1 }, 6);
check('no NaN after a long drive', finiteWorld(w));
check('everything stays inside the world', w.cars.every((c) => c.x >= 0 && c.x <= 4000 && c.y >= 0 && c.y <= 3000));

// --- save data round-trips
const save = w.saveData();
check('save data carries cash and mission index', typeof save.cash === 'number' && save.missionIndex === 4);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
