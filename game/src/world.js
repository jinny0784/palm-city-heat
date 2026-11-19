// world.js — the whole simulation of Palm City Heat: the player on foot and
// behind the wheel, traffic that drives the grid, pedestrians, police,
// wanted heat, pickups, the Pay 'n Spray, and fixer Mara Voss's five-mission
// story. It knows nothing about the DOM or canvas: main.js feeds it input
// and a timestep, render.js draws whatever state it holds. All randomness
// flows from one seeded generator so a world is reproducible.

import { generateCity, nearestNode } from './city.js';
import {
  createRng, clamp, dist, angleTo, angleDiff, angleLerp,
  circleHitsBox, pushCircleOutOfBox,
} from './random.js';
import {
  WORLD_W, WORLD_H, WATER_X, HEAT_PER_STAR, MAX_STARS, CAR_TYPES,
  TRAFFIC_PAINTS, WALK_SPEED, SPRINT_SPEED, PLAYER_RADIUS,
} from './config.js';

let nextId = 1;
function id() {
  return nextId++;
}

export const MISSIONS = [
  { name: 'First Run', reward: 300 },
  { name: 'Hot Wheels', reward: 600 },
  { name: 'Loud Message', reward: 500 },
  { name: 'The Pickup', reward: 800 },
  { name: 'Last Job', reward: 2000 },
];

const MARA_INTROS = [
  'Mara: Package waiting at the Palm Docks. Grab it, bring it to the West Warehouse. Quiet roads, easy money.',
  'Mara: A gold sports car is parked up north-east. Borrow it for me and drop it at Rico\'s Garage. Clock is ticking.',
  'Mara: Sunport Depot holds three crates that embarrass a friend of mine. Break them, then cool off at the safehouse.',
  'Mara: My driver is stranded at the old airstrip. Collect him and get him to the Marina Pier. Expect company.',
  'Mara: Last job, biggest payday. Three cash bags around town, then the boat at the marina. Do it clean.',
];

export function starsForHeat(heat) {
  if (heat <= 0) return 0;
  return Math.min(MAX_STARS, Math.ceil(heat / HEAT_PER_STAR));
}

