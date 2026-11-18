// Palm City Heat's rules and state, with no drawing and no browser in it: the
// player on foot and by car, traffic and pedestrians, police and the wanted level,
// shooting, pickups, and Mara Voss's five-mission story. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react (sound,
// toasts, saves) without the world knowing about screens or speakers. The city and
// every spawn come from the seeded random, so the same seed always builds the
// same city and the same screenshot scenes.
import {
  BEACH, CAR, MISSIONS, PISTOL, PLAYER, POLICE, PARKED, PEDS, ROADS_H, ROADS_V, ROAD_W,
  STEP, TRAFFIC, WANTED, WORLD,
} from './config.js';
import { createCity } from './city.js';

export const EVENT_SHOT = 1;
export const EVENT_HIT = 2;
export const EVENT_PICKUP = 4;
export const EVENT_CRASH = 8;
export const EVENT_WANTED = 16;
export const EVENT_MISSION = 32;
export const EVENT_MISSION_DONE = 64;
export const EVENT_WASTED = 128;
export const EVENT_BUSTED = 256;
export const EVENT_STORY = 512;
export const EVENT_FAIL = 1024;

const TAU = Math.PI * 2;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

const CAR_COLORS = ['#d84a4a', '#4a7ad8', '#e8e8e0', '#3aa87a', '#e8a83a', '#8a5ad8', '#d8d8c8', '#3a3a44', '#c86a8a'];
const TAXI_COLOR = '#f2c230';

