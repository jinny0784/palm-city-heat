// world.js — the Palm City Heat simulation: player, cars and traffic AI,
// pedestrians, police and the wanted system, gunfire, pickups and Mara
// Voss's five-mission story. Pure logic driven by a seeded RNG; the
// browser layer feeds it input and draws the result. No DOM in here, so
// the Node smoke test can step the whole world headlessly.

import { generateCity, PLACES, SPRAY_BAY, circleBlocked } from './city.js';
import {
  WORLD_W, WORLD_H, ROADS_X, ROADS_Y, ROAD_W, WATER_X,
  PLAYER, CAR_TYPES, CAR_COLORS, PED_COLORS, SPRAY_COST,
} from './config.js';
import { clamp, dist, mulberry32, pick, randRange, turnToward, wrapAngle } from './random.js';

let nextId = 1;

export const MISSIONS = [
  { name: 'First Run', reward: 250 },
  { name: 'Hot Wheels', reward: 400 },
  { name: 'Loud Message', reward: 350 },
  { name: 'The Pickup', reward: 500 },
  { name: 'Last Job', reward: 1200 },
];

const MARA_INTRO = [
  "Mara Voss: Package waiting at the docks. Grab it, bring it to the warehouse. No questions.",
  "Mara Voss: A gold Sunfire GT just rolled into town. Take it. My garage, and the clock is ticking.",
  "Mara Voss: A rival crew stashes gear at the depot. Shoot their crates open, then lie low at the safehouse.",
  "Mara Voss: My driver is stranded at the airstrip. Pick him up, get him to the marina. Expect company.",
  "Mara Voss: Last job. Three cash bags across town, then the boat at the marina. Don't be late.",
];

export function starsOf(world) {
  return clamp(Math.floor(world.wanted.heat), 0, 5);
}

export function addToast(world, text, dur = 6) {
  world.toasts.push({ text, until: world.time + dur });
  while (world.toasts.length > 3) world.toasts.shift();
}

export function addHeat(world, amount) {
  world.wanted.heat = clamp(world.wanted.heat + amount, 0, 5.99);
  world.wanted.lastSeen = world.time;
}

/** Heat only rises when someone sees the crime: a pedestrian within
 *  `witnessRadius`, or any officer or police car within 520px. */
export function reportCrime(world, amount, x, y, witnessRadius = 300) {
  let seen = false;
  for (const p of world.peds) {
    if (p.state !== 'down' && dist(p.x, p.y, x, y) < witnessRadius) { seen = true; break; }
  }
  if (!seen) {
    for (const c of world.cops) if (dist(c.x, c.y, x, y) < 520) { seen = true; break; }
  }
  if (!seen) {
    for (const c of world.cars) {
      if (c.kind === 'police' && !c.dead && dist(c.x, c.y, x, y) < 520) { seen = true; break; }
    }
  }
  if (seen) addHeat(world, amount);
  return seen;
}

function addParticle(world, x, y, opts = {}) {
  const rng = world.rng;
  world.particles.push({
    x, y,
    vx: randRange(rng, -1, 1) * (opts.spread ?? 60),
    vy: randRange(rng, -1, 1) * (opts.spread ?? 60),
    life: opts.life ?? 0.4,
    maxLife: opts.life ?? 0.4,
    color: opts.color ?? '#ffd23f',
    size: opts.size ?? 3,
  });
}

export function burst(world, x, y, color, n = 8, spread = 90) {
  for (let i = 0; i < n; i++) addParticle(world, x, y, { color, spread, life: randRange(world.rng, 0.25, 0.6), size: randRange(world.rng, 2, 4.5) });
}

function spawnCar(world, { x, y, angle, model, kind, color }) {
  const car = {
    id: nextId++, x, y, angle, speed: 0,
    model, kind, color: color ?? pick(world.rng, CAR_COLORS),
    hp: CAR_TYPES[model].hp, driver: null, stolen: false,
    ai: null, fleeT: 0, dead: false, deadT: 0,
  };
  world.cars.push(car);
  return car;
}

/** Give a traffic car a road leg to follow: a lane-correct waypoint at the
 *  next intersection along its road. */
function trafficLeg(world, car) {
  const LANE = ROAD_W / 4;
  const ai = car.ai;
  if (ai.road === 'h') {
    const line = ai.line;
    let tx;
    if (ai.dir === 0) {
      const next = ROADS_X.find((cx) => cx > car.x + 40);
      tx = next === undefined ? WORLD_W - 260 : next;
    } else {
      const prev = [...ROADS_X].reverse().find((cx) => cx < car.x - 40);
      tx = prev === undefined ? 130 : prev;
    }
    ai.tx = tx;
    ai.ty = line + (ai.dir === 0 ? LANE : -LANE);
  } else {
    const line = ai.line;
    let ty;
    if (ai.dir === 1) {
      const next = ROADS_Y.find((cy) => cy > car.y + 40);
      ty = next === undefined ? WORLD_H - 130 : next;
    } else {
      const prev = [...ROADS_Y].reverse().find((cy) => cy < car.y - 40);
      ty = prev === undefined ? 120 : prev;
    }
    ai.tx = line + (ai.dir === 1 ? LANE : -LANE);
    ai.ty = ty;
  }
}

