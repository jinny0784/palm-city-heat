// Palm City Heat — the simulation. Everything that moves, shoots, chases,
// pays out or gets stolen lives here, in plain data and one step function.
//
// The module knows nothing about the DOM or the canvas: the browser shell
// (main.js) fills world.input from the keyboard and mouse and hands the
// world to render.js, and the smoke test drives the exact same step
// function from Node with its own inputs.

import { makeRng } from './random.js';
import { buildCity, onRoad, resolveCircle } from './city.js';
import {
  WORLD_W, WORLD_H, V_ROADS, H_ROADS, BEACH_X, CAR_TYPES, CAR_COLOURS,
  PED_COLOURS, PLACES, PLAYER, WANTED,
} from './config.js';

const TAU = Math.PI * 2;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ------------------------------------------------------------------ setup

let nextId = 1;

function makeCar(kind, type, x, y, angle, colour) {
  const spec = CAR_TYPES[type];
  return {
    id: nextId++, kind, type, x, y, angle,
    speed: 0, hp: spec.hp, maxHp: spec.hp, radius: spec.radius,
    colour, driver: kind === 'traffic', cruise: 0, axis: null, road: 0, dirSign: 1,
    fleeT: 0, turnCd: 0, dead: false,
  };
}

/** A point on the pavement border of a block, `inset` px inside its edge. */
function perimeterPoints(block, inset) {
  const { x, y, w, h } = block;
  return [
    { x: x + inset, y: y + inset },
    { x: x + w - inset, y: y + inset },
    { x: x + w - inset, y: y + h - inset },
    { x: x + inset, y: y + h - inset },
  ];
}

function makePed(world, x, y, path) {
  return {
    id: nextId++, x, y, angle: world.rng.range(0, TAU),
    hp: 30, state: 'walk', path, pathI: world.rng.int(0, path.length - 1),
    colour: world.rng.pick(PED_COLOURS), fleeFrom: null, fleeT: 0,
    downT: 0, walkSpeed: world.rng.range(52, 78), phase: world.rng.range(0, TAU),
  };
}

export function createWorld(seed) {
  const rng = makeRng(seed);
  const world = {
    seed, rng, city: buildCity(seed), time: 0, mode: 'title',
    player: {
      x: PLACES.spawn.x, y: PLACES.spawn.y, angle: -Math.PI / 2,
      hp: PLAYER.hp, armour: 0, ammo: 60, car: null, fireCd: 0,
      walkPhase: 0, lastDamageT: -99,
    },
    input: { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, sprint: false, handbrake: false },
    cars: [], peds: [], cops: [], bullets: [], pickups: [], particles: [],
    crates: [], bags: [], toasts: [], events: [],
    cash: 0, wanted: 0, heatCd: 0, unseenT: 0, bustedMeter: 0, policeSpawnCd: 0,
    mission: null, goldCar: null, driverPed: null, driverAboard: false,
    stats: { shots: 0, steals: 0, earned: 0, crashes: 0 },
    shake: 0, engineOn: false, engineLoad: 0, policeNear: false,
    storyComplete: false,
  };

  // Parked cars along the avenue edges, noses aligned with the road.
  const parkedSpots = [];
  for (let i = 0; i < 40 && parkedSpots.length < 12; i++) {
    const vertical = rng.chance(0.6);
    if (vertical) {
      const cx = rng.pick(V_ROADS);
      const y = rng.range(120, WORLD_H - 120);
      if (H_ROADS.some((hy) => Math.abs(y - hy) < 150)) continue;
      parkedSpots.push({ x: cx + rng.pick([-52, 52]), y, angle: rng.pick([Math.PI / 2, -Math.PI / 2]) });
    } else {
      const cy = rng.pick(H_ROADS);
      const x = rng.range(120, 3000);
      if (V_ROADS.some((vx) => Math.abs(x - vx) < 150)) continue;
      parkedSpots.push({ x, y: cy + rng.pick([-52, 52]), angle: rng.pick([0, Math.PI]) });
    }
  }
  for (const s of parkedSpots) {
    world.cars.push(makeCar('parked', rng.pick(['sedan', 'sedan', 'taxi', 'van', 'sports']), s.x, s.y, s.angle, rng.pick(CAR_COLOURS)));
  }

  // Traffic already flowing when the curtain goes up.
  for (let i = 0; i < 14; i++) {
    const vertical = rng.chance(0.55);
    const type = rng.pick(['sedan', 'sedan', 'taxi', 'van']);
    let car;
    if (vertical) {
      const cx = rng.pick(V_ROADS);
      const dirSign = rng.pick([1, -1]);
      car = makeCar('traffic', type, cx + (dirSign > 0 ? -32 : 32), rng.range(80, WORLD_H - 80), dirSign > 0 ? Math.PI / 2 : -Math.PI / 2, rng.pick(CAR_COLOURS));
      car.axis = 'v'; car.road = cx; car.dirSign = dirSign;
    } else {
      const cy = rng.pick(H_ROADS);
      const dirSign = rng.pick([1, -1]);
      car = makeCar('traffic', type, rng.range(80, 2900), cy + (dirSign > 0 ? 32 : -32), dirSign > 0 ? 0 : Math.PI, rng.pick(CAR_COLOURS));
      car.axis = 'h'; car.road = cy; car.dirSign = dirSign;
    }
    car.cruise = rng.range(112, 158);
    car.speed = car.cruise;
    world.cars.push(car);
  }

  // Pedestrians strolling the pavements, plus a few on the sand.
  for (let i = 0; i < 26; i++) {
    const block = rng.pick(world.city.blocks);
    const path = perimeterPoints(block, 15);
    const start = path[rng.int(0, 3)];
    world.peds.push(makePed(world, start.x, start.y, path));
  }
  for (let i = 0; i < 5; i++) {
    const y = rng.range(200, 2800);
    world.peds.push(makePed(world, 3660, y, [{ x: 3660, y: 120 }, { x: 3660, y: WORLD_H - 120 }]));
  }

  // Standing pickups: a little help scattered around the city.
  const addPickup = (kind, x, y, value = 0) => world.pickups.push({ id: nextId++, kind, x, y, value, phase: rng.range(0, TAU), dead: false });
  addPickup('health', 1240, 560);
  addPickup('health', 2750, 2150);
  addPickup('ammo', 660, 905);
  addPickup('ammo', 2400, 500);
  addPickup('armour', PLACES.safehouse.x - 30, PLACES.safehouse.y - 30);
  addPickup('star', 2620, 1240);
  addPickup('star', 520, 1300);

  // The depot's supply crates stand there from the start; the mission
  // that cares about them resets them when it begins.
  resetCrates(world);
  return world;
}