export function createWorld(seed, saved) {
  nextId = 1;
  const rng = createRng(seed * 31 + 7);
  const city = generateCity(seed);
  const state = {
    seed,
    rng,
    city,
    mode: 'title',
    time: 0,
    player: {
      x: 1150, y: 780, angle: 0, hp: 100, armour: 0,
      cash: saved && saved.cash ? saved.cash : 120,
      carId: null, speedMag: 0, mag: 12, reserve: 96,
      reloadT: 0, fireT: 0, walkPhase: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    pickups: [],
    crates: [],
    bags: [],
    effects: [],
    toasts: [],
    sfx: [],
    heat: 0,
    unseenT: 0,
    bustedMeter: 0,
    sprayT: 0,
    shake: 0,
    mission: { idx: saved && saved.missionIndex ? saved.missionIndex : 0, stage: 0, active: false, delay: 0, timer: null, passenger: false, goldCarId: null },
    storyComplete: !!(saved && saved.storyComplete),
    stats: { earned: 0, shots: 0, steals: 0, startedAt: 0 },
    saveDirty: false,
    endReason: '',
  };

  // Parked cars from the city's kerb spots.
  const parkedKinds = ['sedan', 'taxi', 'sedan', 'sports', 'sedan', 'truck', 'sedan', 'taxi', 'sedan', 'sports', 'sedan', 'truck'];
  city.parkedSpots.forEach((s, i) => {
    state.cars.push(makeCar(state, parkedKinds[i % parkedKinds.length], s.x, s.y, s.angle, 'parked', rng.pick(TRAFFIC_PAINTS)));
  });

  // Traffic already rolling on the grid.
  for (let i = 0; i < 14; i++) {
    const node = city.nodes[rng.int(0, city.nodes.length - 1)];
    const kind = rng.pick(['sedan', 'sedan', 'taxi', 'sedan', 'truck']);
    const car = makeCar(state, kind, node.x + rng.range(-8, 8), node.y + rng.range(-8, 8), 0, 'traffic', rng.pick(TRAFFIC_PAINTS));
    car.ai.node = nearestNode(city, car.x, car.y);
    car.ai.prev = car.ai.node;
    pickNextNode(state, car);
    car.angle = angleTo(car.x, car.y, city.nodes[car.ai.target].x, city.nodes[car.ai.target].y);
    state.cars.push(car);
  }

  // Pedestrians out for a stroll on the pavements.
  for (let i = 0; i < 26; i++) {
    state.peds.push(makePed(state, rng.range(200, 3300), rng.range(150, 2900)));
  }

  // Fixed pickups: health at the hospital, armour at the precinct, and
  // bribe stars tucked in alleys.
  state.pickups.push({ id: id(), x: city.places.hospital.x, y: city.places.hospital.y + 40, kind: 'health', amount: 45, respawnT: 0, maxRespawn: 30 });
  state.pickups.push({ id: id(), x: city.places.precinct.x, y: city.places.precinct.y + 40, kind: 'armour', amount: 100, respawnT: 0, maxRespawn: 45 });
  for (const b of city.bribeSpots) {
    state.pickups.push({ id: id(), x: b.x, y: b.y, kind: 'bribe', amount: 1, respawnT: 0, maxRespawn: 50 });
  }
  state.pickups.push({ id: id(), x: city.places.depot.x - 60, y: city.places.depot.y + 70, kind: 'ammo', amount: 48, respawnT: 0, maxRespawn: 40 });

  return state;
}

function makeCar(state, kind, x, y, angle, driver, color) {
  const spec = CAR_TYPES[kind];
  return {
    id: id(), kind, x, y, angle, speed: 0,
    hp: spec.hp, maxHp: spec.hp, color: color || '#888',
    driver, radius: spec.w / 2,
    ai: { node: 0, prev: 0, target: 0, panicT: 0, panicX: 0, panicY: 0, stuckT: 0 },
    gold: false, flashT: 0,
  };
}

function makePed(state, x, y) {
  return {
    id: id(), x, y, angle: state.rng.angle(), hp: 20,
    mode: 'walk', tx: x, ty: y, fleeT: 0, fleeX: 0, fleeY: 0,
    downT: 0, shirt: state.rng.pick(['#d96f4e', '#4ea5a0', '#e8b04b', '#7a9e7e', '#c95d7b', '#5b84ae', '#e3dcc8']),
    walkPhase: state.rng.range(0, 6),
  };
}

export function getCar(state, carId) {
  return state.cars.find((c) => c.id === carId) || null;
}

export function playerCar(state) {
  return state.player.carId ? getCar(state, state.player.carId) : null;
}

export function startPlay(state) {
  state.mode = 'playing';
  state.stats.startedAt = state.time;
  if (state.storyComplete || state.mission.idx >= MISSIONS.length) {
    pushToast(state, 'Mara', 'Mara: Story\'s done, city\'s yours. Keep the wheels warm for me.');
    return;
  }
  startMission(state, state.mission.idx);
}

export function startMission(state, idx) {
  const m = state.mission;
  m.idx = idx;
  m.stage = 0;
  m.active = true;
  m.timer = null;
  m.passenger = false;
  m.goldCarId = null;
  state.crates = [];
  state.bags = [];
  pushToast(state, 'Mara Voss', MARA_INTROS[idx]);
  if (idx === 1) {
    // The gold sports car Mara wants, parked up north-east.
    const car = makeCar(state, 'sports', 2760, 430, Math.PI / 2, 'parked', '#f4b942');
    car.gold = true;
    state.cars.push(car);
    m.goldCarId = car.id;
  }
  if (idx === 2) {
    const d = state.city.places.depot;
    state.crates = [
      { id: id(), x: d.x - 45, y: d.y - 30, hp: 20, gone: false },
      { id: id(), x: d.x + 40, y: d.y + 10, hp: 20, gone: false },
      { id: id(), x: d.x - 5, y: d.y + 55, hp: 20, gone: false },
    ];
  }
  if (idx === 4) {
    state.bags = [
      { id: id(), x: 1210, y: 510, got: false },
      { id: id(), x: 2610, y: 1510, got: false },
      { id: id(), x: 910, y: 2210, got: false },
    ];
    m.timer = 240;
  }
}

// The current objective marker + banner text for HUD and minimap.
export function missionTarget(state) {
  const m = state.mission;
  if (!m.active) return null;
  const P = state.city.places;
  switch (m.idx) {
    case 0:
      return m.stage === 0
        ? { x: P.docks.x, y: P.docks.y, text: 'Pick up the package at the Palm Docks' }
        : { x: P.warehouse.x, y: P.warehouse.y, text: 'Deliver the package to the West Warehouse' };
    case 1: {
      if (m.stage === 0) {
        const g = getCar(state, m.goldCarId);
        return g ? { x: g.x, y: g.y, text: 'Steal the gold sports car' } : null;
      }
      return { x: P.garage.x, y: P.garage.y, text: 'Deliver the gold car to Rico\'s Garage' };
    }
    case 2: {
      const left = state.crates.filter((c) => !c.gone).length;
      return m.stage === 0
        ? { x: P.depot.x, y: P.depot.y, text: 'Destroy the depot crates (' + left + ' left)' }
        : { x: P.safehouse.x, y: P.safehouse.y, text: 'Cool off at the safehouse' };
    }
    case 3:
      return m.stage === 0
        ? { x: P.airstrip.x, y: P.airstrip.y, text: 'Collect Mara\'s driver at the old airstrip' }
        : { x: P.marina.x, y: P.marina.y, text: 'Drive the driver to the Marina Pier' };
    case 4: {
      if (m.stage === 0) {
        const bag = state.bags.find((b) => !b.got);
        const left = state.bags.filter((b) => !b.got).length;
        return bag ? { x: bag.x, y: bag.y, text: 'Collect the cash bags (' + left + ' left)' } : null;
      }
      return { x: P.marina.x, y: P.marina.y, text: 'Reach the boat at the Marina Pier' };
    }
    default:
      return null;
  }
}

function pushToast(state, from, text) {
  state.toasts.push({ from, text, ttl: 6 });
  if (state.toasts.length > 3) state.toasts.shift();
}

export function addHeat(state, amount, x, y) {
  // A crime only really counts when someone sees it: a pedestrian or an
  // officer within earshot. Unwitnessed, it barely registers.
  let witnessed = false;
  for (const p of state.peds) {
    if (p.mode !== 'down' && dist(x, y, p.x, p.y) < 300) { witnessed = true; break; }
  }
  if (!witnessed) {
    for (const c of state.cops) if (dist(x, y, c.x, c.y) < 320) { witnessed = true; break; }
    for (const c of state.cars) if (c.driver === 'police' && dist(x, y, c.x, c.y) < 320) { witnessed = true; break; }
  }
  state.heat = clamp(state.heat + (witnessed ? amount : amount * 0.25), 0, MAX_STARS * HEAT_PER_STAR);
  if (witnessed) state.unseenT = 0;
}

// After a busted/wasted ending: reset the run, keep the story position.
export function resetRun(state) {
  const p = state.player;
  if (state.endReason === 'busted') p.cash = Math.max(0, p.cash - 150);
  p.hp = 100;
  p.armour = 0;
  p.carId = null;
  p.x = state.city.places.safehouse.x;
  p.y = state.city.places.safehouse.y + 60;
  p.mag = 12;
  p.reserve = Math.max(p.reserve, 48);
  state.heat = 0;
  state.bustedMeter = 0;
  state.cops = [];
  for (const c of state.cars) if (c.driver === 'police') c.driver = 'gone';
  state.cars = state.cars.filter((c) => c.driver !== 'gone');
  state.mode = 'playing';
  if (!state.storyComplete && state.mission.idx < MISSIONS.length) {
    startMission(state, state.mission.idx);
  } else {
    state.mission.active = false;
  }
}

export function stepWorld(state, input, dt) {
  state.time += dt;
  state.sfx.length = 0;

  if (state.mode === 'title') {
    stepTraffic(state, dt);
    stepPeds(state, dt, null);
    decayFx(state, dt);
    return;
  }
  if (state.mode !== 'playing') return;

  const p = state.player;

  // Toast + effect lifetimes.
  for (const t of state.toasts) t.ttl -= dt;
  state.toasts = state.toasts.filter((t) => t.ttl > 0);
  decayFx(state, dt);

  // Mission hand-off pause between chapters.
  if (!state.mission.active && !state.storyComplete && state.mission.idx < MISSIONS.length) {
    state.mission.delay -= dt;
    if (state.mission.delay <= 0) startMission(state, state.mission.idx);
  }

  stepPlayer(state, input, dt);
  stepTraffic(state, dt);
  stepPoliceCars(state, dt);
  stepPeds(state, dt, input);
  stepCops(state, dt);
  stepPickups(state, dt);
  stepMissions(state, dt);
  stepWanted(state, dt);

  if (p.hp <= 0 && state.mode === 'playing') {
    p.hp = 0;
    state.mode = 'wasted';
    state.endReason = 'wasted';
    state.sfx.push('wasted');
  }
}

function decayFx(state, dt) {
  for (const e of state.effects) e.ttl -= dt;
  state.effects = state.effects.filter((e) => e.ttl > 0);
  state.shake = Math.max(0, state.shake - dt * 26);
}

// ---------------------------------------------------------------- player

function stepPlayer(state, input, dt) {
  const p = state.player;
  const car = playerCar(state);

  if (input.interact) {
    if (car) exitCar(state);
    else tryEnterCar(state);
  }

  if (car) {
    driveCar(state, car, input, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speedMag = Math.abs(car.speed);
    stepSpray(state, car, dt);
    return;
  }

  // On foot.
  const sprint = input.sprint;
  const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
  let mx = input.x;
  let my = input.y;
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 0.01) {
    mx /= Math.max(1, len);
    my /= Math.max(1, len);
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.walkPhase += dt * (sprint ? 13 : 10);
    p.speedMag = speed;
  } else {
    p.speedMag = 0;
  }
  p.angle = input.aim;
  collideWorld(state, p, PLAYER_RADIUS);
  p.x = clamp(p.x, 20, WATER_X - 6);
  p.y = clamp(p.y, 20, WORLD_H - 20);

  // Pistol work.
  p.fireT -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0 && p.reserve > 0) {
      const take = Math.min(12 - p.mag, p.reserve);
      p.mag += take;
      p.reserve -= take;
    }
  }
  if (input.fire && p.fireT <= 0 && p.reloadT <= 0) {
    if (p.mag > 0) {
      firePistol(state);
      p.fireT = 0.17;
    } else if (p.reserve > 0) {
      p.reloadT = 1.1;
      p.fireT = 0.3;
    }
  }
}