function spawnTrafficCar(world, anywhere = false) {
  const rng = world.rng;
  for (let tries = 0; tries < 12; tries++) {
    const ix = pick(rng, ROADS_X);
    const iy = pick(rng, ROADS_Y);
    const x = ix + randRange(rng, -260, 260);
    const y = iy + randRange(rng, -260, 260);
    if (!anywhere && dist(x, y, world.player.x, world.player.y) < 300) continue;
    const road = rng() < 0.5 ? 'h' : 'v';
    const dir = road === 'h' ? (rng() < 0.5 ? 0 : 2) : (rng() < 0.5 ? 1 : 3);
    const car = spawnCar(world, {
      x, y, angle: 0, model: rng() < 0.22 ? 'sport' : 'sedan', kind: 'traffic',
    });
    car.ai = { road, line: road === 'h' ? iy : ix, dir, tx: x, ty: y };
    trafficLeg(world, car);
    car.angle = Math.atan2(car.ai.ty - y, car.ai.tx - x);
    car.driver = 'traffic';
    return car;
  }
  return null;
}

function pedRouteFor(world, x, y) {
  // Snap to the nearest road's sidewalk and walk it between cross streets.
  let best = null;
  for (const cx of ROADS_X) {
    for (const side of [-1, 1]) {
      const fx = cx + side * (ROAD_W / 2 + 15);
      const d = Math.abs(fx - x);
      if (!best || d < best.d) best = { d, vertical: true, fixed: fx };
    }
  }
  for (const cy of ROADS_Y) {
    for (const side of [-1, 1]) {
      const fy = cy + side * (ROAD_W / 2 + 15);
      const d = Math.abs(fy - y);
      if (!best || d < best.d) best = { d, vertical: false, fixed: fy };
    }
  }
  if (best.vertical) {
    const crosses = ROADS_Y.filter((cy) => Math.abs(cy - y) < 700);
    const lo = Math.max(50, (crosses.length ? Math.min(...crosses) : y - 300) - 260);
    const hi = Math.min(WORLD_H - 50, (crosses.length ? Math.max(...crosses) : y + 300) + 260);
    return { vertical: true, fixed: best.fixed, from: lo, to: hi, pos: y, dir: world.rng() < 0.5 ? 1 : -1 };
  }
  const crosses = ROADS_X.filter((cx) => Math.abs(cx - x) < 700);
  const lo = Math.max(50, (crosses.length ? Math.min(...crosses) : x - 300) - 260);
  const hi = Math.min(3600, (crosses.length ? Math.max(...crosses) : x + 300) + 260);
  return { vertical: false, fixed: best.fixed, from: lo, to: hi, pos: x, dir: world.rng() < 0.5 ? 1 : -1 };
}

function spawnPed(world, x, y) {
  const rng = world.rng;
  if (x === undefined) {
    const vertical = rng() < 0.5;
    if (vertical) {
      x = pick(rng, ROADS_X) + (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 15);
      y = randRange(rng, 80, WORLD_H - 80);
    } else {
      x = randRange(rng, 80, 3560);
      y = pick(rng, ROADS_Y) + (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 15);
    }
  }
  const ped = {
    id: nextId++, x, y, angle: randRange(rng, 0, Math.PI * 2),
    speed: randRange(rng, 52, 84), state: 'walk',
    route: pedRouteFor(world, x, y),
    color: pick(rng, PED_COLORS), downT: 0, fleeT: 0, fleeX: 0, fleeY: 0, dropped: false,
  };
  world.peds.push(ped);
  return ped;
}

function depotCrates() {
  return [
    { x: 470, y: 2300, hp: 3, alive: true },
    { x: 565, y: 2420, hp: 3, alive: true },
    { x: 480, y: 2520, hp: 3, alive: true },
  ];
}

function placePickups(world) {
  const fixed = [
    { x: 1620, y: 1015, type: 'health', amount: 35 },
    { x: 3560, y: 1020, type: 'health', amount: 35 },
    { x: 520, y: 2330, type: 'ammo', amount: 24 },
    { x: 3500, y: 2590, type: 'ammo', amount: 24 },
    { x: 2210, y: 965, type: 'armour', amount: 50 },
    { x: 330, y: 1470, type: 'star', amount: 1 },
    { x: 2830, y: 2130, type: 'star', amount: 1 },
    { x: 1560, y: 330, type: 'star', amount: 1 },
  ];
  for (const f of fixed) world.pickups.push({ ...f, active: true, respawnT: 0, temp: false, expireT: 0 });
}

export function createWorld(seed = 1) {
  const city = generateCity(seed);
  const world = {
    seed,
    rng: null,
    city,
    time: 0,
    player: {
      x: PLACES.spawn.x, y: PLACES.spawn.y, angle: -Math.PI / 2,
      hp: PLAYER.hp, armour: 0, cash: PLAYER.startCash, ammo: PLAYER.startAmmo,
      inCar: null, fireCd: 0, busted: 0, speedNow: 0, walk: 0,
    },
    cars: [], peds: [], cops: [], bullets: [], particles: [], pickups: [],
    crates: depotCrates(),
    toasts: [], events: [],
    wanted: { heat: 0, lastSeen: -99 },
    mission: null, missionIndex: 0,
    driver: null,
    over: null, storyComplete: false,
    stats: { earned: 0, shots: 0, stolen: 0, crashes: 0 },
    shake: 0, sprayT: 0, sprayWarned: false, policeSpawnT: 0, copSpawnT: 0,
    shotCam: null,
  };
  // The world RNG is separate from the city's so generation and
  // simulation stay deterministic independently.
  world.rng = mulberry32(seed * 31337 + 101);

  // Parked cars on the generated lots (the gold car's spot stays empty
  // until Mara's second job begins).
  const spots = city.parkingSpots.filter((s) => !s.reserved);
  for (let i = 0; i < spots.length && world.cars.filter((c) => c.kind === 'parked').length < 12; i += 2) {
    const s = spots[i];
    spawnCar(world, {
      x: s.x, y: s.y, angle: s.angle,
      model: world.rng() < 0.25 ? 'sport' : 'sedan', kind: 'parked',
    });
  }
  for (let i = 0; i < 11; i++) spawnTrafficCar(world);
  for (let i = 0; i < 26; i++) spawnPed(world);
  placePickups(world);
  startMission(world, 0);
  return world;
}

