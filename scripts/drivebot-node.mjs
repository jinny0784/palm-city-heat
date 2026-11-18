// Node drive-test harness for Palm City Heat: runs the same world the
// browser runs, with the same input objects, to tune the driving bot
// WITHOUT paying for a headless-Chrome run per iteration.
// Driving model: intersection-to-intersection point pursuit. The car
// only ever aims at road intersections (guaranteed on-road), cruises
// ~230, slows near each waypoint so the turn stays on the pavement,
// and leaves the grid only for the short final approach to the objective.
// Usage: node scripts/drivebot-node.mjs [--seed N]
import { createRandom } from '../game/src/random.js';
import { createWorld } from '../game/src/world.js';
import { STEP, ROADS_V, ROADS_H, MISSIONS } from '../game/src/config.js';

const seedArg = process.argv.find((a) => a.startsWith('--seed'));
const SEED = seedArg ? parseInt(seedArg.slice(7), 10) : 7;

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const nearest = (arr, v) => arr.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), arr[0]);
const IDLE = { mx: 0, my: 0, sprint: false, handbrake: false, enterPressed: false, reloadPressed: false, fire: false, aimX: 0, aimY: 0 };

const w = createWorld(createRandom(SEED));
const st = w.state;
let simTime = 0;
function step(input, n = 1) { for (let i = 0; i < n; i += 1) { w.step(STEP, input, false); simTime += STEP; } }
function pos() { const p = w.playerPos(); return { x: Math.round(p.x), y: Math.round(p.y) }; }
function speed() { return Math.round(w.playerSpeed()); }

// Point pursuit to (tx, ty) until within `radius`. Speed falls with
// distance; pin recovery reverses straight out and retries.
function pursue(tx, ty, radius, label, maxSteps = 60 * 120) {
  let steps = 0; let lastX = pos().x; let lastY = pos().y; let lastMove = 0; let pins = 0; let lastHp = 100;
  while (steps < maxSteps && !st.over) {
    const p = pos();
    const dist = Math.hypot(tx - p.x, ty - p.y);
    if (dist < radius) return true;
    if (!w.player.inCar) return false;
    const car = w.player.inCar;
    if (car.health < lastHp - 15) { console.log(`${label}: car hit hard at (${p.x},${p.y}) hp ${Math.round(lastHp)} -> ${Math.round(car.health)} speed=${speed()}`); lastHp = car.health; }
    if (steps % 240 === 0) console.log(`${label}: pursue (${p.x},${p.y}) -> (${tx},${ty}) dist=${Math.round(dist)} speed=${speed()} hp=${Math.round(car.health)}`);
    // Dodge: a police car nearby (560 px/s, it aims at the player) gets a
    // lateral offset on the aim point so the bot does not meet it head-on.
    let aimX = tx; let aimY = ty;
    for (const c of w.cars) {
      if (c.driver !== 'police' || c.wrecked) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < 260 && d > 1) { aimX = tx + ((p.x - c.x) / d) * 130; aimY = ty + ((p.y - c.y) / d) * 130; }
    }
    const err = wrap(Math.atan2(aimY - p.y, aimX - p.x) - car.angle);
    let target = dist > 300 ? 210 : dist > 120 ? 170 : 130;
    if (Math.abs(err) > 0.6) target = 120;
    const input = { ...IDLE };
    const spd = speed();
    if (spd < target) input.my = -1;
    else if (spd > target + 40) input.my = 1;
    if (err > 0.08) input.mx = 1;
    else if (err < -0.08) input.mx = -1;
    if (Math.hypot(p.x - lastX, p.y - lastY) > 6) { lastX = p.x; lastY = p.y; lastMove = steps; }
    if (steps - lastMove > 72) {
      pins += 1;
      if (pins > 4) { console.log(`${label}: pursue pinned 4x at (${p.x},${p.y})`); return false; }
      step({ ...IDLE, my: 1 }, 90); // reverse straight out
      steps += 90; lastMove = steps;
      const p2 = pos(); lastX = p2.x; lastY = p2.y;
      continue;
    }
    step(input, 1); steps += 1;
  }
  return Math.hypot(tx - pos().x, ty - pos().y) < radius + 40;
}