function collideWorld(state, e, r) {
  for (const b of state.city.buildings) {
    if (circleHitsBox(e.x, e.y, r, b)) {
      const [nx, ny] = pushCircleOutOfBox(e.x, e.y, r, b);
      e.x = nx;
      e.y = ny;
    }
  }
}

function firePistol(state) {
  const p = state.player;
  p.mag -= 1;
  state.stats.shots += 1;
  state.sfx.push('shot');
  addHeat(state, 6, p.x, p.y);
  // Nearby pedestrians scatter from the noise.
  for (const ped of state.peds) {
    if (ped.mode === 'walk' && dist(p.x, p.y, ped.x, ped.y) < 250) {
      ped.mode = 'flee';
      ped.fleeT = 2.6;
      ped.fleeX = p.x;
      ped.fleeY = p.y;
    }
  }
  const range = 430;
  const dx = Math.cos(p.angle);
  const dy = Math.sin(p.angle);
  let bestT = range;
  let hitKind = null;
  let hitRef = null;
  function rayCircle(cx, cy, r, kind, ref) {
    const ox = cx - p.x;
    const oy = cy - p.y;
    const t = ox * dx + oy * dy;
    if (t < 0 || t > bestT) return;
    const px = p.x + dx * t;
    const py = p.y + dy * t;
    if (dist(px, py, cx, cy) < r) {
      bestT = t;
      hitKind = kind;
      hitRef = ref;
    }
  }
  for (const ped of state.peds) if (ped.mode !== 'down') rayCircle(ped.x, ped.y, 12, 'ped', ped);
  for (const cop of state.cops) if (cop.mode !== 'down') rayCircle(cop.x, cop.y, 13, 'cop', cop);
  for (const crate of state.crates) if (!crate.gone) rayCircle(crate.x, crate.y, 19, 'crate', crate);
  for (const car of state.cars) rayCircle(car.x, car.y, car.radius + 2, 'car', car);
  // Buildings stop the bullet.
  for (const b of state.city.buildings) {
    // cheap slab test against the box's near corner circle
    rayCircle(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) / 2, 'wall', null);
  }
  const hx = p.x + dx * bestT;
  const hy = p.y + dy * bestT;
  state.effects.push({ kind: 'tracer', x1: p.x + dx * 18, y1: p.y + dy * 18, x2: hx, y2: hy, ttl: 0.07, max: 0.07 });
  if (!hitKind) return;
  if (hitKind === 'ped') {
    hitRef.hp -= 34;
    if (hitRef.hp <= 0 && hitRef.mode !== 'down') downPed(state, hitRef, true);
    addHeat(state, 20, p.x, p.y);
  } else if (hitKind === 'cop') {
    hitRef.hp -= 34;
    addHeat(state, 16, p.x, p.y);
    if (hitRef.hp <= 0 && hitRef.mode !== 'down') {
      hitRef.mode = 'down';
      hitRef.downT = 6;
      state.sfx.push('hit');
      if (state.rng.chance(0.5)) {
        state.pickups.push({ id: id(), x: hitRef.x, y: hitRef.y, kind: 'ammo', amount: 24, respawnT: 0, maxRespawn: 0 });
      }
    }
  } else if (hitKind === 'crate') {
    hitRef.hp -= 20;
    state.sfx.push('hit');
    if (hitRef.hp <= 0 && !hitRef.gone) {
      hitRef.gone = true;
      state.effects.push({ kind: 'burst', x1: hitRef.x, y1: hitRef.y, x2: hitRef.x, y2: hitRef.y, ttl: 0.3, max: 0.3 });
    }
  } else if (hitKind === 'car') {
    damageCar(state, hitRef, 6, p.x, p.y);
  }
}