function resetCrates(world) {
  world.crates = [
    { x: 700, y: 700, hp: 50, alive: true },
    { x: 845, y: 765, hp: 50, alive: true },
    { x: 765, y: 865, hp: 50, alive: true },
  ];
}

/** Add a police interceptor at a spot — used by the screenshot staging. */
export function spawnPoliceCar(world, x, y, angle) {
  const car = makeCar('police', 'police', x, y, angle, '#2c3e50');
  world.cars.push(car);
  return car;
}

// ------------------------------------------------------------------ run / missions

export function startRun(world, save) {
  const p = world.player;
  p.x = PLACES.spawn.x; p.y = PLACES.spawn.y; p.hp = PLAYER.hp;
  p.armour = 0; p.ammo = 60; p.car = null; p.fireCd = 0; p.lastDamageT = -99;
  world.cash = save?.cash ?? 120;
  world.wanted = 0; world.heatCd = 0; world.unseenT = 0; world.bustedMeter = 0;
  world.bullets = []; world.cops = []; world.particles = []; world.toasts = [];
  world.cars = world.cars.filter((c) => c.kind !== 'police');
  world.storyComplete = save?.story ?? false;
  world.mode = 'play';
  if (world.storyComplete) {
    world.mission = null;
    toast(world, 'Mara Voss', 'Palm City is yours now. The streets remember you.');
  } else {
    startMission(world, save?.mission ?? 0);
  }
}

function toast(world, from, text) {
  world.toasts.push({ from, text, t: 0, ttl: 6.5 });
  if (world.toasts.length > 3) world.toasts.shift();
}

const MISSION_TEXT = [
  { name: 'First Run', reward: 300 },
  { name: 'Hot Wheels', reward: 500 },
  { name: 'Loud Message', reward: 450 },
  { name: 'The Pickup', reward: 600 },
  { name: 'Last Job', reward: 1500 },
];

export function startMission(world, index) {
  const m = { index, stage: 0, name: MISSION_TEXT[index].name, text: '', marker: null, timer: -1, bagsGot: 0 };
  world.mission = m;
  world.driverAboard = false;
  if (index === 0) {
    m.text = 'Pick up the package at the docks';
    m.marker = { ...PLACES.docks };
    toast(world, 'Mara Voss', 'First job, simple one. Package waiting at the docks, south-east shore. Bring it to the cafe on the west side.');
  } else if (index === 1) {
    const old = world.goldCar;
    if (old) old.dead = true;
    const car = makeCar('gold', 'sports', PLACES.goldCar.x, PLACES.goldCar.y, Math.PI / 2, '#f7c948');
    world.cars.push(car);
    world.goldCar = car;
    m.text = 'Steal the gold Comet GT';
    m.marker = { x: car.x, y: car.y };
    toast(world, 'Mara Voss', 'A gold Comet GT is parked up north, feeling very stealable. Take it, then drop it at my garage.');
  } else if (index === 2) {
    resetCrates(world);
    m.text = 'Reach the rival depot';
    m.marker = { ...PLACES.depot };
    toast(world, 'Mara Voss', 'Rivals are stocking up at the old depot. Send a message: shoot out their three supply crates, then lay low at the safehouse.');
  } else if (index === 3) {
    const ped = makePed(world, PLACES.airstrip.x, PLACES.airstrip.y, [{ ...PLACES.airstrip }]);
    ped.state = 'wait';
    world.peds.push(ped);
    world.driverPed = ped;
    m.text = "Pick up Mara's driver at the airstrip";
    m.marker = { ...PLACES.airstrip };
    toast(world, 'Mara Voss', 'My driver is waiting at the airstrip, south-west. Collect him and drive him to the marina. The police will notice. Keep moving.');
  } else if (index === 4) {
    world.bags = PLACES.bags.map((b) => ({ ...b, taken: false }));
    m.text = 'Collect the 3 cash bags';
    m.marker = { ...world.bags[0] };
    toast(world, 'Mara Voss', 'Last job. Three cash bags around the city, then the boat at the marina. Everything you have learned. Go.');
  }
}