export function createWorld(random) {
  const city = createCity(random);

  const player = {
    x: 0, y: 0, angle: 0, vx: 0, vy: 0,
    hp: PLAYER.health, armour: 0, inCar: null,
    fireTimer: 0, reloadTimer: 0, ammo: PISTOL.magSize,
    sprinting: false, moving: false,
  };

  const cars = [];
  const peds = [];
  const cops = [];
  const bullets = [];
  const particles = [];
  const pickups = [];
  const crates = [];
  const bags = [];

  const state = {
    time: 0, cash: 0, wanted: 0, wantedTimer: 0, bustMeter: 0,
    missionIndex: 0, missionObj: 0, missionTimer: null, missionActive: false,
    missionDelay: 0, storyComplete: false, over: null,
    shake: 0, toast: '', toastUntil: 0,
    stats: { missions: 0, stolen: 0, pedsDown: 0, shots: 0, crashes: 0 },
    passenger: false,
  };

  let carId = 0;

  function toast(text, seconds) {
    state.toast = text;
    state.toastUntil = state.time + (seconds ?? 4);
  }

  function addParticles(x, y, n, color, speed, life, size) {
    for (let i = 0; i < n; i += 1) {
      if (particles.length > 240) return;
      const a = random() * TAU;
      const s = speed * (0.4 + random() * 0.8);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + random() * 0.7), maxLife: life, color, size: size * (0.7 + random() * 0.6) });
    }
  }

  function makeCar(x, y, angle, kind, driver) {
    const car = {
      id: carId += 1, x, y, angle, vx: 0, vy: 0, speed: 0,
      kind, color: kind === 'taxi' ? TAXI_COLOR : CAR_COLORS[Math.floor(random() * CAR_COLORS.length)],
      health: CAR.health, driver, wrecked: false, target: false, hitCd: 0,
      axis: 'v', line: ROADS_V[0], dir: 1, cruise: TRAFFIC.speed + random() * TRAFFIC.speedJitter,
      aiState: 'drive', aiTimer: 0, lastTurnRoad: -1, siren: random() * TAU,
    };
    cars.push(car);
    return car;
  }

  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const p = city.roadPoint();
      const vertical = random() < 0.5;
      const car = makeCar(p.x, p.y, vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI), random() < 0.12 ? 'taxi' : 'sedan', 'traffic');
      if (vertical) {
        car.axis = 'v';
        car.line = ROADS_V.reduce((best, rx) => (Math.abs(rx - p.x) < Math.abs(best - p.x) ? rx : best), ROADS_V[0]);
        car.dir = car.angle > 0 ? 1 : -1;
      } else {
        car.axis = 'h';
        car.line = ROADS_H.reduce((best, ry) => (Math.abs(ry - p.y) < Math.abs(best - p.y) ? ry : best), ROADS_H[0]);
        car.dir = car.angle === 0 ? 1 : -1;
      }
      car.speed = car.cruise * (0.5 + random() * 0.5);
    }
  }

  function spawnParked() {
    for (let i = 0; i < PARKED.count; i += 1) {
      const p = city.sidewalkPoint();
      const car = makeCar(p.x, p.y, random() * TAU, random() < 0.2 ? 'sport' : 'sedan', 'parked');
      car.speed = 0;
    }
    // The gold Comet GT for mission 2, parked at Coral Row.
    const gt = makeCar(city.zones.sportsCar.x, city.zones.sportsCar.y, Math.PI / 2, 'sport', 'parked');
    gt.color = '#e8c832';
    gt.target = true;
  }

  function spawnPed(x, y) {
    const p = x === undefined ? city.sidewalkPoint() : { x, y };
    const ped = {
      x: p.x, y: p.y, angle: random() * TAU, speed: 0,
      state: 'walk', stateTimer: 0, color: '#4a7ab8', down: 0, fade: 0,
      walkAxis: random() < 0.5 ? 'v' : 'h', walkDir: random() < 0.5 ? 1 : -1,
      bob: random() * TAU,
    };
    ped.color = ['#4a7ab8', '#b84a7a', '#4ab87a', '#b8a04a', '#7a4ab8', '#c86a3a'][Math.floor(random() * 6)];
    peds.push(ped);
    return ped;
  }

  function spawnPickups() {
    const kinds = [
      ['cash', 8], ['health', 4], ['armour', 2], ['ammo', 4], ['star', 2],
    ];
    for (const [kind, n] of kinds) {
      for (let i = 0; i < n; i += 1) {
        const p = city.sidewalkPoint();
        pickups.push({ kind, x: p.x, y: p.y, amount: kind === 'cash' ? 25 + Math.floor(random() * 36) : 0, respawn: 0, bob: random() * TAU });
      }
    }
  }

  function setupMissionObjects() {
    crates.length = 0;
    bags.length = 0;
    for (const c of city.zones.depotCrates) crates.push({ x: c.x, y: c.y, hp: 30, dead: false });
    for (const b of city.zones.cashBags) bags.push({ x: b.x, y: b.y, taken: false });
  }

  function reset() {
    cars.length = 0;
    peds.length = 0;
    cops.length = 0;
    bullets.length = 0;
    particles.length = 0;
    pickups.length = 0;
    carId = 0;
    player.x = city.zones.spawn.x;
    player.y = city.zones.spawn.y;
    player.angle = -Math.PI / 2;
    player.vx = 0;
    player.vy = 0;
    player.hp = PLAYER.health;
    player.armour = 0;
    player.inCar = null;
    player.ammo = PISTOL.magSize;
    player.fireTimer = 0;
    player.reloadTimer = 0;
    state.time = 0;
    state.cash = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.bustMeter = 0;
    state.missionIndex = 0;
    state.missionObj = 0;
    state.missionTimer = null;
    state.missionActive = false;
    state.missionDelay = 1.2;
    state.storyComplete = false;
    state.over = null;
    state.shake = 0;
    state.passenger = false;
    state.stats = { missions: 0, stolen: 0, pedsDown: 0, shots: 0, crashes: 0 };
    spawnTraffic();
    spawnParked();
    for (let i = 0; i < PEDS.count; i += 1) spawnPed();
    spawnPickups();
    setupMissionObjects();
    toast('Welcome to Palm City', 3);
  }

  /** Load a save (cash, mission, story flag) onto a fresh world. */
  function applySave(save) {
    if (!save) return;
    state.cash = save.cash || 0;
    state.missionIndex = save.missionIndex || 0;
    state.storyComplete = !!save.storyComplete;
    if (state.storyComplete) state.missionIndex = MISSIONS.length;
  }

  function saveData() {
    return { cash: state.cash, missionIndex: Math.min(state.missionIndex, MISSIONS.length - 1), storyComplete: state.storyComplete };
  }

  function playerPos() {
    if (player.inCar) return { x: player.inCar.x, y: player.inCar.y };
    return { x: player.x, y: player.y };
  }

  function playerSpeed() {
    if (player.inCar) return Math.hypot(player.inCar.vx, player.inCar.vy);
    return Math.hypot(player.vx, player.vy);
  }

  function addWanted(n) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, WANTED.max);
    state.wantedTimer = 0;
    if (state.wanted > before) return EVENT_WANTED;
    return 0;
  }

  function currentObjective() {
    if (!state.missionActive || state.missionIndex >= MISSIONS.length) return null;
    const m = MISSIONS[state.missionIndex];
    return m.objectives[state.missionObj] ?? null;
  }

  function startMission(index) {
    if (index >= MISSIONS.length) {
      state.storyComplete = true;
      state.missionActive = false;
      return EVENT_STORY;
    }
    state.missionIndex = index;
    state.missionObj = 0;
    state.missionTimer = MISSIONS[index].timer ?? null;
    state.missionActive = true;
    state.passenger = false;
    toast(MISSIONS[index].briefing, 6);
    return EVENT_MISSION;
  }

  function completeObjective() {
    const m = MISSIONS[state.missionIndex];
    state.missionObj += 1;
    if (state.missionObj >= m.objectives.length) {
      state.cash += m.reward;
      state.stats.missions += 1;
      state.missionActive = false;
      toast(`Mission complete: ${m.name} — $${m.reward}`, 4);
      state.missionDelay = 2.5;
      return EVENT_MISSION_DONE;
    }
    return EVENT_MISSION;
  }

  function failMission() {
    toast('Mara Voss: Too slow. Run it again.', 4);
    state.missionObj = 0;
    state.missionTimer = MISSIONS[state.missionIndex].timer ?? null;
    state.passenger = false;
    return EVENT_FAIL;
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.wrecked || car.driver === 'police') continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    if (!car) return 0;
    let events = 0;
    if (car.driver === 'traffic') {
      // Steal it: the driver bails out and runs, and the law notices.
      car.driver = 'player';
      state.stats.stolen += 1;
      spawnPed(car.x + 40, car.y + 30).state = 'flee';
      const last = peds[peds.length - 1];
      last.stateTimer = 3;
      events |= addWanted(1);
      toast('Car stolen — wanted level up', 3);
    } else {
      car.driver = 'player';
    }
    player.inCar = car;
    player.x = car.x;
    player.y = car.y;
    return events;
  }

  function exitCar() {
    const car = player.inCar;
    if (!car) return;
    car.driver = 'parked';
    car.speed = 0;
    player.inCar = null;
    const a = car.angle + Math.PI / 2;
    player.x = car.x + Math.cos(a) * 44;
    player.y = car.y + Math.sin(a) * 44;
    const hit = city.circleHitsBuilding(player.x, player.y, PLAYER.radius + 2);
    if (hit) {
      player.x = car.x - Math.cos(a) * 44;
      player.y = car.y - Math.sin(a) * 44;
    }
    player.vx = 0;
    player.vy = 0;
  }

  function damagePlayer(amount) {
    let rest = amount;
    if (player.armour > 0) {
      const absorbed = Math.min(player.armour, rest);
      player.armour -= absorbed;
      rest -= absorbed;
    }
    player.hp -= rest;
    if (player.hp <= 0) {
      player.hp = 0;
      state.over = 'wasted';
      return EVENT_WASTED;
    }
    return EVENT_HIT;
  }

  function damageCar(car, amount, fromX, fromY) {
    car.health -= amount;
    addParticles(car.x, car.y, 4, '#ffb84a', 120, 0.4, 3);
    if (car.health <= 0 && !car.wrecked) {
      car.wrecked = true;
      car.speed = 0;
      addParticles(car.x, car.y, 18, '#666666', 160, 1.1, 5);
      if (car.driver === 'player') {
        toast('Your car is wrecked', 3);
        exitCar();
      }
      if (car.driver === 'police') addWanted(0);
    }
    return 0;
  }

  function shoot(fromX, fromY, angle, from, damage) {
    bullets.push({
      x: fromX + Math.cos(angle) * 22, y: fromY + Math.sin(angle) * 22,
      vx: Math.cos(angle) * PISTOL.bulletSpeed, vy: Math.sin(angle) * PISTOL.bulletSpeed,
      life: PISTOL.range / PISTOL.bulletSpeed, from, damage,
    });
    addParticles(fromX + Math.cos(angle) * 26, fromY + Math.sin(angle) * 26, 3, '#ffd94a', 90, 0.12, 3);
    // Gunfire scares nearby pedestrians into fleeing.
    for (const ped of peds) {
      if (ped.state !== 'flee' && ped.down <= 0 && Math.hypot(ped.x - fromX, ped.y - fromY) < PEDS.scareRadius) {
        ped.state = 'flee';
        ped.stateTimer = 2 + random() * 2;
      }
    }
  }

  function spawnPoliceCar() {
    // On a road near the player, but not on top of them.
    for (let tries = 0; tries < 12; tries += 1) {
      const a = random() * TAU;
      const d = 520 + random() * 320;
      const pp = playerPos();
      const p = { x: pp.x + Math.cos(a) * d, y: pp.y + Math.sin(a) * d };
      if (p.x < 60 || p.x > WORLD.width - 60 || p.y < 60 || p.y > WORLD.height - 60) continue;
      // Snap to the nearest road.
      let best = null;
      let bestD = 1e9;
      for (const rx of ROADS_V) {
        const dd = Math.abs(rx - p.x);
        if (dd < bestD) { bestD = dd; best = { x: rx, y: p.y, angle: p.y < pp.y ? Math.PI / 2 : -Math.PI / 2 }; }
      }
      for (const ry of ROADS_H) {
        const dd = Math.abs(ry - p.y);
        if (dd < bestD) { bestD = dd; best = { x: p.x, y: ry, angle: p.x < pp.x ? 0 : Math.PI }; }
      }
      const car = makeCar(best.x, best.y, best.angle, 'police', 'police');
      car.color = POLICE.police;
      car.cruise = POLICE.carSpeed;
      car.speed = 200;
      return car;
    }
    return null;
  }

  function spawnFootCop() {
    const pp = playerPos();
    const a = random() * TAU;
    const cop = {
      x: clamp(pp.x + Math.cos(a) * 420, 60, WORLD.width - 60),
      y: clamp(pp.y + Math.sin(a) * 420, 60, WORLD.height - 60),
      angle: 0, hp: 100, shootTimer: 1 + random(), down: 0, fade: 0,
    };
    cops.push(cop);
    return cop;
  }

  function updatePolice(dt) {
    const pp = playerPos();
    const wantCars = state.wanted === 0 ? 0 : Math.min(1 + state.wanted - 1, POLICE.maxCars);
    let active = 0;
    for (const car of cars) if (car.driver === 'police' && !car.wrecked) active += 1;
    if (active < wantCars && state.wanted > 0) spawnPoliceCar();
    // Wanted decays only when no police car is anywhere near.
    let near = false;
    for (const car of cars) {
      if (car.driver !== 'police' || car.wrecked) continue;
      if (dist(car.x, car.y, pp.x, pp.y) < WANTED.decayRange) near = true;
    }
    if (state.wanted > 0 && !near && state.missionIndex !== 3) {
      state.wantedTimer += dt;
      if (state.wantedTimer >= WANTED.decaySeconds) {
        state.wanted -= 1;
        state.wantedTimer = 0;
        toast('Heat is cooling off', 2);
      }
    } else {
      state.wantedTimer = 0;
    }
    // Mission 4, second leg: the heat stays at 2 while driving the driver.
    if (state.missionActive && state.missionIndex === 3 && state.missionObj === 1) {
      if (state.wanted < 2) state.wanted = 2;
    }
    // Foot cops at 3+ stars.
    if (state.wanted >= 3) {
      let alive = 0;
      for (const c of cops) if (c.down === 0) alive += 1;
      if (alive < 2) spawnFootCop();
    }
  }

  function updateTrafficCar(car, dt) {
    if (car.wrecked) return;
    if (car.aiState === 'flee') {
      car.aiTimer -= dt;
      if (car.aiTimer <= 0) car.aiState = 'drive';
    } else if (car.aiState === 'stopped') {
      car.aiTimer -= dt;
      car.speed = Math.max(0, car.speed - 400 * dt);
      if (car.aiTimer <= 0) car.aiState = 'drive';
      return;
    }
    // Lane + heading for the road it is on.
    let desired;
    let lanePos;
    if (car.axis === 'v') {
      lanePos = car.line - car.dir * 28;
      desired = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      lanePos = car.line + car.dir * 28;
      desired = car.dir > 0 ? 0 : Math.PI;
    }
    // At an intersection, sometimes turn.
    const cross = car.axis === 'v' ? ROADS_H : ROADS_V;
    const along = car.axis === 'v' ? car.y : car.x;
    for (const c of cross) {
      if (Math.abs(along - c) < 34 && car.lastTurnRoad !== c) {
        car.lastTurnRoad = c;
        if (random() < 0.32) {
          if (car.axis === 'v') {
            car.axis = 'h';
            car.line = c;
            car.dir = random() < 0.5 ? 1 : -1;
          } else {
            car.axis = 'v';
            car.line = c;
            car.dir = random() < 0.5 ? 1 : -1;
          }
        }
        break;
      }
    }
    if (Math.abs(along - car.lastTurnRoad) > 120) car.lastTurnRoad = -1;

    // Stop for whatever is ahead.
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    let blocked = false;
    for (const other of cars) {
      if (other === car || other.wrecked) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 78 && d > 1 && (dx * fx + dy * fy) / d > 0.72) { blocked = true; break; }
    }
    if (!blocked) {
      for (const ped of peds) {
        if (ped.down > 0) continue;
        const dx = ped.x - car.x;
        const dy = ped.y - car.y;
        const d = Math.hypot(dx, dy);
        if (d < 70 && d > 1 && (dx * fx + dy * fy) / d > 0.72) { blocked = true; break; }
      }
    }
    const target = blocked ? 0 : car.cruise * (car.aiState === 'flee' ? 1.5 : 1);
    const accel = target > car.speed ? 220 : 420;
    car.speed += clamp(target - car.speed, -accel * dt, accel * dt);
    const diff = wrapAngle(desired - car.angle);
    car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
    // Ease onto the lane.
    if (car.axis === 'v') car.x += (lanePos - car.x) * Math.min(1, 1.6 * dt);
    else car.y += (lanePos - car.y) * Math.min(1, 1.6 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    // At the edge of the city, turn around instead of piling up.
    if (car.axis === 'v' && (car.y <= 60 || car.y >= WORLD.height - 60)) car.dir *= -1;
    if (car.axis === 'h' && (car.x <= 60 || car.x >= WORLD.width - 60)) car.dir *= -1;
    // Never drive onto the beach or into the water: turn around at the sand.
    if (car.axis === 'h' && car.x >= BEACH.sandX - 70) car.dir = -1;
    // Stay inside the world.
    car.x = clamp(car.x, 40, WORLD.width - 40);
    car.y = clamp(car.y, 40, WORLD.height - 40);
  }

  function updatePoliceCar(car, dt) {
    if (car.wrecked) return;
    const pp = playerPos();
    if (state.wanted === 0) {
      // Drive away and despawn.
      car.speed = Math.max(0, car.speed - 200 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (dist(car.x, car.y, pp.x, pp.y) > 1100) car.driver = 'gone';
      return;
    }
    const dx = pp.x - car.x;
    const dy = pp.y - car.y;
    const d = Math.hypot(dx, dy);
    const desired = Math.atan2(dy, dx);
    const diff = wrapAngle(desired - car.angle);
    car.angle += clamp(diff, -3.1 * dt, 3.1 * dt);
    const close = d < 130;
    const target = close && !player.inCar ? 70 : POLICE.carSpeed;
    car.speed += clamp(target - car.speed, -500 * dt, 420 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    car.siren += dt * 6;
    // Ram the player's car (throttled: a ram is one hit, not one per step).
    if (player.inCar && d < 46 && player.inCar.hitCd <= 0) {
      const rel = Math.hypot(car.vx - player.inCar.vx, car.vy - player.inCar.vy);
      if (rel > 120) {
        damageCar(player.inCar, 5, car.x, car.y);
        player.inCar.hitCd = 0.6;
        state.shake = Math.max(state.shake, 7);
        addParticles(player.inCar.x, player.inCar.y, 8, '#ffb84a', 140, 0.5, 4);
      }
    }
    car.x = clamp(car.x, 40, WORLD.width - 40);
    car.y = clamp(car.y, 40, WORLD.height - 40);
    // Police cars can chase onto the sand, never into the water.
    if (car.x > BEACH.waterX - 40) car.x = BEACH.waterX - 40;
  }

  function updatePlayer(dt, input) {
    player.fireTimer = Math.max(0, player.fireTimer - dt);
    player.reloadTimer = Math.max(0, player.reloadTimer - dt);
    if (player.inCar) {
      const car = player.inCar;
      const fwdX = Math.cos(car.angle);
      const fwdY = Math.sin(car.angle);
      const speed = car.vx * fwdX + car.vy * fwdY;
      const maxSpeed = car.kind === 'sport' ? CAR.sportMaxSpeed : CAR.maxSpeed;
      let accel = 0;
      if (input.my < 0) accel = CAR.accel;
      else if (input.my > 0) accel = speed > 0 ? -CAR.brake : -CAR.accel * 0.55;
      car.vx += fwdX * accel * dt;
      car.vy += fwdY * accel * dt;
      // Steering follows speed; handbrake loosens the grip so the car slides.
      const steer = input.mx * CAR.steerRate * clamp(Math.abs(speed) / 220, 0, 1) * (speed >= 0 ? 1 : -1);
      car.angle += steer * dt;
      // Re-split velocity into forward/lateral and damp the lateral part.
      const nx = Math.cos(car.angle);
      const ny = Math.sin(car.angle);
      const fSpeed = car.vx * nx + car.vy * ny;
      let lx = car.vx - nx * fSpeed;
      let ly = car.vy - ny * fSpeed;
      const grip = input.handbrake ? 1.4 : 7;
      const damp = Math.exp(-grip * dt);
      lx *= damp;
      ly *= damp;
      let nfSpeed = fSpeed;
      if (input.handbrake) nfSpeed *= Math.exp(-1.6 * dt);
      if (nfSpeed > maxSpeed) nfSpeed = maxSpeed;
      if (nfSpeed < -CAR.reverseMax) nfSpeed = -CAR.reverseMax;
      car.vx = nx * nfSpeed + lx;
      car.vy = ny * nfSpeed + ly;
      car.speed = nfSpeed;
      if (input.handbrake && Math.abs(nfSpeed) > 180 && random() < 0.6) {
        addParticles(car.x - nx * 26, car.y - ny * 26, 1, '#cfc8b8', 30, 0.7, 5);
      }
      const before = { x: car.x, y: car.y };
      car.x += car.vx * dt;
      car.y += car.vy * dt;
      car.x = clamp(car.x, 40, WORLD.width - 40);
      car.y = clamp(car.y, 40, WORLD.height - 40);
      const hit = city.resolveCircle(car, 30);
      if (hit) {
        const impact = Math.hypot(car.vx, car.vy);
        if (impact > 220 && car.hitCd <= 0) {
          damageCar(car, (impact - 220) / 14, before.x, before.y);
          car.hitCd = 0.6;
          state.shake = Math.max(state.shake, Math.min(12, impact / 40));
          state.stats.crashes += 1;
          addParticles(car.x, car.y, 10, '#ffb84a', 160, 0.5, 4);
        }
        car.vx *= -0.3;
        car.vy *= -0.3;
      }
      if (city.inWater(car.x)) {
        car.x = before.x;
        car.y = before.y;
        car.vx *= -0.4;
        car.vy *= -0.4;
      }
      // Pay 'n Spray: drive in with heat, pay up, walk out clean.
      const g = city.zones.garage;
      if (state.wanted > 0 && state.cash >= WANTED.sprayCost && car.x > g.x - g.w / 2 && car.x < g.x + g.w / 2 && car.y > g.y - g.h / 2 && car.y < g.y + g.h / 2) {
        state.cash -= WANTED.sprayCost;
        state.wanted = 0;
        car.health = CAR.health;
        toast(`Pay 'n Spray: heat cleared, car fixed (-$${WANTED.sprayCost})`, 4);
      }
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      if (input.enterPressed) exitCar();
      return 0;
    }

    // On foot.
    const speed = PLAYER.walkSpeed * (input.sprint ? PLAYER.sprintMul : 1);
    const mag = Math.hypot(input.mx, input.my);
    player.moving = mag > 0.1;
    let vx = 0;
    let vy = 0;
    if (mag > 0.1) {
      vx = (input.mx / Math.max(1, mag)) * speed;
      vy = (input.my / Math.max(1, mag)) * speed;
    }
    player.vx = vx;
    player.vy = vy;
    player.x += vx * dt;
    player.y += vy * dt;
    player.x = clamp(player.x, 24, WORLD.width - 24);
    player.y = clamp(player.y, 24, WORLD.height - 24);
    city.resolveCircle(player, PLAYER.radius);
    if (city.inWater(player.x)) player.x = BEACH.waterX - PLAYER.radius - 1;
    if (input.aimX !== undefined) player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);

    if (input.enterPressed) {
      const car = nearestCar(player.x, player.y, 85);
      if (car) return enterCar(car);
    }
    if (input.reloadPressed && player.ammo < PISTOL.magSize && player.reloadTimer === 0) {
      player.reloadTimer = PISTOL.reloadTime;
    }
    if (player.reloadTimer > 0 && player.reloadTimer <= dt) player.ammo = PISTOL.magSize;
    if (input.fire && player.fireTimer === 0 && player.reloadTimer === 0 && player.ammo > 0) {
      player.ammo -= 1;
      player.fireTimer = PISTOL.fireInterval;
      state.stats.shots += 1;
      state.shake = Math.max(state.shake, 2.5);
      shoot(player.x, player.y, player.angle, 'player', PISTOL.damage);
      // Gunfire near pedestrians or police draws heat.
      let seen = false;
      for (const ped of peds) {
        if (ped.down === 0 && dist(ped.x, ped.y, player.x, player.y) < 320) { seen = true; break; }
      }
      if (!seen) {
        for (const car of cars) {
          if (car.driver === 'police' && dist(car.x, car.y, player.x, player.y) < 500) { seen = true; break; }
        }
      }
      let events = EVENT_SHOT;
      if (seen && state.wanted < 2) events |= addWanted(1);
      return events;
    }
    return 0;
  }

  function updatePeds(dt) {
    const pp = playerPos();
    for (const ped of peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        ped.fade = Math.max(0, ped.fade - dt * 0.4);
        if (ped.down <= 0) {
          // Get back up elsewhere in the city.
          const p = city.sidewalkPoint();
          ped.x = p.x;
          ped.y = p.y;
          ped.state = 'walk';
          ped.fade = 0;
        }
        continue;
      }
      ped.bob += dt * 8;
      if (ped.state === 'flee') {
        ped.stateTimer -= dt;
        const a = Math.atan2(ped.y - pp.y, ped.x - pp.x);
        ped.x += Math.cos(a) * PEDS.fleeSpeed * dt;
        ped.y += Math.sin(a) * PEDS.fleeSpeed * dt;
        ped.angle = a;
        if (ped.stateTimer <= 0) ped.state = 'walk';
      } else {
        // Stroll along a sidewalk, turning at intersections sometimes.
        ped.stateTimer -= dt;
        const dx = ped.walkAxis === 'v' ? 0 : ped.walkDir;
        const dy = ped.walkAxis === 'v' ? ped.walkDir : 0;
        ped.x += dx * PEDS.walkSpeed * dt;
        ped.y += dy * PEDS.walkSpeed * dt;
        ped.angle = Math.atan2(dy, dx);
        if (ped.stateTimer <= 0) {
          ped.stateTimer = 2 + random() * 4;
          if (random() < 0.3) {
            ped.walkAxis = ped.walkAxis === 'v' ? 'h' : 'v';
            ped.walkDir = random() < 0.5 ? 1 : -1;
          } else if (random() < 0.3) {
            ped.walkDir *= -1;
          }
        }
        if (ped.x < 50 || ped.x > BEACH.sandX - 30 || ped.y < 50 || ped.y > WORLD.height - 50) {
          ped.walkDir *= -1;
          ped.x = clamp(ped.x, 60, BEACH.sandX - 40);
          ped.y = clamp(ped.y, 60, WORLD.height - 60);
        }
      }
      city.resolveCircle(ped, 12);
      if (city.inWater(ped.x)) ped.x = BEACH.waterX - 13;
    }
  }

  function updateCops(dt) {
    const pp = playerPos();
    for (const cop of cops) {
      if (cop.down > 0) {
        cop.down -= dt;
        cop.fade = Math.max(0, cop.fade - dt * 0.4);
        if (cop.down <= 0) {
          const p = city.roadPoint();
          cop.x = p.x;
          cop.y = p.y;
          cop.hp = 100;
          cop.fade = 0;
        }
        continue;
      }
      const d = dist(cop.x, cop.y, pp.x, pp.y);
      const a = Math.atan2(pp.y - cop.y, pp.x - cop.x);
      cop.angle = a;
      if (d > 90) {
        cop.x += Math.cos(a) * 150 * dt;
        cop.y += Math.sin(a) * 150 * dt;
      }
      cop.shootTimer -= dt;
      if (cop.shootTimer <= 0 && d < POLICE.shootRange) {
        cop.shootTimer = POLICE.shootInterval;
        const spread = (random() - 0.5) * 0.22;
        shoot(cop.x, cop.y, a + spread, 'cop', 8);
      }
      city.resolveCircle(cop, 12);
    }
  }

  function updateBullets(dt) {
    let events = 0;
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.x > WORLD.width || b.y < 0 || b.y > WORLD.height;
      if (!dead && city.circleHitsBuilding(b.x, b.y, 2)) {
        addParticles(b.x, b.y, 4, '#ffe08a', 120, 0.3, 3);
        dead = true;
      }
      if (!dead && b.from === 'player') {
        for (const car of cars) {
          if (car.wrecked) continue;
          if (dist(b.x, b.y, car.x, car.y) < 34) {
            damageCar(car, b.damage, b.x, b.y);
            if (car.driver === 'police') events |= addWanted(1);
            else if (car.driver === 'traffic') {
              car.aiState = 'flee';
              car.aiTimer = 3;
              events |= addWanted(1);
            }
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const crate of crates) {
            if (!crate.dead && dist(b.x, b.y, crate.x, crate.y) < 26) {
              crate.hp -= b.damage;
              addParticles(crate.x, crate.y, 6, '#c89048', 140, 0.4, 4);
              if (crate.hp <= 0) {
                crate.dead = true;
                addParticles(crate.x, crate.y, 16, '#c89048', 200, 0.8, 5);
              }
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (const ped of peds) {
            if (ped.down > 0) continue;
            if (dist(b.x, b.y, ped.x, ped.y) < 16) {
              ped.down = 3;
              ped.fade = 1;
              state.stats.pedsDown += 1;
              events |= addWanted(1);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (const cop of cops) {
            if (cop.down > 0) continue;
            if (dist(b.x, b.y, cop.x, cop.y) < 16) {
              cop.hp -= b.damage;
              addParticles(cop.x, cop.y, 5, '#ff5a4a', 130, 0.35, 3);
              if (cop.hp <= 0) {
                cop.down = 3;
                cop.fade = 1;
              }
              events |= addWanted(1);
              dead = true;
              break;
            }
          }
        }
      }
      if (!dead && b.from === 'cop') {
        const pp = playerPos();
        if (player.inCar) {
          if (dist(b.x, b.y, pp.x, pp.y) < 34) {
            damageCar(player.inCar, b.damage, b.x, b.y);
            dead = true;
          }
        } else if (dist(b.x, b.y, pp.x, pp.y) < 16) {
          events |= damagePlayer(b.damage);
          addParticles(b.x, b.y, 5, '#ff5a4a', 130, 0.35, 3);
          dead = true;
        }
      }
      if (dead) bullets.splice(i, 1);
    }
    return events;
  }

  function updatePickups(dt) {
    const pp = playerPos();
    let events = 0;
    for (const p of pickups) {
      p.bob += dt * 3;
      if (p.respawn > 0) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          const np = city.sidewalkPoint();
          p.x = np.x;
          p.y = np.y;
        }
        continue;
      }
      if (dist(p.x, p.y, pp.x, pp.y) < 32) {
        if (p.kind === 'cash') {
          state.cash += p.amount;
          toast(`+$${p.amount}`, 1.5);
        } else if (p.kind === 'health') {
          player.hp = Math.min(PLAYER.health, player.hp + 30);
        } else if (p.kind === 'armour') {
          player.armour = Math.min(PLAYER.armourMax, player.armour + 50);
        } else if (p.kind === 'ammo') {
          player.ammo = PISTOL.magSize;
        } else if (p.kind === 'star') {
          if (state.wanted > 0) {
            state.wanted -= 1;
            toast('Bribe paid — one star gone', 3);
          } else {
            state.cash += 50;
          }
        }
        p.respawn = p.kind === 'cash' ? 25 : 40;
        events |= EVENT_PICKUP;
      }
    }
    return events;
  }

  function updateMissions(dt) {
    let events = 0;
    if (!state.missionActive && !state.storyComplete && state.missionIndex < MISSIONS.length) {
      state.missionDelay -= dt;
      if (state.missionDelay <= 0) events |= startMission(state.missionIndex);
    }
    if (!state.missionActive) return events;
    const obj = currentObjective();
    if (!obj) return events;
    if (state.missionTimer !== null) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) {
        events |= failMission();
        return events;
      }
    }
    const pp = playerPos();
    if (obj.kind === 'goto' || obj.kind === 'pickup') {
      if (dist(pp.x, pp.y, obj.x, obj.y) < obj.r) {
        if (state.missionIndex === 3 && state.missionObj === 0) {
          state.passenger = true;
          toast("Driver's in. Go — marina, now.", 3);
        }
        events |= completeObjective();
      }
    } else if (obj.kind === 'steal') {
      if (player.inCar && player.inCar.target) events |= completeObjective();
    } else if (obj.kind === 'shoot') {
      const left = crates.filter((c) => !c.dead).length;
      if (left === 0) events |= completeObjective();
    } else if (obj.kind === 'collect') {
      for (const bag of bags) {
        if (!bag.taken && dist(pp.x, pp.y, bag.x, bag.y) < 42) {
          bag.taken = true;
          state.cash += 100;
          addParticles(bag.x, bag.y, 10, '#37c978', 140, 0.6, 4);
          events |= EVENT_PICKUP;
        }
      }
      const got = bags.filter((b) => b.taken).length;
      if (got >= obj.count) events |= completeObjective();
    }
    return events;
  }

  function updateBusted(dt) {
    if (state.over || player.inCar) {
      state.bustMeter = 0;
      return 0;
    }
    const pp = playerPos();
    const speed = playerSpeed();
    let close = false;
    for (const car of cars) {
      if (car.driver === 'police' && !car.wrecked && dist(car.x, car.y, pp.x, pp.y) < POLICE.bustRange && Math.hypot(car.vx, car.vy) < 90) { close = true; break; }
    }
    if (!close) {
      for (const cop of cops) {
        if (cop.down === 0 && dist(cop.x, cop.y, pp.x, pp.y) < POLICE.bustRange) { close = true; break; }
      }
    }
    if (close && speed < 50) {
      state.bustMeter += dt;
      if (state.bustMeter >= POLICE.bustTime) {
        state.over = 'busted';
        return EVENT_BUSTED;
      }
    } else {
      state.bustMeter = Math.max(0, state.bustMeter - dt * 2);
    }
    return 0;
  }

  function collideCars(dt) {
    // Player car vs traffic/police cars, and traffic cars vs each other.
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.wrecked || a.driver === 'gone') continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.wrecked || b.driver === 'gone') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= 56 || d < 0.01) continue;
        const nx = dx / d;
        const ny = dy / d;
        const push = (56 - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        if (rel > 170 && (a.hitCd <= 0 || b.hitCd <= 0)) {
          damageCar(a, (rel - 170) / 22, b.x, b.y);
          damageCar(b, (rel - 170) / 22, a.x, a.y);
          a.hitCd = 0.6;
          b.hitCd = 0.6;
          state.shake = Math.max(state.shake, 5);
          addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#ffb84a', 140, 0.5, 4);
          if (a.driver === 'traffic' || b.driver === 'traffic') {
            const t = a.driver === 'traffic' ? a : b;
            t.aiState = 'flee';
            t.aiTimer = 2.5;
          }
          if (a.driver === 'player' || b.driver === 'player') state.stats.crashes += 1;
        }
        // Exchange a little velocity so they separate instead of sticking.
        const avx = a.vx;
        const avy = a.vy;
        a.vx = a.vx * 0.6 + b.vx * 0.4;
        a.vy = a.vy * 0.6 + b.vy * 0.4;
        b.vx = b.vx * 0.6 + avx * 0.4;
        b.vy = b.vy * 0.6 + avy * 0.4;
      }
    }
    // Cars vs peds on foot: a fast car knocks a pedestrian down.
    for (const car of cars) {
      if (car.wrecked) continue;
      const spd = Math.hypot(car.vx, car.vy);
      if (spd < 140) continue;
      for (const ped of peds) {
        if (ped.down > 0) continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 34) {
          ped.down = 3;
          ped.fade = 1;
          state.stats.pedsDown += 1;
          addParticles(ped.x, ped.y, 8, '#ffffff', 120, 0.5, 3);
          if (car.driver === 'player') addWanted(1);
        }
      }
    }
  }

  function step(dt, input, harmless) {
    let events = 0;
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 22);
    if (state.over) return events;

    if (!harmless) events |= updatePlayer(dt, input);
    for (const car of cars) {
      if (car.hitCd > 0) car.hitCd -= dt;
      if (car.driver === 'traffic') updateTrafficCar(car, dt);
      else if (car.driver === 'police') updatePoliceCar(car, dt);
      else if (car.driver === 'player') {
        // The player's car is driven in updatePlayer; keep its velocity fields honest.
      } else if (car.driver === 'gone') {
        // Despawned police car: leave it off the list on the next sweep.
      }
    }
    // Sweep despawned police cars.
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      if (cars[i].driver === 'gone') cars.splice(i, 1);
    }
    updatePeds(dt);
    updateCops(dt);
    updatePolice(dt);
    events |= updateBullets(dt);
    events |= updatePickups(dt);
    events |= updateMissions(dt);
    events |= updateBusted(dt);
    collideCars(dt);
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-2 * dt);
      p.vy *= Math.exp(-2 * dt);
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (state.over === 'wasted') events |= EVENT_WASTED;
    if (state.over === 'busted') events |= EVENT_BUSTED;
    return events;
  }

  reset();

  return {
    state, player, cars, peds, cops, bullets, particles, pickups, crates, bags, city,
    reset, step, applySave, saveData, playerPos, playerSpeed, currentObjective, startMission,
    addWanted, toast,
  };
}