/** Enter a car. Stealing a traffic car throws its driver out (he flees)
 *  and always raises the wanted level by one star. */
export function enterCar(world, car) {
  const player = world.player;
  if (!car || car.dead || player.inCar) return false;
  if (car.kind === 'traffic') {
    const driver = spawnPed(world, car.x + 20, car.y + 10);
    driver.state = 'flee';
    driver.fleeT = 3.5;
    driver.fleeX = car.x;
    driver.fleeY = car.y;
    world.stats.stolen++;
    addHeat(world, 1);
    addToast(world, 'Car jacked — the driver is screaming for the cops.', 3.5);
  }
  if (car.kind === 'mission' && world.mission && world.mission.index === 1 && world.mission.stage === 0) {
    world.mission.stage = 1;
    world.mission.timer = 100;
    addToast(world, "That's the one. Mara's garage, west side — move!", 5);
    world.events.push('pickup');
  }
  car.kind = 'player';
  car.driver = 'player';
  player.inCar = car;
  player.x = car.x;
  player.y = car.y;
  player.busted = 0;
  world.events.push('enter');
  return true;
}

export function exitCar(world) {
  const player = world.player;
  const car = player.inCar;
  if (!car) return false;
  const tries = [
    [car.x + 36, car.y], [car.x - 36, car.y], [car.x, car.y + 36], [car.x, car.y - 36],
    [car.x + 26, car.y + 26], [car.x - 26, car.y - 26],
  ];
  for (const [tx, ty] of tries) {
    if (!circleBlocked(world.city, tx, ty, PLAYER.radius)) {
      player.x = tx;
      player.y = ty;
      break;
    }
  }
  car.driver = null;
  car.kind = 'parked';
  player.inCar = null;
  world.events.push('enter');
  return true;
}