function downPed(state, ped, dropCash) {
  ped.mode = 'down';
  ped.downT = 7;
  state.sfx.push('hit');
  if (dropCash && state.rng.chance(0.65)) {
    state.pickups.push({ id: id(), x: ped.x + state.rng.range(-8, 8), y: ped.y + state.rng.range(-8, 8), kind: 'cash', amount: state.rng.int(10, 45), respawnT: 0, maxRespawn: 0 });
  }
}

function tryEnterCar(state) {
  const p = state.player;
  let best = null;
  let bestD = 85;
  for (const car of state.cars) {
    if (car.hp <= 0) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (!best) return;
  if (best.driver === 'traffic') {
    // Yank the driver out: they bail and run, and the street notices.
    const driver = makePed(state, best.x + 16, best.y + 10);
    driver.mode = 'flee';
    driver.fleeT = 4;
    driver.fleeX = p.x;
    driver.fleeY = p.y;
    state.peds.push(driver);
    state.stats.steals += 1;
    addHeat(state, 26, best.x, best.y);
    state.sfx.push('steal');
  } else if (best.driver === 'police') {
    state.stats.steals += 1;
    addHeat(state, 30, best.x, best.y);
    state.sfx.push('steal');
  }
  best.driver = 'player';
  best.ai.panicT = 0;
  p.carId = best.id;
  state.sfx.push('door');
  if (state.mission.active && state.mission.idx === 1 && state.mission.stage === 0 && best.id === state.mission.goldCarId) {
    state.mission.stage = 1;
    state.mission.timer = 180;
    pushToast(state, 'Mara Voss', 'Mara: That\'s my car. Garage, before the clock eats your cut.');
  }
}

function exitCar(state) {
  const p = state.player;
  const car = playerCar(state);
  if (!car) return;
  car.driver = 'parked';
  car.speed = 0;
  p.carId = null;
  // Step out on the left side of the car.
  p.x = car.x + Math.sin(car.angle) * -26;
  p.y = car.y + Math.cos(car.angle) * 26;
  collideWorld(state, p, PLAYER_RADIUS);
  state.sfx.push('door');
}

function driveCar(state, car, input, dt) {
  const spec = CAR_TYPES[car.kind];
  const throttle = -input.y; // W = -1 → forward
  const steer = input.x;
  if (car.hp > 0) {
    if (throttle > 0) car.speed += spec.accel * throttle * dt;
    else if (throttle < 0) {
      if (car.speed > 12) car.speed -= spec.accel * 1.5 * dt; // braking
      else car.speed += spec.accel * 0.55 * throttle * dt; // reverse
    }
  }
  // Rolling drag and brakes.
  car.speed -= car.speed * 0.55 * dt;
  if (throttle === 0) car.speed -= car.speed * 0.8 * dt;
  car.speed = clamp(car.speed, -spec.reverse, spec.maxSpeed * (car.hp > 0 ? 1 : 0.25));
  if (car.hp <= 0) car.speed = clamp(car.speed, -20, 40);
  const steerAuthority = clamp(Math.abs(car.speed) / 60, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += steer * 1.9 * steerAuthority * dt * clamp(Math.abs(car.speed) / 120, 0.35, 1);
  moveCar(state, car, dt, true);
}

function moveCar(state, car, dt, isPlayer) {
  const oldX = car.x;
  const oldY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 26, WATER_X - 24);
  car.y = clamp(car.y, 26, WORLD_H - 26);

  // Buildings: hard stop, damage on a fast impact.
  for (const b of state.city.buildings) {
    if (circleHitsBox(car.x, car.y, car.radius, b)) {
      const impact = Math.abs(car.speed);
      const [nx, ny] = pushCircleOutOfBox(car.x, car.y, car.radius, b);
      car.x = nx;
      car.y = ny;
      if (impact > 130) {
        damageCar(state, car, (impact - 110) * 0.12, oldX, oldY);
        if (isPlayer) {
          state.shake = Math.min(14, impact * 0.05);
          hurtPlayer(state, (impact - 120) * 0.05);
        }
        state.sfx.push('crash');
      }
      car.speed *= -0.25;
    }
  }

  // Car on car: shove apart, trade paint and damage.
  for (const other of state.cars) {
    if (other === car) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    const minD = car.radius + other.radius - 6;
    if (d > 0.01 && d < minD) {
      const rel = Math.abs(car.speed - other.speed) + Math.abs(car.speed) * 0.4;
      const push = (minD - d) / 2;
      const ux = (car.x - other.x) / d;
      const uy = (car.y - other.y) / d;
      car.x += ux * push;
      car.y += uy * push;
      other.x -= ux * push;
      other.y -= uy * push;
      if (rel > 90) {
        damageCar(state, car, rel * 0.05, other.x, other.y);
        damageCar(state, other, rel * 0.06, car.x, car.y);
        if (other.driver === 'traffic') {
          other.ai.panicT = 4;
          other.ai.panicX = car.x;
          other.ai.panicY = car.y;
        }
        if (isPlayer) {
          state.shake = Math.min(12, rel * 0.05);
          addHeat(state, 9, car.x, car.y);
        }
        state.sfx.push('crash');
      }
      other.speed += car.speed * 0.25;
      car.speed *= 0.55;
    }
  }

  // Running someone down is loud, messy and very visible.
  if (Math.abs(car.speed) > 60) {
    const everyone = [...state.peds, ...state.cops];
    for (const ped of everyone) {
      if (ped.mode === 'down') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < car.radius + 9) {
        if (ped.hp !== undefined && ped.shirt === undefined) {
          // foot officer — only the player's own driving is a crime;
          // ambient accidents are the NPC drivers' problem, not yours.
          ped.hp -= 40;
          if (ped.hp <= 0) { ped.mode = 'down'; ped.downT = 6; }
          if (isPlayer) addHeat(state, 24, car.x, car.y);
        } else {
          downPed(state, ped, true);
          if (isPlayer) addHeat(state, 22, car.x, car.y);
        }
        if (isPlayer) state.shake = Math.max(state.shake, 5);
        state.sfx.push('thud');
      }
    }
  }
}