function completeMission(world) {
  const m = world.mission;
  const reward = MISSION_TEXT[m.index].reward;
  world.cash += reward;
  world.stats.earned += reward;
  world.events.push('jingle');
  if (m.index === 4) {
    world.storyComplete = true;
    world.mission = null;
    world.mode = 'story';
    toast(world, 'Mara Voss', 'Done. The city is quieter tonight because of you.');
    return;
  }
  toast(world, 'Mara Voss', `Clean work. $${reward} is yours.`);
  startMission(world, m.index + 1);
}

function failMission(world, why) {
  toast(world, 'Mara Voss', why);
  startMission(world, world.mission.index);
}

// ------------------------------------------------------------------ damage & heat

function damagePlayer(world, n) {
  const p = world.player;
  const absorbed = Math.min(p.armour, n);
  p.armour -= absorbed;
  p.hp -= n - absorbed;
  p.lastDamageT = world.time;
  world.events.push('hit');
  if (p.hp <= 0 && world.mode === 'play') {
    p.hp = 0;
    world.mode = 'wasted';
    world.events.push('wasted');
  }
}

/** Is there a living witness (ped, cop, police car) within r of a point? */
function witnessed(world, x, y, r) {
  for (const ped of world.peds) if (ped.state !== 'down' && Math.hypot(ped.x - x, ped.y - y) < r) return true;
  for (const cop of world.cops) if (Math.hypot(cop.x - x, cop.y - y) < r) return true;
  for (const car of world.cars) if (car.kind === 'police' && Math.hypot(car.x - x, car.y - y) < r) return true;
  return false;
}

function addHeat(world, n, always = false) {
  if (world.mission?.index === 3 && world.mission?.stage === 1) return; // M4: heat is fixed
  if (!always && world.heatCd > 0) return;
  world.wanted = clamp(world.wanted + n, 0, WANTED.max);
  if (!always) world.heatCd = WANTED.heatCooldown;
  world.unseenT = 0;
}

// ------------------------------------------------------------------ interacting

export function tryInteract(world) {
  const p = world.player;
  if (world.mode !== 'play') return;
  if (p.car) {
    // Get out, beside the car.
    const car = p.car;
    p.car = null;
    const side = { x: car.x + Math.cos(car.angle + Math.PI / 2) * (car.radius + 20), y: car.y + Math.sin(car.angle + Math.PI / 2) * (car.radius + 20) };
    p.x = side.x; p.y = side.y;
    resolveCircle(world.city, p, PLAYER.radius);
    car.speed = 0;
    if (car.kind === 'traffic') car.kind = 'parked';
    world.events.push('enter');
    return;
  }
  // Find the closest car worth entering.
  let best = null;
  let bestD = PLAYER.interactRange;
  for (const car of world.cars) {
    if (car.dead) continue;
    const d = dist(p, car);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (!best) return;
  p.car = best;
  world.events.push('enter');
  if (best.driver && best.kind === 'traffic') {
    // Theft: the driver bails out and runs.
    best.driver = false;
    const ped = makePed(world, best.x, best.y, perimeterPoints(world.city.blocks[0], 15));
    ped.state = 'flee';
    ped.fleeFrom = { x: p.x, y: p.y };
    ped.fleeT = 4;
    world.peds.push(ped);
    world.stats.steals++;
    addHeat(world, 1, true);
    toast(world, '', 'Car stolen — wanted level up');
  } else if (best.kind === 'police') {
    world.stats.steals++;
    addHeat(world, 1, true);
  }
  if (world.mission?.index === 1 && world.mission.stage === 0 && best === world.goldCar) {
    const m = world.mission;
    m.stage = 1;
    m.timer = 150;
    m.text = 'Deliver the Comet to the garage';
    m.marker = { ...PLACES.garage };
    toast(world, 'Mara Voss', 'That is the one. Garage, north side of the avenue. Clock is running.');
  }
}

// ------------------------------------------------------------------ shooting

function firePistol(world) {
  const p = world.player;
  const a = Math.atan2(world.input.aimY - p.y, world.input.aimX - p.x);
  p.angle = a;
  if (p.ammo <= 0) {
    p.fireCd = 0.3;
    world.events.push('click');
    return;
  }
  p.ammo--;
  p.fireCd = PLAYER.pistolCooldown;
  world.stats.shots++;
  const gx = p.x + Math.cos(a) * 20;
  const gy = p.y + Math.sin(a) * 20;
  world.bullets.push({ x: gx, y: gy, vx: Math.cos(a) * 920, vy: Math.sin(a) * 920, life: PLAYER.pistolRange / 920, from: 'player', dmg: 25 });
  world.particles.push({ x: gx, y: gy, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, life: 0.07, maxLife: 0.07, colour: '#ffd76a', size: 5 });
  world.events.push('shot');
  if (witnessed(world, p.x, p.y, 380)) addHeat(world, 1);
  // Gunfire panics nearby pedestrians.
  for (const ped of world.peds) {
    if (ped.state === 'walk' && Math.hypot(ped.x - p.x, ped.y - p.y) < 300) {
      ped.state = 'flee'; ped.fleeFrom = { x: p.x, y: p.y }; ped.fleeT = 3.5;
    }
  }
}

function copShoot(world, cop) {
  const p = world.player;
  const tx = p.car ? p.car.x : p.x;
  const ty = p.car ? p.car.y : p.y;
  const a = Math.atan2(ty - cop.y, tx - cop.x);
  world.bullets.push({ x: cop.x + Math.cos(a) * 18, y: cop.y + Math.sin(a) * 18, vx: Math.cos(a) * 720, vy: Math.sin(a) * 720, life: 0.55, from: 'cop', dmg: 5 });
  world.events.push('shot');
}

// ------------------------------------------------------------------ particles

function burst(world, x, y, colour, n, speed, life, size) {
  for (let i = 0; i < n; i++) {
    if (world.particles.length > 320) return;
    const a = world.rng.range(0, TAU);
    const s = world.rng.range(speed * 0.3, speed);
    world.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * world.rng.range(0.5, 1), maxLife: life, colour, size: size * world.rng.range(0.6, 1.3) });
  }
}