export function nearestEnterableCar(world, maxDist = 88) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    if (car.dead) continue;
    const d = dist(car.x, car.y, world.player.x, world.player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function startMission(world, index) {
  world.missionIndex = index;
  const m = { index, stage: 0, timer: null, goldCarId: null, bags: null };
  world.mission = m;
  if (index === 1) {
    world.cars = world.cars.filter((c) => c.kind !== 'mission');
    const car = spawnCar(world, {
      x: PLACES.goldCar.x, y: PLACES.goldCar.y, angle: 0,
      model: 'sport', kind: 'mission', color: '#f7b731',
    });
    m.goldCarId = car.id;
  }
  if (index === 2) world.crates = depotCrates();
  if (index === 3) {
    world.driver = { x: PLACES.airstrip.x, y: PLACES.airstrip.y, active: false, aboard: false };
  }
  if (index === 4) {
    m.bags = PLACES.bags.map((b) => ({ ...b, taken: false }));
    m.timer = 150;
  }
  addToast(world, MARA_INTRO[index], 7);
}

function completeMission(world) {
  const m = world.mission;
  const reward = MISSIONS[m.index].reward;
  world.player.cash += reward;
  world.stats.earned += reward;
  addToast(world, `Mara Voss: Clean work. $${reward} is yours.`, 5);
  world.events.push('mission');
  if (m.index + 1 < MISSIONS.length) startMission(world, m.index + 1);
  else world.mission = null;
}

function failMission(world) {
  const index = world.mission.index;
  addToast(world, "Mara Voss: That one's blown. Resetting — try it again.", 5);
  world.events.push('fail');
  if (index === 1) world.cars = world.cars.filter((c) => c.kind !== 'mission' || c.driver === 'player');
  startMission(world, index);
}

export function missionTarget(world) {
  const m = world.mission;
  if (!m) return null;
  switch (m.index) {
    case 0: return m.stage === 0 ? PLACES.docks : PLACES.warehouse;
    case 1: {
      if (m.stage === 0) {
        const car = world.cars.find((c) => c.id === m.goldCarId);
        return car ? { x: car.x, y: car.y, label: PLACES.goldCar.label } : null;
      }
      return PLACES.garage;
    }
    case 2: return m.stage === 0 ? PLACES.depot : PLACES.safehouse;
    case 3: return m.stage === 0 ? PLACES.airstrip : PLACES.marina;
    case 4: {
      if (m.stage === 0) {
        let best = null;
        let bestD = Infinity;
        for (const b of m.bags) {
          if (b.taken) continue;
          const d = dist(b.x, b.y, world.player.x, world.player.y);
          if (d < bestD) { bestD = d; best = b; }
        }
        return best ? { x: best.x, y: best.y, label: 'a cash bag' } : null;
      }
      return PLACES.marina;
    }
    default: return null;
  }
}

export function objectiveText(world) {
  const m = world.mission;
  if (!m) return world.storyComplete ? 'Story complete — Palm City is yours.' : '';
  const left = (arr) => arr.filter((x) => x).length;
  switch (m.index) {
    case 0: return m.stage === 0 ? 'Reach the docks and take the package' : 'Deliver the package to the warehouse';
    case 1: return m.stage === 0 ? 'Steal the gold Sunfire GT' : "Deliver it to Mara's garage";
    case 2: {
      if (m.stage === 0) {
        const n = left(world.crates.map((c) => c.alive));
        return `Shoot the depot crates (${n} left)`;
      }
      return 'Reach the safehouse';
    }
    case 3: return m.stage === 0 ? "Pick up Mara's driver at the airstrip" : 'Get the driver to the marina';
    case 4: {
      if (m.stage === 0) {
        const n = left(m.bags.map((b) => !b.taken));
        return `Grab the cash bags (${n} left)`;
      }
      return 'Reach the boat at the marina';
    }
    default: return '';
  }
}

// ---------------------------------------------------------------- stepping

/** Move a foot entity with wall sliding: full move, else one axis only. */
function moveCircle(world, ent, dx, dy, r) {
  if (!circleBlocked(world.city, ent.x + dx, ent.y + dy, r)) {
    ent.x += dx;
    ent.y += dy;
    return true;
  }
  if (!circleBlocked(world.city, ent.x + dx, ent.y, r)) { ent.x += dx; return true; }
  if (!circleBlocked(world.city, ent.x, ent.y + dy, r)) { ent.y += dy; return true; }
  return false;
}

export function damagePlayer(world, dmg) {
  const p = world.player;
  if (world.over) return;
  const absorbed = Math.min(p.armour, dmg * 0.6);
  p.armour -= absorbed;
  p.hp -= dmg - absorbed;
  burst(world, p.x, p.y, '#ff8a80', 4, 60);
  if (p.hp <= 0) {
    p.hp = 0;
    world.over = 'wasted';
    world.events.push('wasted');
  }
}

function dropCash(world, x, y) {
  world.pickups.push({
    x: x + randRange(world.rng, -8, 8), y: y + randRange(world.rng, -8, 8),
    type: 'cash', amount: Math.floor(randRange(world.rng, 8, 38)),
    active: true, respawnT: 0, temp: true, expireT: world.time + 25,
  });
}

function stepPlayerFoot(world, input, dt) {
  const p = world.player;
  p.fireCd -= dt;
  let mx = input.moveX;
  let my = input.moveY;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const sp = input.sprint ? PLAYER.sprint : PLAYER.speed;
  p.speedNow = len > 0.05 ? sp * Math.min(1, len) : 0;
  if (len > 0.05) {
    moveCircle(world, p, mx * sp * dt, my * sp * dt, PLAYER.radius);
    p.walk += dt * sp * 0.055;
  }
  p.angle = input.aim;
  if (input.fire && p.fireCd <= 0) {
    if (p.ammo > 0) {
      p.ammo--;
      p.fireCd = 0.22;
      world.stats.shots++;
      const a = input.aim;
      world.bullets.push({
        x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18,
        vx: Math.cos(a) * 950, vy: Math.sin(a) * 950, life: 0.55, from: 'player',
      });
      addParticle(world, p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, { color: '#ffe27a', spread: 26, life: 0.08, size: 4 });
      world.events.push('shot');
      reportCrime(world, 0.34, p.x, p.y, 330);
      for (const ped of world.peds) {
        if (ped.state === 'walk' && dist(ped.x, ped.y, p.x, p.y) < 210) {
          ped.state = 'flee';
          ped.fleeT = randRange(world.rng, 2, 3.4);
          ped.fleeX = p.x;
          ped.fleeY = p.y;
        }
      }
    } else {
      p.fireCd = 0.3;
    }
  }
}

function stepPlayerCar(world, input, dt) {
  const p = world.player;
  const car = p.inCar;
  const spec = CAR_TYPES[car.model];
  let maxSpeed = spec.maxSpeed;
  let accel = spec.accel;
  if (car.hp <= 0) { maxSpeed = 55; accel *= 0.4; }
  if (input.throttle > 0) car.speed += accel * dt;
  else if (input.throttle < 0) {
    if (car.speed > 12) car.speed -= accel * 1.5 * dt;
    else car.speed = Math.max(car.speed - accel * 0.6 * dt, -128);
  }
  car.speed -= car.speed * 0.55 * dt;
  car.speed = clamp(car.speed, -128, maxSpeed);
  const sf = clamp(Math.abs(car.speed) / spec.maxSpeed, 0, 1);
  car.angle += input.steer * spec.turn * 0.72 * dt * sf * (car.speed < 0 ? -1 : 1);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fx = nx + Math.cos(car.angle) * 24;
  const fy = ny + Math.sin(car.angle) * 24;
  const bx = nx - Math.cos(car.angle) * 24;
  const by = ny - Math.sin(car.angle) * 24;
  if (circleBlocked(world.city, fx, fy, 13) || circleBlocked(world.city, bx, by, 13)) {
    const impact = Math.abs(car.speed);
    if (impact > 150) {
      car.hp -= (impact - 150) / 13;
      world.shake = Math.min(14, (impact - 150) / 16);
      world.stats.crashes++;
      world.events.push('crash');
      burst(world, fx, fy, '#cfd8dc', 10, 120);
      if (impact > 275) damagePlayer(world, (impact - 275) / 26);
    }
    car.speed = -car.speed * 0.22;
  } else {
    car.x = nx;
    car.y = ny;
  }
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speedNow = Math.abs(car.speed);
  if (car.hp < 30 && car.hp > 0 && world.rng() < dt * 6) {
    addParticle(world, car.x, car.y - 6, { color: '#9e9e9e', spread: 12, life: 0.7, size: 5 });
  }

  // Pay 'n Spray: stop in the bay, pay, lose the heat, fix the car.
  const inBay = car.x > SPRAY_BAY.x && car.x < SPRAY_BAY.x + SPRAY_BAY.w &&
    car.y > SPRAY_BAY.y && car.y < SPRAY_BAY.y + SPRAY_BAY.h;
  if (inBay && Math.abs(car.speed) < 12) {
    world.sprayT += dt;
    if (world.sprayT > 0.9) {
      if (world.wanted.heat > 0 || car.hp < spec.hp) {
        if (p.cash >= SPRAY_COST) {
          p.cash -= SPRAY_COST;
          world.wanted.heat = 0;
          car.hp = spec.hp;
          addToast(world, "Pay 'n Spray: heat's off and she runs like new. -$100", 4);
          world.events.push('cash');
        } else if (!world.sprayWarned) {
          addToast(world, "Pay 'n Spray needs $100.", 3.5);
          world.sprayWarned = true;
        }
      }
      world.sprayT = 0.2;
    }
  } else {
    world.sprayT = 0;
    world.sprayWarned = false;
  }
}

function carMove(world, car, dt) {
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fx = nx + Math.cos(car.angle) * 24;
  const fy = ny + Math.sin(car.angle) * 24;
  if (circleBlocked(world.city, fx, fy, 13)) {
    car.speed *= 0.3;
    return false;
  }
  car.x = nx;
  car.y = ny;
  return true;
}

function stepTrafficCar(world, car, dt) {
  const spec = CAR_TYPES[car.model];
  const ai = car.ai;
  if (dist(car.x, car.y, ai.tx, ai.ty) < 48) {
    const rng = world.rng;
    const roll = rng();
    if (roll < 0.34) {
      if (ai.road === 'h') {
        ai.line = ROADS_X.reduce((b, cx) => (Math.abs(cx - car.x) < Math.abs(b - car.x) ? cx : b), ROADS_X[0]);
        ai.road = 'v';
        ai.dir = roll < 0.17 ? 3 : 1;
      } else {
        ai.line = ROADS_Y.reduce((b, cy) => (Math.abs(cy - car.y) < Math.abs(b - car.y) ? cy : b), ROADS_Y[0]);
        ai.road = 'h';
        ai.dir = roll < 0.17 ? 2 : 0;
      }
    }
    trafficLeg(world, car);
  }
  let desired = spec.maxSpeed * 0.52;
  if (car.fleeT > 0) {
    car.fleeT -= dt;
    desired = spec.maxSpeed * 0.92;
  }
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const o of world.cars) {
    if (o === car || o.dead) continue;
    const ox = o.x - car.x;
    const oy = o.y - car.y;
    const ahead = ox * fx + oy * fy;
    const side = Math.abs(ox * fy - oy * fx);
    if (ahead > 0 && ahead < 76 && side < 30) desired = Math.min(desired, Math.max(0, (ahead - 42) * 2));
  }
  if (car.fleeT <= 0) {
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      const ox = ped.x - car.x;
      const oy = ped.y - car.y;
      const ahead = ox * fx + oy * fy;
      const side = Math.abs(ox * fy - oy * fx);
      if (ahead > 4 && ahead < 54 && side < 24) { desired = 0; break; }
    }
    if (desired > 0 && !world.player.inCar) {
      const ox = world.player.x - car.x;
      const oy = world.player.y - car.y;
      const ahead = ox * fx + oy * fy;
      const side = Math.abs(ox * fy - oy * fx);
      if (ahead > 4 && ahead < 54 && side < 24) desired = 0;
    }
  }
  if (car.speed < desired) car.speed = Math.min(desired, car.speed + spec.accel * 0.8 * dt);
  else car.speed = Math.max(desired, car.speed - spec.accel * 1.7 * dt);
  const targetAngle = Math.atan2(ai.ty - car.y, ai.tx - car.x);
  car.angle = turnToward(car.angle, targetAngle, spec.turn * dt * clamp(Math.abs(car.speed) / 120, 0.25, 1));
  if (!carMove(world, car, dt)) {
    // Wedged against a building: flip direction and pick a fresh leg.
    ai.dir = ai.dir === 0 ? 2 : ai.dir === 2 ? 0 : ai.dir === 1 ? 3 : 1;
    trafficLeg(world, car);
  }
}