function damageCar(state, car, amount, fromX, fromY) {
  car.hp -= amount;
  car.flashT = 0.12;
  if (car.driver === 'traffic') {
    car.ai.panicT = 3.5;
    car.ai.panicX = fromX;
    car.ai.panicY = fromY;
  }
  if (car.hp <= 0 && car.driver === 'player') {
    // A wrecked ride is no ride at all.
    state.sfx.push('crash');
  }
}

function hurtPlayer(state, amount) {
  const p = state.player;
  if (amount <= 0) return;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, amount * 0.6);
    p.armour -= absorbed;
    amount -= absorbed;
  }
  p.hp -= amount;
}

// ---------------------------------------------------------------- traffic

function pickNextNode(state, car) {
  const city = state.city;
  const node = city.nodes[car.ai.node];
  let options = node.next.filter((n) => n !== car.ai.prev);
  if (options.length === 0) options = node.next;
  let choice;
  if (car.ai.panicT > 0) {
    // Run away from the trouble spot.
    choice = options[0];
    let bestD = -1;
    for (const o of options) {
      const d = dist(city.nodes[o].x, city.nodes[o].y, car.ai.panicX, car.ai.panicY);
      if (d > bestD) { bestD = d; choice = o; }
    }
  } else {
    choice = options[state.rng.int(0, options.length - 1)];
  }
  car.ai.prev = car.ai.node;
  car.ai.node = choice;
  car.ai.target = choice;
}