// ------------------------------------------------------------------ the step

export function stepWorld(world, dt) {
  if (world.mode !== 'play') return;
  const p = world.player;
  const input = world.input;
  world.time += dt;
  world.heatCd = Math.max(0, world.heatCd - dt);
  world.policeSpawnCd = Math.max(0, world.policeSpawnCd - dt);
  p.fireCd = Math.max(0, p.fireCd - dt);
  world.shake = Math.max(0, world.shake - dt * 26);

  stepPlayer(world, dt);
  for (const car of world.cars) {
    if (car.dead || car === p.car) continue;
    if (car.kind === 'traffic' && car.driver) stepTraffic(world, car, dt);
    else if (car.kind === 'police') stepPoliceCar(world, car, dt);
  }
  for (const cop of world.cops) stepCop(world, cop, dt);
  for (const ped of world.peds) stepPed(world, ped, dt);
  stepCarCollisions(world);
  stepBullets(world, dt);
  stepPickups(world);
  stepMission(world, dt);
  stepWanted(world, dt);
  stepSpawning(world);

  // Particles and toasts tick down.
  for (const fx of world.particles) {
    fx.life -= dt;
    fx.x += fx.vx * dt;
    fx.y += fx.vy * dt;
  }
  world.particles = world.particles.filter((fx) => fx.life > 0);
  for (const t of world.toasts) t.t += dt;
  world.toasts = world.toasts.filter((t) => t.t < t.ttl);
  world.cars = world.cars.filter((c) => !c.dead);
  world.cops = world.cops.filter((c) => !c.dead);
  world.peds = world.peds.filter((ped) => !(ped.state === 'down' && ped.downT > 6));

  // Health creeps back when nobody has hurt you for a while.
  if (p.hp > 0 && p.hp < 100 && world.time - p.lastDamageT > 8) p.hp = Math.min(100, p.hp + dt * 4);

  // Sirens for the audio layer: any police close by?
  world.policeNear = world.cars.some((c) => c.kind === 'police' && dist(c, p) < 720) || world.cops.some((c) => dist(c, p) < 720);
}

function stepPlayer(world, dt) {
  const p = world.player;
  const input = world.input;
  if (p.car) {
    const car = p.car;
    const spec = CAR_TYPES[car.type];
    const fwd = -input.moveY;
    const broken = car.hp <= 0;
    if (!broken && fwd > 0) car.speed += spec.accel * dt;
    else if (!broken && fwd < 0) car.speed += (car.speed > 12 ? -430 : -170) * dt;
    else {
      // Rolling resistance.
      const drag = 130 * dt;
      car.speed = Math.abs(car.speed) <= drag ? 0 : car.speed - Math.sign(car.speed) * drag;
    }
    if (input.handbrake) {
      const drag = 620 * dt;
      car.speed = Math.abs(car.speed) <= drag ? 0 : car.speed - Math.sign(car.speed) * drag;
    }
    car.speed = clamp(car.speed, -128, broken ? 0 : spec.maxSpeed);
    const steer = input.moveX * (input.handbrake ? 1.55 : 1);
    if (car.speed !== 0) car.angle += steer * dt * 2.15 * (car.speed / spec.maxSpeed) * (car.speed < 0 ? -1 : 1);
    const prevSpeed = car.speed;
    const startX = car.x;
    const startY = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    resolveCircle(world.city, car, car.radius);
    const travelled = Math.hypot(car.x - startX, car.y - startY);
    if (Math.abs(prevSpeed) > 165 && travelled < Math.abs(prevSpeed) * dt * 0.45) {
      // A wall stopped us hard.
      const impact = Math.abs(prevSpeed);
      car.hp -= (impact - 150) / 11;
      if (impact > 250) { damagePlayer(world, (impact - 250) / 22); world.shake = 7; }
      world.stats.crashes++;
      burst(world, car.x, car.y, '#cfd8dc', 10, 130, 0.4, 3);
      world.events.push('crash');
      car.speed = -prevSpeed * 0.22;
    }
    if (car.hp < 35 && world.rng.chance(0.3)) {
      world.particles.push({ x: car.x, y: car.y - 6, vx: world.rng.range(-8, 8), vy: world.rng.range(-26, -12), life: 0.8, maxLife: 0.8, colour: '#5d6d7e', size: 6 });
    }
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    world.engineOn = true;
    world.engineLoad = Math.abs(car.speed) / spec.maxSpeed;
    return;
  }

  world.engineOn = false;
  world.engineLoad = 0;
  const mx = input.moveX;
  const my = input.moveY;
  const len = Math.hypot(mx, my);
  if (len > 0.01) {
    const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    p.x += (mx / Math.max(1, len)) * speed * dt;
    p.y += (my / Math.max(1, len)) * speed * dt;
    p.walkPhase += dt * speed * 0.055;
    if (!input.fire) p.angle = Math.atan2(my, mx);
  }
  resolveCircle(world.city, p, PLAYER.radius);
  if (input.fire) {
    p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    if (p.fireCd <= 0) firePistol(world);
  }
}