function stepPoliceCar(world, car, dt) {
  const spec = CAR_TYPES[car.model];
  const p = world.player;
  if (car.dead) {
    car.deadT -= dt;
    if (car.deadT <= 0) car.gone = true;
    return;
  }
  let tx = p.x;
  let ty = p.y;
  if (p.inCar) {
    tx += Math.cos(p.inCar.angle) * p.inCar.speed * 0.32;
    ty += Math.sin(p.inCar.angle) * p.inCar.speed * 0.32;
  }
  const d = dist(car.x, car.y, tx, ty);
  let desired = spec.maxSpeed;
  if (!p.inCar && d < 50) desired = 0;
  else if (d < 85) desired = p.inCar ? Math.abs(p.inCar.speed) : spec.maxSpeed * 0.4;
  if (car.speed < desired) car.speed = Math.min(desired, car.speed + spec.accel * dt);
  else car.speed = Math.max(desired, car.speed - spec.accel * 1.8 * dt);
  const targetAngle = Math.atan2(ty - car.y, tx - car.x);
  car.angle = turnToward(car.angle, targetAngle, spec.turn * dt * clamp(Math.abs(car.speed) / 120, 0.3, 1));
  carMove(world, car, dt);
  if (starsOf(world) === 0 && d > 780) car.gone = true;
}