function stepTraffic(state, dt) {
  const city = state.city;
  for (const car of state.cars) {
    if (car.driver !== 'traffic') continue;
    if (car.hp <= 0) { car.speed = 0; continue; }
    car.ai.panicT = Math.max(0, car.ai.panicT - dt);
    const target = city.nodes[car.ai.target];
    // Right-hand lane offset relative to travel direction.
    const dirA = angleTo(car.x, car.y, target.x, target.y);
    const tx = target.x - Math.sin(dirA) * 17;
    const ty = target.y + Math.cos(dirA) * 17;
    const d = dist(car.x, car.y, tx, ty);
    if (d < 46) pickNextNode(state, car);
    const desired = angleTo(car.x, car.y, tx, ty);
    car.angle = angleLerp(car.angle, desired, clamp(dt * 3.2, 0, 1));
    let cruise = car.ai.panicT > 0 ? 320 : 195;
    if (car.kind === 'truck') cruise *= 0.8;
    // Brake for anything solid ahead.
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    let blocked = false;
    for (const other of state.cars) {
      if (other === car) continue;
      const rx = other.x - car.x;
      const ry = other.y - car.y;
      const fwd = rx * fx + ry * fy;
      const side = Math.abs(rx * -fy + ry * fx);
      if (fwd > 0 && fwd < 62 && side < 21) { blocked = true; break; }
    }
    if (!blocked) {
      const folks = [...state.peds, ...state.cops];
      for (const ped of folks) {
        if (ped.mode === 'down') continue;
        const rx = ped.x - car.x;
        const ry = ped.y - car.y;
        const fwd = rx * fx + ry * fy;
        const side = Math.abs(rx * -fy + ry * fx);
        if (fwd > 0 && fwd < 50 && side < 18) { blocked = true; break; }
      }
    }
    if (blocked) {
      car.speed -= 320 * dt;
      if (car.speed < 0) car.speed = 0;
    } else {
      car.speed += (cruise - car.speed) * clamp(dt * 1.4, 0, 1);
    }
    if (Math.abs(car.speed) < 4 && !blocked) {
      car.ai.stuckT += dt;
      if (car.ai.stuckT > 3) {
        car.ai.stuckT = 0;
        pickNextNode(state, car);
      }
    } else car.ai.stuckT = 0;
    moveCar(state, car, dt, false);
  }
}

// ---------------------------------------------------------------- police

function stepPoliceCars(state, dt) {
  const stars = starsForHeat(state.heat);
  const p = state.player;
  const wantCars = [0, 1, 2, 2, 3, 4][stars];
  const active = state.cars.filter((c) => c.driver === 'police');
  // Despawn units that fell hopelessly behind.
  for (const c of active) {
    if (dist(c.x, c.y, p.x, p.y) > 1150) {
      c.driver = 'gone';
    }
  }
  state.cars = state.cars.filter((c) => c.driver !== 'gone');
  const remaining = state.cars.filter((c) => c.driver === 'police').length;
  if (remaining < wantCars && state.mode === 'playing') {
    // Roll in from a road node a few blocks away.
    const candidates = state.city.nodes.filter((n) => {
      const d = dist(n.x, n.y, p.x, p.y);
      return d > 430 && d < 760;
    });
    if (candidates.length) {
      const n = candidates[state.rng.int(0, candidates.length - 1)];
      const car = makeCar(state, 'police', n.x, n.y, angleTo(n.x, n.y, p.x, p.y), 'police', '#22303c');
      state.cars.push(car);
      state.sfx.push('siren');
    }
  }
  for (const car of state.cars) {
    if (car.driver !== 'police') continue;
    if (car.hp <= 0) { car.speed = 0; continue; }
    const aimX = p.x + Math.cos(p.angle) * 0; // direct pursuit
    const aimY = p.y;
    const desired = angleTo(car.x, car.y, aimX, aimY);
    car.angle = angleLerp(car.angle, desired, clamp(dt * 2.6, 0, 1));
    const d = dist(car.x, car.y, p.x, p.y);
    const targetSpeed = d > 60 ? CAR_TYPES.police.maxSpeed : CAR_TYPES.police.maxSpeed * 0.4;
    car.speed += clamp(targetSpeed - car.speed, -380 * dt, 240 * dt);
    moveCar(state, car, dt, false);
  }

  // Foot officers join from three stars up.
  const wantCops = stars >= 3 ? stars - 2 : 0;
  const liveCops = state.cops.filter((c) => c.mode !== 'down').length;
  if (liveCops < wantCops && state.mode === 'playing') {
    const a = state.rng.angle();
    const r = state.rng.range(330, 430);
    const x = clamp(p.x + Math.cos(a) * r, 30, WATER_X - 30);
    const y = clamp(p.y + Math.sin(a) * r, 30, WORLD_H - 30);
    state.cops.push({ id: id(), x, y, angle: 0, hp: 40, mode: 'chase', fireT: state.rng.range(0.4, 1.2), downT: 0 });
  }
}

function stepCops(state, dt) {
  const p = state.player;
  for (const cop of state.cops) {
    if (cop.mode === 'down') {
      cop.downT -= dt;
      continue;
    }
    const d = dist(cop.x, cop.y, p.x, p.y);
    cop.angle = angleTo(cop.x, cop.y, p.x, p.y);
    if (d > 215) {
      cop.x += Math.cos(cop.angle) * 152 * dt;
      cop.y += Math.sin(cop.angle) * 152 * dt;
      collideWorld(state, cop, 12);
    } else {
      // In range: plant feet and fire on a rhythm.
      cop.fireT -= dt;
      if (cop.fireT <= 0 && state.mode === 'playing') {
        cop.fireT = 0.9;
        state.sfx.push('copshot');
        const hitChance = clamp(0.62 - d / 1400, 0.15, 0.6);
        state.effects.push({ kind: 'tracer', x1: cop.x, y1: cop.y, x2: p.x, y2: p.y, ttl: 0.06, max: 0.06 });
        if (state.rng.chance(hitChance)) {
          hurtPlayer(state, state.rng.range(4, 8));
          state.shake = Math.max(state.shake, 2.5);
        }
      }
    }
  }
  state.cops = state.cops.filter((c) => !(c.mode === 'down' && c.downT <= 0));
}