/** Is something solid-ish in this traffic car's lane, just ahead? */
function trafficBlocked(world, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const ahead = (o, rr) => {
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const forward = dx * fx + dy * fy;
    const lateral = Math.abs(dx * -fy + dy * fx);
    return forward > 6 && forward < 96 && lateral < rr;
  };
  for (const other of world.cars) {
    if (other === car || other.dead) continue;
    if (ahead(other, 30)) return true;
  }
  for (const ped of world.peds) {
    if (ped.state !== 'down' && ahead(ped, 26)) return true;
  }
  const p = world.player;
  if (!p.car && ahead(p, 26)) return true;
  return false;
}

function stepTraffic(world, car, dt) {
  if (car.fleeT > 0) car.fleeT -= dt;
  if (car.turnCd > 0) car.turnCd -= dt;
  const blocked = trafficBlocked(world, car);
  const target = blocked ? 0 : (car.fleeT > 0 ? CAR_TYPES[car.type].maxSpeed * 0.92 : car.cruise);
  const rate = blocked ? 380 : 150;
  car.speed += clamp(target - car.speed, -rate * dt, rate * dt);

  // Glide along the lane; at an intersection, maybe turn onto the cross road.
  if (car.axis === 'v') {
    car.y += car.dirSign * car.speed * dt;
    car.x += ((car.road + (car.dirSign > 0 ? -32 : 32)) - car.x) * Math.min(1, dt * 3);
    for (const hy of H_ROADS) {
      if (Math.abs(car.y - hy) < 14 && Math.abs(car.speed) > 1 && car.turnCd <= 0) {
        car.turnCd = 0.6; // one decision per crossing
        if (world.rng.chance(0.38)) {
          car.axis = 'h'; car.road = hy; car.dirSign = world.rng.pick([1, -1]);
          car.angle = car.dirSign > 0 ? 0 : Math.PI;
          car.y = hy + (car.dirSign > 0 ? 32 : -32);
        }
        break;
      }
    }
    if (car.y < 60) { car.dirSign = 1; car.angle = Math.PI / 2; }
    if (car.y > WORLD_H - 60) { car.dirSign = -1; car.angle = -Math.PI / 2; }
  } else {
    car.x += car.dirSign * car.speed * dt;
    car.y += ((car.road + (car.dirSign > 0 ? 32 : -32)) - car.y) * Math.min(1, dt * 3);
    for (const vx of V_ROADS) {
      if (Math.abs(car.x - vx) < 14 && Math.abs(car.speed) > 1 && car.turnCd <= 0) {
        car.turnCd = 0.6; // one decision per crossing
        if (world.rng.chance(0.38)) {
          car.axis = 'v'; car.road = vx; car.dirSign = world.rng.pick([1, -1]);
          car.angle = car.dirSign > 0 ? Math.PI / 2 : -Math.PI / 2;
          car.x = vx + (car.dirSign > 0 ? -32 : 32);
        }
        break;
      }
    }
    if (car.x < 60) { car.dirSign = 1; car.angle = 0; }
    if (car.x > BEACH_X - 80) { car.dirSign = -1; car.angle = Math.PI; }
  }
  if (car.speed > 1) car.angle = car.axis === 'v' ? (car.dirSign > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dirSign > 0 ? 0 : Math.PI);
}

function stepPoliceCar(world, car, dt) {
  const p = world.player;
  const spec = CAR_TYPES.police;
  const tx = p.car ? p.car.x : p.x;
  const ty = p.car ? p.car.y : p.y;
  const d = Math.hypot(tx - car.x, ty - car.y);
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  car.angle += clamp(diff, -2.7 * dt, 2.7 * dt);
  // Chase hard; ease off only when right on top of a player on foot.
  const want = !p.car && d < 52 ? 0 : spec.maxSpeed * (Math.abs(diff) > 1.2 ? 0.45 : 1);
  car.speed += clamp(want - car.speed, -430 * dt, spec.accel * dt);
  const prevSpeed = car.speed;
  const startX = car.x;
  const startY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  resolveCircle(world.city, car, car.radius);
  if (Math.abs(prevSpeed) > 190 && Math.hypot(car.x - startX, car.y - startY) < Math.abs(prevSpeed) * dt * 0.45) {
    car.hp -= 6;
    car.speed = -prevSpeed * 0.2;
  }
}

function stepCop(world, cop, dt) {
  const p = world.player;
  const tx = p.car ? p.car.x : p.x;
  const ty = p.car ? p.car.y : p.y;
  const d = Math.hypot(tx - cop.x, ty - cop.y);
  cop.shootCd = Math.max(0, (cop.shootCd ?? 0) - dt);
  if (d > 185) {
    const a = Math.atan2(ty - cop.y, tx - cop.x);
    cop.x += Math.cos(a) * 148 * dt;
    cop.y += Math.sin(a) * 148 * dt;
    cop.angle = a;
    resolveCircle(world.city, cop, 14);
  } else {
    cop.angle = Math.atan2(ty - cop.y, tx - cop.x);
    if (cop.shootCd <= 0 && d < 345) {
      copShoot(world, cop);
      cop.shootCd = 1.25;
    }
  }
}