function stepCars(world, dt) {
  for (const car of world.cars) {
    if (car.driver === 'player') continue;
    if (car.kind === 'traffic') stepTrafficCar(world, car, dt);
    else if (car.kind === 'police') stepPoliceCar(world, car, dt);
    else car.speed = 0;
  }
  // Car on car.
  const cars = world.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 44 * 44 || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const push = (44 - d) / 2;
      if (!circleBlocked(world.city, a.x - nx * push, a.y - ny * push, 14)) { a.x -= nx * push; a.y -= ny * push; }
      if (!circleBlocked(world.city, b.x + nx * push, b.y + ny * push, 14)) { b.x += nx * push; b.y += ny * push; }
      const avx = Math.cos(a.angle) * a.speed;
      const avy = Math.sin(a.angle) * a.speed;
      const bvx = Math.cos(b.angle) * b.speed;
      const bvy = Math.sin(b.angle) * b.speed;
      const rel = (avx - bvx) * nx + (avy - bvy) * ny;
      if (rel > 110) {
        const dmg = (rel - 110) / 16;
        a.hp -= dmg;
        b.hp -= dmg;
        const playerInvolved = a.driver === 'player' || b.driver === 'player';
        if (playerInvolved) {
          world.stats.crashes++;
          world.shake = Math.min(12, rel / 26);
          world.events.push('crash');
          reportCrime(world, 0.25, (a.x + b.x) / 2, (a.y + b.y) / 2);
          const other = a.driver === 'player' ? b : a;
          if (other.kind === 'traffic') other.fleeT = 3;
        }
        a.speed *= 0.55;
        b.speed *= 0.55;
        burst(world, (a.x + b.x) / 2, (a.y + b.y) / 2, '#cfd8dc', 7, 100);
      }
    }
  }
  // Cars vs pedestrians, and cars vs the player on foot.
  for (const car of cars) {
    if (car.dead || Math.abs(car.speed) < 42) continue;
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 25) {
        ped.state = 'down';
        ped.downT = 6;
        dropCash(world, ped.x, ped.y);
        burst(world, ped.x, ped.y, '#ff8a80', 5, 70);
        if (car.driver === 'player') {
          reportCrime(world, 0.7, ped.x, ped.y);
          world.shake = Math.min(8, world.shake + 3);
          world.events.push('crash');
        }
        car.speed *= 0.84;
      }
    }
    const p = world.player;
    if (!p.inCar && !world.over && Math.abs(car.speed) > 55 && dist(car.x, car.y, p.x, p.y) < 27) {
      damagePlayer(world, 7);
      const a = Math.atan2(p.y - car.y, p.x - car.x);
      moveCircle(world, p, Math.cos(a) * 18, Math.sin(a) * 18, PLAYER.radius);
      car.speed *= 0.45;
      world.shake = Math.min(10, world.shake + 5);
      world.events.push('crash');
    }
  }
  world.cars = world.cars.filter((c) => !c.gone);
}

function stepPeds(world, dt) {
  const kept = [];
  for (const ped of world.peds) {
    if (ped.state === 'down') {
      ped.downT -= dt;
      if (ped.downT <= 0) {
        spawnPed(world);
        continue;
      }
      kept.push(ped);
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const a = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
      moveCircle(world, ped, Math.cos(a) * 218 * dt, Math.sin(a) * 218 * dt, 11);
      ped.angle = a;
      if (ped.fleeT <= 0) {
        ped.state = 'walk';
        ped.route = pedRouteFor(world, ped.x, ped.y);
      }
      kept.push(ped);
      continue;
    }
    const r = ped.route;
    r.pos += r.dir * ped.speed * dt;
    if (r.pos > r.to) { r.pos = r.to; r.dir = -1; }
    if (r.pos < r.from) { r.pos = r.from; r.dir = 1; }
    if (r.vertical) {
      ped.x = r.fixed;
      ped.y = r.pos;
      ped.angle = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      ped.x = r.pos;
      ped.y = r.fixed;
      ped.angle = r.dir > 0 ? 0 : Math.PI;
    }
    kept.push(ped);
  }
  world.peds = kept;
}

function spawnPoliceCar(world) {
  const p = world.player;
  const options = [];
  for (const cx of ROADS_X) {
    for (const cy of ROADS_Y) {
      const d = dist(cx, cy, p.x, p.y);
      if (d > 640 && d < 1040) options.push({ x: cx, y: cy });
    }
  }
  if (!options.length) return;
  const at = options[Math.floor(world.rng() * options.length)];
  const car = spawnCar(world, { x: at.x, y: at.y, angle: 0, model: 'police', kind: 'police', color: '#f5f6fa' });
  car.angle = Math.atan2(p.y - at.y, p.x - at.x);
}

function spawnCop(world) {
  const p = world.player;
  for (let tries = 0; tries < 6; tries++) {
    const a = randRange(world.rng, 0, Math.PI * 2);
    const x = p.x + Math.cos(a) * randRange(world.rng, 500, 620);
    const y = p.y + Math.sin(a) * randRange(world.rng, 500, 620);
    if (x < 20 || y < 20 || x > 3600 || y > WORLD_H - 20) continue;
    if (circleBlocked(world.city, x, y, 12)) continue;
    world.cops.push({ id: nextId++, x, y, hp: 70, fireCd: randRange(world.rng, 0.4, 1.1), state: 'walk', downT: 0 });
    return;
  }
}

function stepCops(world, dt) {
  const p = world.player;
  const stars = starsOf(world);
  const kept = [];
  for (const cop of world.cops) {
    if (cop.state === 'down') {
      cop.downT -= dt;
      if (cop.downT > 0) kept.push(cop);
      continue;
    }
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (stars < 3 && d > 720) continue;
    if (d > 30) {
      const a = Math.atan2(p.y - cop.y, p.x - cop.x);
      moveCircle(world, cop, Math.cos(a) * 152 * dt, Math.sin(a) * 152 * dt, 12);
    }
    cop.fireCd -= dt;
    if (d < 330 && cop.fireCd <= 0 && !world.over) {
      cop.fireCd = randRange(world.rng, 0.95, 1.45);
      const a = Math.atan2(p.y - cop.y, p.x - cop.x) + randRange(world.rng, -0.07, 0.07);
      world.bullets.push({
        x: cop.x + Math.cos(a) * 16, y: cop.y + Math.sin(a) * 16,
        vx: Math.cos(a) * 880, vy: Math.sin(a) * 880, life: 0.5, from: 'cop',
      });
      world.events.push('shot');
    }
    kept.push(cop);
  }
  world.cops = kept;
}