// ---------------------------------------------------------------- people

function stepPeds(state, dt, input) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.mode === 'down') {
      ped.downT -= dt;
      continue;
    }
    if (ped.mode === 'flee') {
      ped.fleeT -= dt;
      const away = angleTo(ped.fleeX, ped.fleeY, ped.x, ped.y);
      ped.angle = angleLerp(ped.angle, away, dt * 6);
      ped.x += Math.cos(ped.angle) * 205 * dt;
      ped.y += Math.sin(ped.angle) * 205 * dt;
      if (ped.fleeT <= 0) ped.mode = 'walk';
    } else {
      // Amble toward a stroll target; pick a new one on arrival.
      const d = dist(ped.x, ped.y, ped.tx, ped.ty);
      if (d < 14) {
        // Wander near a random street corner.
        const ax = state.rng.pick(state.city.avenues);
        const sy = state.rng.pick(state.city.streets);
        ped.tx = clamp(ax + state.rng.pick([-1, 1]) * (state.city.roadW / 2 + 16) + state.rng.range(-30, 30), 30, WATER_X - 40);
        ped.ty = clamp(sy + state.rng.range(-160, 160), 30, WORLD_H - 30);
        if (state.rng.chance(0.5)) {
          ped.tx = clamp(ped.x + state.rng.range(-260, 260), 30, WATER_X - 40);
          ped.ty = clamp(sy + state.rng.pick([-1, 1]) * (state.city.roadW / 2 + 16), 30, WORLD_H - 30);
        }
      }
      ped.angle = angleLerp(ped.angle, angleTo(ped.x, ped.y, ped.tx, ped.ty), dt * 5);
      ped.x += Math.cos(ped.angle) * 62 * dt;
      ped.y += Math.sin(ped.angle) * 62 * dt;
    }
    ped.walkPhase += dt * 9;
    collideWorld(state, ped, 10);
    ped.x = clamp(ped.x, 16, WATER_X - 10);
    ped.y = clamp(ped.y, 16, WORLD_H - 16);
    void p;
    void input;
  }
  state.peds = state.peds.filter((ped) => !(ped.mode === 'down' && ped.downT <= 0));
  // Keep the streets populated.
  while (state.peds.length < 22) {
    state.peds.push(makePed(state, state.rng.range(200, 3300), state.rng.range(150, 2900)));
  }
}

// ---------------------------------------------------------------- pickups & spray

function stepPickups(state, dt) {
  const p = state.player;
  for (const pk of state.pickups) {
    if (pk.respawnT > 0) {
      pk.respawnT -= dt;
      continue;
    }
    if (dist(p.x, p.y, pk.x, pk.y) < 36) {
      if (pk.kind === 'cash') {
        p.cash += pk.amount;
        state.stats.earned += pk.amount;
        state.sfx.push('cash');
        pk.respawnT = -1; // one-shot: removed below
      } else if (pk.kind === 'health') {
        if (p.hp >= 100) continue;
        p.hp = Math.min(100, p.hp + pk.amount);
        state.sfx.push('pickup');
        pk.respawnT = pk.maxRespawn;
      } else if (pk.kind === 'armour') {
        if (p.armour >= 100) continue;
        p.armour = 100;
        state.sfx.push('pickup');
        pk.respawnT = pk.maxRespawn;
      } else if (pk.kind === 'bribe') {
        const stars = starsForHeat(state.heat);
        if (stars === 0) continue;
        state.heat = (stars - 1) * HEAT_PER_STAR;
        pushToast(state, 'Street', 'A quiet word in the right ear. One star, gone.');
        state.sfx.push('pickup');
        pk.respawnT = pk.maxRespawn;
      } else if (pk.kind === 'ammo') {
        p.reserve += pk.amount;
        state.sfx.push('pickup');
        pk.respawnT = pk.maxRespawn;
      }
    }
  }
  state.pickups = state.pickups.filter((pk) => pk.respawnT !== -1);
}

function stepSpray(state, car, dt) {
  const spot = state.city.places.spray;
  const p = state.player;
  const inBay = dist(car.x, car.y, spot.x, spot.y) < 62 && Math.abs(car.speed) < 24;
  if (inBay && state.heat > 0 && p.cash >= 100 && car.hp > 0) {
    state.sprayT += dt;
    if (state.sprayT > 1.6) {
      p.cash -= 100;
      state.heat = 0;
      car.hp = car.maxHp;
      state.sprayT = 0;
      state.sfx.push('spray');
      pushToast(state, "Pay 'n Spray", 'Fresh paint, clean plates. You were never here.');
    }
  } else {
    state.sprayT = 0;
  }
}

// ---------------------------------------------------------------- wanted