// Full drive: intersection route to (tx, ty), then the final approach.
function driveTo(tx, ty, label) {
  let steals = 0;
  while (!st.over) {
    if (!w.player.inCar) {
      steals += 1;
      if (steals > 3 || !getCar()) { console.log(`${label}: no car`); return false; }
    }
    const p = pos();
    const rvC = nearest(ROADS_V, p.x); const rhC = nearest(ROADS_H, p.y);
    const rvT = nearest(ROADS_V, tx); const rhT = nearest(ROADS_H, ty);
    // Lane offsets, mirroring the traffic AI: southbound uses the lane 28px
    // west of centre, northbound 28px east; eastbound 28px south, westbound
    // 28px north. Driving at road centre means head-on collisions.
    const vLane = rhT > p.y ? -28 : 28;
    const hLane = rvT > rvC ? 28 : -28;
    const chain = [
      { x: rvC, y: rhC }, // nearest intersection
      { x: rvC + vLane, y: rhT }, // vertical leg, in-lane
      { x: rvT, y: rhT + hLane }, // horizontal leg, in-lane
    ];
    let ok = true;
    for (const wp of chain) {
      const q = pos();
      if (Math.hypot(wp.x - q.x, wp.y - q.y) < 50) continue;
      if (!pursue(wp.x, wp.y, 55, label)) { ok = false; break; }
      if (!w.player.inCar) break;
    }
    if (!ok || !w.player.inCar) continue;
    if (!pursue(tx, ty, 55, label)) { console.log(`${label}: final approach failed`); return false; }
    const d = Math.hypot(tx - pos().x, ty - pos().y);
    console.log(`${label}: arrived dist=${Math.round(d)} t=${simTime.toFixed(0)}s missionIndex=${st.missionIndex} missionObj=${st.missionObj} carHp=${w.player.inCar ? Math.round(w.player.inCar.health) : '-'} wanted=${st.wanted}`);
    return d < 130;
  }
  return false;
}

function walkStep(tx, ty) {
  const p = pos();
  const dx = tx - p.x; const dy = ty - p.y;
  const input = { ...IDLE, sprint: Math.hypot(dx, dy) > 200 };
  if (dx < -15) input.mx = -1;
  if (dx > 15) input.mx = 1;
  if (dy < -15) input.my = -1;
  if (dy > 15) input.my = 1;
  return input;
}

function walkTo(tx, ty, label = 'walk') {
  const p0 = pos();
  const rv = nearest(ROADS_V, p0.x); const rh = nearest(ROADS_H, ty);
  const wps = [{ x: rv, y: p0.y }, { x: rv, y: rh }, { x: tx, y: rh }, { x: tx, y: ty }];
  let steps = 0; let lastX = p0.x; let lastY = p0.y; let lastMove = 0; let side = 0;
  for (const wp of wps) {
    let guard = 0;
    while (Math.hypot(wp.x - pos().x, wp.y - pos().y) > 35 && guard < 60 * 25 && !st.over) {
      const p = pos();
      if (Math.hypot(p.x - lastX, p.y - lastY) > 8) { lastX = p.x; lastY = p.y; lastMove = steps; }
      if (steps - lastMove > 120 && side === 0) side = steps + 54;
      let input;
      if (side > steps) {
        const dx = wp.x - p.x; const dy = wp.y - p.y;
        input = { ...IDLE, sprint: true };
        if (Math.abs(dx) > Math.abs(dy)) { if (dy >= 0) input.my = 1; else input.my = -1; } else { if (dx >= 0) input.mx = 1; else input.mx = -1; }
      } else input = walkStep(wp.x, wp.y);
      step(input, 1); steps += 1; guard += 1;
      if (w.player.inCar) return true;
    }
  }
  return Math.hypot(tx - pos().x, ty - pos().y) < 45;
}

function getCar(maxSteps = 60 * 45) {
  let steps = 0;
  while (steps < maxSteps && !st.over) {
    if (w.player.inCar) return true;
    const p = pos();
    let best = null; let bd = Infinity;
    for (const c of w.cars) {
      if (c.driver !== 'parked' || c.wrecked) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return false;
    if (bd < 55) { step({ ...IDLE, enterPressed: true }, 1); steps += 1; continue; }
    walkTo(best.x, best.y, 'getCar');
    steps += 60;
  }
  return !!w.player.inCar;
}

// --- Run M1 ---
step(IDLE, 120);
console.log(`mission active: ${st.missionActive} index=${st.missionIndex} obj=${JSON.stringify(w.currentObjective())}`);
console.log(`player spawn: ${JSON.stringify(pos())}`);
if (!getCar()) { console.log('FAIL: could not steal a car'); process.exit(1); }
console.log(`got car at t=${simTime.toFixed(1)}s wanted=${st.wanted}`);

const m1 = MISSIONS[0];
driveTo(m1.objectives[0].x, m1.objectives[0].y, 'M1 leg1');
console.log(`after leg1: missionObj=${st.missionObj} missionIndex=${st.missionIndex}`);
if (st.missionIndex === 0 && st.missionObj === 1) {
  driveTo(m1.objectives[1].x, m1.objectives[1].y, 'M1 leg2');
}
console.log(`M1 RESULT: ${st.missionIndex >= 1 ? 'COMPLETE' : 'FAILED'} (missionIndex=${st.missionIndex}, t=${simTime.toFixed(0)}s, cash=$${st.cash}, over=${st.over})`);
process.exit(st.missionIndex >= 1 ? 0 : 1);