function stepPed(world, ped, dt) {
  if (ped.state === 'down') { ped.downT += dt; return; }
  if (ped.state === 'wait') return;
  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    const from = ped.fleeFrom ?? { x: ped.x + 1, y: ped.y };
    const a = Math.atan2(ped.y - from.y, ped.x - from.x);
    ped.x += Math.cos(a) * 192 * dt;
    ped.y += Math.sin(a) * 192 * dt;
    ped.angle = a;
    ped.phase += dt * 11;
    resolveCircle(world.city, ped, 12);
    if (ped.fleeT <= 0) ped.state = 'walk';
    return;
  }
  // Stroll the perimeter path.
  const target = ped.path[ped.pathI];
  const d = Math.hypot(target.x - ped.x, target.y - ped.y);
  if (d < 9) {
    ped.pathI = (ped.pathI + 1) % ped.path.length;
    return;
  }
  const a = Math.atan2(target.y - ped.y, target.x - ped.x);
  ped.x += Math.cos(a) * ped.walkSpeed * dt;
  ped.y += Math.sin(a) * ped.walkSpeed * dt;
  ped.angle = a;
  ped.phase += dt * 7;
  // Cars coming close and fast are worth running from.
  for (const car of world.cars) {
    if (Math.abs(car.speed) > 120 && Math.hypot(car.x - ped.x, car.y - ped.y) < 62) {
      ped.state = 'flee'; ped.fleeFrom = { x: car.x, y: car.y }; ped.fleeT = 2.2;
      break;
    }
  }
}

function stepCarCollisions(world) {
  const p = world.player;
  const cars = world.cars.filter((c) => !c.dead);
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      const aDriven = a === p.car;
      const bDriven = b === p.car;
      if (!aDriven) { a.x -= nx * push; a.y -= ny * push; resolveCircle(world.city, a, a.radius); }
      if (!bDriven) { b.x += nx * push; b.y += ny * push; resolveCircle(world.city, b, b.radius); }
      const rel = Math.abs(a.speed - b.speed) + Math.min(Math.abs(a.speed), Math.abs(b.speed)) * 0.4;
      if (rel > 130) {
        const dmg = (rel - 110) / 14;
        a.hp -= dmg; b.hp -= dmg;
        if (aDriven || bDriven) {
          world.stats.crashes++;
          world.shake = Math.min(9, rel / 45);
          world.events.push('crash');
          if (rel > 300) damagePlayer(world, (rel - 300) / 30);
          const other = aDriven ? b : a;
          if (other.kind === 'traffic' && other.driver && world.rng.chance(0.45)) {
            other.driver = false;
            other.kind = 'parked';
            const ped = makePed(world, other.x, other.y, perimeterPoints(world.city.blocks[0], 15));
            ped.state = 'flee'; ped.fleeFrom = { x: p.x, y: p.y }; ped.fleeT = 4;
            world.peds.push(ped);
          } else if (other.kind === 'traffic') {
            other.fleeT = 3;
          }
          if (witnessed(world, p.x, p.y, 420)) addHeat(world, 1);
        }
        a.speed *= 0.55; b.speed *= 0.55;
        burst(world, (a.x + b.x) / 2, (a.y + b.y) / 2, '#ffd76a', 8, 120, 0.35, 3);
      }
    }
  }
  // Cars versus pedestrians.
  for (const car of cars) {
    if (Math.abs(car.speed) < 8) continue;
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.radius + 11) {
        if (Math.abs(car.speed) > 128) {
          knockDownPed(world, ped, car);
          car.speed *= 0.82;
        } else {
          ped.state = 'flee'; ped.fleeFrom = { x: car.x, y: car.y }; ped.fleeT = 2.4;
        }
      }
    }
  }
}

function knockDownPed(world, ped, car) {
  ped.state = 'down';
  ped.downT = 0;
  if (world.rng.chance(0.6)) {
    world.pickups.push({ id: nextId++, kind: 'cash', x: ped.x, y: ped.y, value: world.rng.int(10, 35), phase: 0, dead: false });
  }
  burst(world, ped.x, ped.y, '#e74c3c', 6, 90, 0.4, 3);
  if (car === world.player.car && witnessed(world, ped.x, ped.y, 460)) addHeat(world, 1);
}