function stepWanted(state, dt) {
  const p = state.player;
  // Are the police close enough to have eyes on the player?
  let seen = false;
  for (const c of state.cars) {
    if (c.driver === 'police' && dist(c.x, c.y, p.x, p.y) < 430) { seen = true; break; }
  }
  if (!seen) for (const c of state.cops) {
    if (c.mode !== 'down' && dist(c.x, c.y, p.x, p.y) < 380) { seen = true; break; }
  }
  if (seen) state.unseenT = 0;
  else {
    state.unseenT += dt;
    if (state.unseenT > 5 && state.heat > 0) {
      state.heat = Math.max(0, state.heat - 5.5 * dt);
    }
  }
  if (state.mission.active && state.mission.idx === 3 && state.mission.stage === 1) {
    // The Pickup runs hot the whole way to the marina.
    state.heat = Math.max(state.heat, 2 * HEAT_PER_STAR + 1);
  }

  // Busted: an officer pinning a slow player on foot ends the run.
  if (!p.carId && starsForHeat(state.heat) > 0 && p.speedMag < 70) {
    let near = false;
    for (const c of state.cops) if (c.mode !== 'down' && dist(c.x, c.y, p.x, p.y) < 52) { near = true; break; }
    if (!near) for (const c of state.cars) {
      if (c.driver === 'police' && Math.abs(c.speed) < 40 && dist(c.x, c.y, p.x, p.y) < 56) { near = true; break; }
    }
    if (near) state.bustedMeter += dt / 2.2;
    else state.bustedMeter = Math.max(0, state.bustedMeter - dt * 1.4);
  } else {
    state.bustedMeter = Math.max(0, state.bustedMeter - dt * 1.4);
  }
  if (state.bustedMeter >= 1 && state.mode === 'playing') {
    state.mode = 'busted';
    state.endReason = 'busted';
    state.sfx.push('busted');
  }
}

// ---------------------------------------------------------------- missions

function arrived(state, x, y, r) {
  const p = state.player;
  return dist(p.x, p.y, x, y) < r;
}

function completeMission(state) {
  const m = state.mission;
  const reward = MISSIONS[m.idx].reward;
  state.player.cash += reward;
  state.stats.earned += reward;
  state.sfx.push('mission');
  pushToast(state, 'Mara Voss', 'Mara: Clean work. $' + reward + ' is yours. Lie low, I\'ll call again.');
  if (m.idx === MISSIONS.length - 1) {
    state.storyComplete = true;
    state.saveDirty = true;
    state.mission.active = false;
    state.mode = 'complete';
    state.endReason = 'complete';
    state.sfx.push('complete');
    return;
  }
  m.idx += 1;
  m.active = false;
  m.delay = 4;
  state.saveDirty = true;
}

function stepMissions(state, dt) {
  const m = state.mission;
  if (!m.active) return;
  const P = state.city.places;
  if (m.timer !== null) {
    m.timer -= dt;
    if (m.timer <= 0) {
      // Out of time: Mara resets the job, not the friendship.
      pushToast(state, 'Mara Voss', 'Mara: Too slow. We go again — same job, fresh clock.');
      const idx = m.idx;
      startMission(state, idx);
      return;
    }
  }
  switch (m.idx) {
    case 0:
      if (m.stage === 0 && arrived(state, P.docks.x, P.docks.y, 78)) {
        m.stage = 1;
        state.sfx.push('pickup');
        pushToast(state, 'Mara Voss', 'Mara: Package aboard. West Warehouse, other side of town. Go.');
      } else if (m.stage === 1 && arrived(state, P.warehouse.x, P.warehouse.y, 82)) {
        completeMission(state);
      }
      break;
    case 1: {
      if (m.stage === 1) {
        const gold = getCar(state, m.goldCarId);
        if (gold && state.player.carId === gold.id && arrived(state, P.garage.x, P.garage.y, 84)) {
          gold.gold = false;
          gold.driver = 'parked';
          state.player.carId = null;
          state.player.x = gold.x + 40;
          state.player.y = gold.y + 30;
          m.timer = null;
          completeMission(state);
        } else if (gold && gold.hp <= 0) {
          pushToast(state, 'Mara Voss', 'Mara: You wrecked it. Fresh one\'s coming — do better.');
          startMission(state, 1);
        }
      }
      break;
    }
    case 2:
      if (m.stage === 0 && state.crates.every((c) => c.gone)) {
        m.stage = 1;
        pushToast(state, 'Mara Voss', 'Mara: Beautiful noise. Now disappear — safehouse.');
      } else if (m.stage === 1 && arrived(state, P.safehouse.x, P.safehouse.y, 80)) {
        completeMission(state);
      }
      break;
    case 3:
      if (m.stage === 0 && arrived(state, P.airstrip.x, P.airstrip.y, 85)) {
        m.stage = 1;
        m.passenger = true;
        state.sfx.push('pickup');
        pushToast(state, 'Driver', 'Driver: I\'m in. Marina Pier — and friend, they already know.');
      } else if (m.stage === 1 && arrived(state, P.marina.x, P.marina.y, 86)) {
        completeMission(state);
      }
      break;
    case 4:
      if (m.stage === 0) {
        for (const bag of state.bags) {
          if (!bag.got && arrived(state, bag.x, bag.y, 58)) {
            bag.got = true;
            state.sfx.push('cash');
          }
        }
        if (state.bags.every((b) => b.got)) {
          m.stage = 1;
          pushToast(state, 'Mara Voss', 'Mara: All three bags. The boat, now — harbour side.');
        }
      } else if (m.stage === 1 && arrived(state, P.marina.x, P.marina.y, 86)) {
        m.timer = null;
        completeMission(state);
      }
      break;
    default:
      break;
  }
}