function stepBullets(world, dt) {
  const kept = [];
  for (const b of world.bullets) {
    b.life -= dt;
    if (b.life <= 0) continue;
    let alive = true;
    for (let s = 0; s < 2 && alive; s++) {
      b.x += b.vx * dt * 0.5;
      b.y += b.vy * dt * 0.5;
      if (circleBlocked(world.city, b.x, b.y, 2)) {
        burst(world, b.x, b.y, '#ffe082', 3, 60);
        alive = false;
        break;
      }
      if (b.from === 'player') {
        for (const crate of world.crates) {
          if (crate.alive && dist(b.x, b.y, crate.x, crate.y) < 17) {
            crate.hp--;
            burst(world, b.x, b.y, '#c98d4b', 5, 80);
            world.events.push('hit');
            if (crate.hp <= 0) {
              crate.alive = false;
              burst(world, crate.x, crate.y, '#a1887f', 14, 130);
              const m = world.mission;
              if (m && m.index === 2 && m.stage === 0 && world.crates.every((c) => !c.alive)) {
                m.stage = 1;
                addToast(world, 'Crates are history. Safehouse — go!', 5);
                world.events.push('pickup');
              }
            }
            alive = false;
            break;
          }
        }
        if (!alive) break;
        for (const car of world.cars) {
          if (car.dead || car.driver === 'player') continue;
          if (dist(b.x, b.y, car.x, car.y) < 27) {
            car.hp -= 9;
            burst(world, b.x, b.y, '#b0bec5', 4, 80);
            world.events.push('hit');
            if (car.kind === 'police') {
              reportCrime(world, 0.5, car.x, car.y);
              if (car.hp <= 0 && !car.dead) {
                car.dead = true;
                car.deadT = 10;
                car.speed = 0;
                burst(world, car.x, car.y, '#ff7043', 16, 150);
              }
            } else if (car.kind === 'traffic') {
              car.fleeT = 3;
            }
            alive = false;
            break;
          }
        }
        if (!alive) break;
        for (const cop of world.cops) {
          if (cop.state === 'down') continue;
          if (dist(b.x, b.y, cop.x, cop.y) < 12) {
            cop.hp -= 34;
            world.events.push('hit');
            if (cop.hp <= 0) {
              cop.state = 'down';
              cop.downT = 7;
              burst(world, cop.x, cop.y, '#90a4ae', 8, 80);
            }
            alive = false;
            break;
          }
        }
        if (!alive) break;
        for (const ped of world.peds) {
          if (ped.state === 'down') continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 11) {
            ped.state = 'down';
            ped.downT = 6;
            dropCash(world, ped.x, ped.y);
            burst(world, ped.x, ped.y, '#ff8a80', 5, 70);
            reportCrime(world, 0.7, ped.x, ped.y);
            world.events.push('hit');
            alive = false;
            break;
          }
        }
      } else {
        const p = world.player;
        if (p.inCar) {
          if (dist(b.x, b.y, p.x, p.y) < 27) {
            p.inCar.hp -= 4;
            burst(world, b.x, b.y, '#b0bec5', 3, 70);
            alive = false;
          }
        } else if (dist(b.x, b.y, p.x, p.y) < 13) {
          damagePlayer(world, 5);
          alive = false;
        }
      }
    }
    if (alive) kept.push(b);
  }
  world.bullets = kept;
}

function stepPickups(world, dt) {
  const p = world.player;
  const radius = p.inCar ? 38 : 30;
  const kept = [];
  for (const pk of world.pickups) {
    if (pk.temp && world.time > pk.expireT) continue;
    if (!pk.active) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) pk.active = true;
      kept.push(pk);
      continue;
    }
    if (dist(pk.x, pk.y, p.x, p.y) < radius) {
      if (pk.type === 'cash') { p.cash += pk.amount; world.events.push('cash'); }
      else if (pk.type === 'health') { p.hp = Math.min(PLAYER.hp, p.hp + pk.amount); world.events.push('pickup'); }
      else if (pk.type === 'ammo') { p.ammo += pk.amount; world.events.push('pickup'); }
      else if (pk.type === 'armour') { p.armour = Math.min(100, p.armour + pk.amount); world.events.push('pickup'); }
      else if (pk.type === 'star') {
        world.wanted.heat = Math.max(0, world.wanted.heat - 1);
        addToast(world, 'Bribe taken — heat dropped a star.', 3);
        world.events.push('pickup');
      }
      burst(world, pk.x, pk.y, '#a5d6a7', 6, 60);
      if (pk.temp) continue;
      pk.active = false;
      pk.respawnT = pk.type === 'star' ? 75 : 45;
    }
    kept.push(pk);
  }
  world.pickups = kept;
}

function stepDriver(world, dt) {
  const m = world.mission;
  const d = world.driver;
  if (!m || m.index !== 3 || !d || m.stage === 0) return;
  const p = world.player;
  if (p.inCar) {
    d.x = p.inCar.x;
    d.y = p.inCar.y;
    d.aboard = true;
  } else {
    const a = Math.atan2(p.y - d.y, p.x - d.x);
    moveCircle(world, d, Math.cos(a) * 245 * dt, Math.sin(a) * 245 * dt, 12);
    d.aboard = dist(d.x, d.y, p.x, p.y) < 34;
  }
}