function stepBullets(world, dt) {
  const p = world.player;
  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    // Buildings stop bullets.
    let blocked = false;
    for (const bd of world.city.buildings) {
      if (b.x >= bd.x && b.x <= bd.x + bd.w && b.y >= bd.y && b.y <= bd.y + bd.h) { blocked = true; break; }
    }
    if (blocked) {
      burst(world, b.x, b.y, '#ffeaa7', 3, 70, 0.25, 2);
      b.dead = true;
      continue;
    }
    if (b.from === 'player') {
      for (const crate of world.crates) {
        if (crate.alive && Math.hypot(crate.x - b.x, crate.y - b.y) < 22) {
          crate.hp -= b.dmg;
          burst(world, b.x, b.y, '#d2a24c', 5, 90, 0.3, 3);
          if (crate.hp <= 0) {
            crate.alive = false;
            burst(world, crate.x, crate.y, '#b9772e', 16, 150, 0.5, 4);
            world.events.push('crash');
          }
          b.dead = true;
          break;
        }
      }
      if (b.dead) continue;
      for (const ped of world.peds) {
        if (ped.state !== 'down' && Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
          ped.hp -= b.dmg;
          if (ped.hp <= 0) knockDownPed(world, ped, null);
          else { ped.state = 'flee'; ped.fleeFrom = { x: p.x, y: p.y }; ped.fleeT = 3; }
          b.dead = true;
          break;
        }
      }
      if (b.dead) continue;
      for (const cop of world.cops) {
        if (Math.hypot(cop.x - b.x, cop.y - b.y) < 15) {
          cop.hp -= b.dmg;
          burst(world, b.x, b.y, '#e74c3c', 5, 90, 0.3, 3);
          if (cop.hp <= 0) { cop.dead = true; world.events.push('hit'); }
          b.dead = true;
          break;
        }
      }
      if (b.dead) continue;
      for (const car of world.cars) {
        if (car !== p.car && Math.hypot(car.x - b.x, car.y - b.y) < car.radius + 3) {
          car.hp -= b.dmg;
          burst(world, b.x, b.y, '#ffeaa7', 4, 90, 0.3, 2);
          if (car.kind === 'traffic') car.fleeT = 3;
          b.dead = true;
          break;
        }
      }
    } else {
      // A police bullet: it can only hurt the player (or their car).
      const tx = p.car ? p.car.x : p.x;
      const ty = p.car ? p.car.y : p.y;
      const rr = p.car ? p.car.radius : 15;
      if (Math.hypot(tx - b.x, ty - b.y) < rr) {
        if (p.car) p.car.hp -= b.dmg;
        else damagePlayer(world, b.dmg);
        b.dead = true;
      }
    }
  }
  world.bullets = world.bullets.filter((b) => !b.dead);
}

function stepPickups(world) {
  const p = world.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const rr = p.car ? p.car.radius + 12 : 30;
  for (const pk of world.pickups) {
    if (pk.dead) continue;
    if (Math.hypot(pk.x - px, pk.y - py) > rr) continue;
    pk.dead = true;
    if (pk.kind === 'cash') { world.cash += pk.value; world.events.push('cash'); }
    else if (pk.kind === 'health') { p.hp = Math.min(100, p.hp + 40); world.events.push('pickup'); }
    else if (pk.kind === 'ammo') { p.ammo += 24; world.events.push('pickup'); }
    else if (pk.kind === 'armour') { p.armour = 50; world.events.push('pickup'); }
    else if (pk.kind === 'star') {
      world.wanted = Math.max(0, world.wanted - 1);
      toast(world, '', 'Bribe paid — one star gone');
      world.events.push('pickup');
    }
  }
  world.pickups = world.pickups.filter((pk) => !pk.dead);
}

// ------------------------------------------------------------------ mission logic

function stepMission(world, dt) {
  const m = world.mission;
  if (!m) return;
  const p = world.player;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(world, m.index === 1 ? 'Too slow. The buyer walked. Take the Comet again.' : 'Out of time. The boat does not wait. Again.');
      return;
    }
  }
  const near = (pt, r) => Math.hypot(p.x - pt.x, p.y - pt.y) < r;

  if (m.index === 0) {
    if (m.stage === 0 && near(PLACES.docks, 70)) {
      m.stage = 1;
      m.text = 'Deliver the package to the cafe';
      m.marker = { ...PLACES.cafe };
      toast(world, 'Mara Voss', 'Package is in hand. Cafe, west side. Do not dent it.');
    } else if (m.stage === 1 && near(PLACES.cafe, 75)) {
      completeMission(world);
    }
  } else if (m.index === 1) {
    if (m.stage === 1) {
      m.marker = { ...PLACES.garage };
      if (p.car === world.goldCar && near(PLACES.garage, 85)) completeMission(world);
      else if (world.goldCar && world.goldCar.hp <= 0) failMission(world, 'The Comet is wrecked. There is another one where that came from.');
    } else if (world.goldCar) {
      m.marker = { x: world.goldCar.x, y: world.goldCar.y };
    }
  } else if (m.index === 2) {
    if (m.stage === 0 && near(PLACES.depot, 95)) {
      m.stage = 1;
      m.text = 'Shoot out the supply crates';
      m.marker = { ...PLACES.depot };
    } else if (m.stage === 1) {
      const left = world.crates.filter((c) => c.alive).length;
      m.text = `Shoot out the supply crates (${3 - left}/3)`;
      if (left === 0) {
        m.stage = 2;
        m.text = 'Lay low at the safehouse';
        m.marker = { ...PLACES.safehouse };
        toast(world, 'Mara Voss', 'Loud enough. Now disappear — safehouse, south central.');
      }
    } else if (m.stage === 2 && near(PLACES.safehouse, 80)) {
      completeMission(world);
    }
  } else if (m.index === 3) {
    if (m.stage === 0 && near(PLACES.airstrip, 65)) {
      if (world.driverPed) { world.driverPed.dead = true; world.peds = world.peds.filter((x) => x !== world.driverPed); world.driverPed = null; }
      world.driverAboard = true;
      world.wanted = 2;
      m.stage = 1;
      m.text = 'Drive him to the marina';
      m.marker = { ...PLACES.marina };
      toast(world, 'Driver', 'Marina. Fast as you like — they are already looking for this car.');
    } else if (m.stage === 1) {
      world.wanted = 2; // The heat stays exactly here for the whole drive.
      if (p.car && near(PLACES.marina, 90)) completeMission(world);
    }
  } else if (m.index === 4) {
    if (m.stage === 0) {
      for (const bag of world.bags) {
        if (!bag.taken && Math.hypot(p.x - bag.x, p.y - bag.y) < 58) {
          bag.taken = true;
          m.bagsGot++;
          world.cash += 150;
          world.events.push('cash');
          toast(world, '', `Cash bag collected (${m.bagsGot}/3)`);
        }
      }
      const next = world.bags.find((b) => !b.taken);
      m.marker = next ? { x: next.x, y: next.y } : null;
      m.text = `Collect the cash bags (${m.bagsGot}/3)`;
      if (!next) {
        m.stage = 1;
        m.timer = 150;
        m.text = 'Reach the boat at the marina';
        m.marker = { ...PLACES.boat };
        toast(world, 'Mara Voss', 'All three. Now the boat, marina, north shore. Do not be late.');
      }
    } else if (m.stage === 1 && near(PLACES.boat, 80)) {
      completeMission(world);
    }
  }

  // The Pay 'n Spray: drive in wanted, drive out clean.
  if (p.car && world.wanted > 0 && Math.hypot(p.x - PLACES.garage.x, p.y - PLACES.garage.y) < 78) {
    if (world.cash >= WANTED.resprayCost) {
      world.cash -= WANTED.resprayCost;
      world.wanted = 0;
      p.car.hp = p.car.maxHp;
      world.events.push('respray');
      toast(world, '', "Pay 'n Spray — new paint, no stars, car repaired");
    }
  }
}