function updateMission(world, dt) {
  const m = world.mission;
  if (!m) return;
  if (m.timer !== null && m.timer !== undefined) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(world);
      return;
    }
  }
  const t = missionTarget(world);
  if (!t) return;
  const p = world.player;
  const d = dist(p.x, p.y, t.x, t.y);
  if (m.index === 0) {
    if (d < 70) {
      if (m.stage === 0) {
        m.stage = 1;
        addToast(world, "Package's in. Warehouse, west side — take it there.", 5);
        world.events.push('pickup');
      } else completeMission(world);
    }
  } else if (m.index === 1) {
    if (m.stage === 1 && p.inCar && p.inCar.id === m.goldCarId && d < 80) completeMission(world);
  } else if (m.index === 2) {
    if (m.stage === 1 && d < 70) completeMission(world);
  } else if (m.index === 3) {
    if (m.stage === 0 && d < 65) {
      m.stage = 1;
      world.driver.active = true;
      addHeat(world, 0);
      world.wanted.heat = Math.max(world.wanted.heat, 2);
      addToast(world, "Driver's in. Marina, east shore — the law will notice.", 5);
      world.events.push('pickup');
    } else if (m.stage === 1 && d < 80 && world.driver && dist(world.driver.x, world.driver.y, t.x, t.y) < 180) {
      completeMission(world);
    }
  } else if (m.index === 4) {
    if (m.stage === 0) {
      if (d < 55) {
        const bag = m.bags.find((b) => !b.taken && b.x === t.x && b.y === t.y);
        if (bag) {
          bag.taken = true;
          p.cash += 150;
          world.events.push('cash');
          const left = m.bags.filter((b) => !b.taken).length;
          if (left === 0) {
            m.stage = 1;
            addToast(world, 'All bags in. Get to the boat — now!', 5);
          } else {
            addToast(world, `Bag secured, +$150. ${left} to go.`, 3.5);
          }
        }
      }
    } else if (d < 80) {
      world.storyComplete = true;
      completeMission(world);
      world.over = 'complete';
      world.events.push('complete');
    }
  }
}

function updateWanted(world, dt) {
  const p = world.player;
  const stars = starsOf(world);
  let seen = false;
  for (const c of world.cars) {
    if (c.kind === 'police' && !c.dead && dist(c.x, c.y, p.x, p.y) < 520) { seen = true; break; }
  }
  if (!seen) {
    for (const c of world.cops) {
      if (c.state !== 'down' && dist(c.x, c.y, p.x, p.y) < 460) { seen = true; break; }
    }
  }
  if (seen) world.wanted.lastSeen = world.time;
  const m = world.mission;
  const heldHeat = m && m.index === 3 && m.stage === 1;
  if (heldHeat) {
    world.wanted.heat = Math.max(world.wanted.heat, 2);
  } else if (world.time - world.wanted.lastSeen > 5 && world.wanted.heat > 0) {
    world.wanted.heat = Math.max(0, world.wanted.heat - dt * 0.045);
  }
  const wantCars = stars === 0 ? 0 : Math.min(2 + stars, 6);
  const haveCars = world.cars.filter((c) => c.kind === 'police' && !c.dead).length;
  world.policeSpawnT -= dt;
  if (haveCars < wantCars && world.policeSpawnT <= 0) {
    world.policeSpawnT = 1.4;
    spawnPoliceCar(world);
  }
  const wantCops = stars >= 3 ? Math.min(stars - 1, 4) : 0;
  const haveCops = world.cops.filter((c) => c.state !== 'down').length;
  world.copSpawnT -= dt;
  if (haveCops < wantCops && world.copSpawnT <= 0) {
    world.copSpawnT = 1.6;
    spawnCop(world);
  }
  if (!p.inCar && !world.over) {
    let threat = false;
    for (const c of world.cops) {
      if (c.state !== 'down' && dist(c.x, c.y, p.x, p.y) < 42) { threat = true; break; }
    }
    if (!threat && p.speedNow < 70) {
      for (const c of world.cars) {
        if (c.kind === 'police' && !c.dead && dist(c.x, c.y, p.x, p.y) < 56) { threat = true; break; }
      }
    }
    if (threat) p.busted += dt / 1.7;
    else p.busted = Math.max(0, p.busted - dt * 0.7);
    if (p.busted >= 1) {
      world.over = 'busted';
      world.events.push('busted');
    }
  } else {
    p.busted = Math.max(0, p.busted - dt * 0.7);
  }
}

export function stepWorld(world, input, dt) {
  dt = Math.min(dt, 1 / 20);
  world.time += dt;
  const p = world.player;
  if (input.interact && !world.over) {
    if (p.inCar) exitCar(world);
    else {
      const car = nearestEnterableCar(world);
      if (car) enterCar(world, car);
    }
  }
  if (!world.over) {
    if (p.inCar) stepPlayerCar(world, input, dt);
    else stepPlayerFoot(world, input, dt);
    stepCars(world, dt);
    stepPeds(world, dt);
    stepCops(world, dt);
    stepBullets(world, dt);
    stepPickups(world, dt);
    stepDriver(world, dt);
    updateMission(world, dt);
    updateWanted(world, dt);
  }
  for (const pt of world.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  world.particles = world.particles.filter((pt) => pt.life > 0);
  world.shake = Math.max(0, world.shake - dt * 26);
  world.toasts = world.toasts.filter((t) => t.until > world.time);
}