// ------------------------------------------------------------------ wanted & spawning

function stepWanted(world, dt) {
  const p = world.player;
  const anyPoliceNear = world.cars.some((c) => c.kind === 'police' && dist(c, p) < 640) || world.cops.some((c) => dist(c, p) < 640);
  if (world.wanted > 0 && !anyPoliceNear && !(world.mission?.index === 3 && world.mission?.stage === 1)) {
    world.unseenT += dt;
    if (world.unseenT >= WANTED.decayAfter) {
      world.wanted--;
      world.unseenT = 0;
    }
  } else {
    world.unseenT = 0;
  }

  // Busted: a cop close to a slow player on foot fills the meter.
  if (!p.car && world.wanted > 0) {
    const speed = Math.hypot(world.input.moveX, world.input.moveY);
    let close = false;
    for (const cop of world.cops) if (dist(cop, p) < 52) close = true;
    for (const car of world.cars) if (car.kind === 'police' && Math.abs(car.speed) < 30 && dist(car, p) < 56) close = true;
    if (close && speed < 0.4) world.bustedMeter += dt / WANTED.bustedTime;
    else world.bustedMeter = Math.max(0, world.bustedMeter - dt * 0.7);
    if (world.bustedMeter >= 1 && world.mode === 'play') {
      world.mode = 'busted';
      world.events.push('busted');
    }
  } else {
    world.bustedMeter = Math.max(0, world.bustedMeter - dt * 0.7);
  }
}

function roadPointNear(world, x, y) {
  // Snap to the nearest intersection so police arrive on a road.
  let bx = V_ROADS[0];
  let by = H_ROADS[0];
  let bd = Infinity;
  for (const vx of V_ROADS) for (const hy of H_ROADS) {
    const d = Math.hypot(vx - x, hy - y);
    if (d < bd) { bd = d; bx = vx; by = hy; }
  }
  return { x: bx, y: by };
}

function stepSpawning(world) {
  const p = world.player;
  const policeCars = world.cars.filter((c) => c.kind === 'police');
  const wantCars = world.wanted === 0 ? 0 : Math.min(1 + world.wanted, 6);
  if (policeCars.length < wantCars && world.policeSpawnCd <= 0) {
    const a = world.rng.range(0, TAU);
    const at = roadPointNear(world, p.x + Math.cos(a) * 780, p.y + Math.sin(a) * 780);
    const car = makeCar('police', 'police', at.x, at.y, world.rng.range(0, TAU), '#2c3e50');
    world.cars.push(car);
    world.policeSpawnCd = 2.2;
  }
  // Retire police that have fallen far behind when the heat drops.
  if (policeCars.length > wantCars) {
    const far = policeCars.find((c) => dist(c, p) > 900);
    if (far) far.dead = true;
  }
  const wantCops = world.wanted >= 3 ? Math.min(world.wanted - 1, 4) : 0;
  if (world.cops.length < wantCops && world.policeSpawnCd <= 0) {
    const a = world.rng.range(0, TAU);
    const cop = {
      id: nextId++, x: p.x + Math.cos(a) * 430, y: p.y + Math.sin(a) * 430,
      angle: 0, hp: 75, shootCd: 1, dead: false,
    };
    resolveCircle(world.city, cop, 14);
    world.cops.push(cop);
    world.policeSpawnCd = 2.2;
  }
  if (world.cops.length > wantCops) {
    const far = world.cops.find((c) => dist(c, p) > 800);
    if (far) far.dead = true;
  }
}
