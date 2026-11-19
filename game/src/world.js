// Palm City Heat — the simulation. One world object holds the player, the
// cars, the pedestrians, the police, the bullets and Mara Voss's mission
// chain, and step() advances all of it by one fixed tick. The module is
// pure logic: no DOM, no storage, no audio. The browser shell feeds it an
// input object and drains world.fx (sound/event names) each frame, and the
// Node smoke test drives it exactly the same way.

import { createCity } from './city.js';
import {
  BEACH, CAR, MISSIONS, PARKED, PEDS, PICKUPS, PISTOL, PLAYER, POLICE,
  ROADS_H, ROADS_V, SPRAY, TRAFFIC, WORLD, ZONES,
} from './config.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

const CAR_COLORS = ['#d64541', '#3f7fbf', '#e8e4da', '#5aa469', '#7d5ba6', '#e0a32e', '#4fb0ac', '#b8bec6'];
const PED_COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#c8b6ff', '#8ac926', '#ffca3a'];

export function createWorld(random) {
  const city = createCity(random);

  const state = {
    time: 0,
    cash: 0,
    wanted: 0,
    heat: 0,
    bust: 0,
    over: null,
    storyComplete: false,
    storyBanner: 0,
    missionIndex: 0,
    missionActive: false,
    missionObj: 0,
    missionTimer: 0,
    missionWait: 2.5,
    bagsGot: 0,
    shake: 0,
    stats: { shots: 0, hits: 0, stolen: 0, earned: 0, downed: 0 },
  };

  const player = {
    x: ZONES.spawn.x,
    y: ZONES.spawn.y,
    angle: -Math.PI / 2,
    vx: 0,
    vy: 0,
    health: PLAYER.health,
    armour: 0,
    ammo: PISTOL.magSize,
    reserve: PISTOL.startAmmoReserve,
    fireTimer: 0,
    reloadTimer: 0,
    inCar: null,
    walkPhase: 0,
  };

  const cars = [];
  const peds = [];
  const cops = [];
  const bullets = [];
  const particles = [];
  const toasts = [];
  const fx = [];
  let nextId = 1;

  const pickups = PICKUPS.spots.map((s) => ({ kind: s.kind, x: s.x, y: s.y, amount: s.kind === 'cash' ? 40 : 0, respawn: 0, dropped: false, ttl: 0 }));
  const crates = ZONES.crates.map((c) => ({ x: c.x, y: c.y, hp: 30, dead: false }));
  const bags = ZONES.bags.map((b) => ({ x: b.x, y: b.y, got: true, active: false }));

  // ------------------------------------------------------------- entities

  function makeCar(x, y, angle, kind, driver) {
    const car = {
      id: nextId++,
      x, y, angle,
      vx: 0, vy: 0, speed: 0,
      kind,
      color: kind === 'taxi' ? '#f7b731' : kind === 'sport' ? '#e8452c' : random.pick(CAR_COLORS),
      driver,
      health: 100,
      wrecked: false,
      cruise: TRAFFIC.speed + random.range(-TRAFFIC.speedJitter, TRAFFIC.speedJitter),
      axis: 'v', line: 0, dir: 1,
      aiState: 'drive', aiTimer: 0, turnCd: 0,
      hitCd: 0, target: false,
    };
    cars.push(car);
    return car;
  }

  function spawnPed(x, y) {
    const ped = {
      id: nextId++,
      x, y, angle: random.range(0, TAU),
      state: 'walk',
      tx: x, ty: y,
      stateTimer: 0, downTimer: 0,
      color: random.pick(PED_COLORS),
      speedVar: random.range(0.8, 1.2),
      fleeX: 0, fleeY: 0,
    };
    const t = city.sidewalkPointNear(x, y, 700);
    ped.tx = t.x;
    ped.ty = t.y;
    peds.push(ped);
    return ped;
  }

  let comet = null;
  function spawnTrafficAndParked() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const p = city.roadPoint();
      const dir = random.chance(0.5) ? 1 : -1;
      const angle = p.vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      const car = makeCar(p.x, p.y, angle, random.chance(0.14) ? 'taxi' : 'sedan', 'traffic');
      car.axis = p.vertical ? 'v' : 'h';
      car.line = p.line;
      car.dir = dir;
      car.speed = car.cruise * random.range(0.4, 0.9);
    }
    for (let i = 0; i < PARKED.count; i += 1) {
      const p = city.sidewalkPoint();
      makeCar(p.x, p.y, random.range(0, TAU), random.chance(0.18) ? 'sport' : 'sedan', 'parked');
    }
    comet = makeCar(ZONES.comet.x, ZONES.comet.y, Math.PI / 2, 'sport', 'parked');
    comet.color = '#e8b62a';
    comet.target = true;
    for (let i = 0; i < PEDS.count; i += 1) {
      const p = city.sidewalkPoint();
      spawnPed(p.x, p.y);
    }
  }
  spawnTrafficAndParked();

  // ------------------------------------------------------------- helpers

  function toast(text, ttl = 4) {
    toasts.push({ text, ttl, max: ttl });
    if (toasts.length > 3) toasts.shift();
  }

  function spawnParticles(x, y, n, color, speed, life, size) {
    for (let i = 0; i < n; i += 1) {
      const a = random.range(0, TAU);
      const s = random.range(speed * 0.3, speed);
      particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: random.range(life * 0.5, life), maxLife: life,
        color, size: random.range(size * 0.6, size * 1.3),
      });
    }
  }

  function playerPos() {
    return player.inCar ? { x: player.inCar.x, y: player.inCar.y } : { x: player.x, y: player.y };
  }

  function playerSpeed() {
    if (player.inCar) return Math.abs(player.inCar.speed);
    return Math.hypot(player.vx, player.vy);
  }

  function addWanted(n) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, 5);
    if (state.wanted > before) state.heat = 0;
    return state.wanted !== before ? 1 : 0;
  }

  let crimeCd = 0; // shared cooldown so one rampage is one star at a time
  function witnessCrime(x, y, radius = 430) {
    if (crimeCd > 0) return;
    for (const ped of peds) if (ped.state !== 'down' && dist(x, y, ped.x, ped.y) < radius) { addWanted(1); crimeCd = 2.2; return; }
    for (const cop of cops) if (dist(x, y, cop.x, cop.y) < radius + 120) { addWanted(1); crimeCd = 2.2; return; }
    for (const car of cars) if (car.driver === 'police' && dist(x, y, car.x, car.y) < radius + 200) { addWanted(1); crimeCd = 2.2; return; }
  }

  function scarePeds(x, y, radius) {
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      if (dist(x, y, ped.x, ped.y) < radius) {
        ped.state = 'flee';
        ped.stateTimer = random.range(1.6, 3.2);
        ped.fleeX = ped.x + (ped.x - x);
        ped.fleeY = ped.y + (ped.y - y);
      }
    }
  }

  function damagePlayer(amount) {
    if (state.over) return;
    if (player.armour > 0) {
      const absorbed = Math.min(player.armour, amount * 0.6);
      player.armour -= absorbed;
      player.health -= amount - absorbed;
    } else {
      player.health -= amount;
    }
    if (player.health <= 0) {
      player.health = 0;
      state.over = 'wasted';
      fx.push('wasted');
    }
  }

  function damageCar(car, amount, sparkX, sparkY) {
    if (car.wrecked) return;
    car.health -= amount;
    spawnParticles(sparkX ?? car.x, sparkY ?? car.y, 4, '#ffb703', 130, 0.4, 3);
    if (car.health <= 0) {
      car.health = 0;
      car.wrecked = true;
      spawnParticles(car.x, car.y, 22, '#5a5a5a', 90, 1.1, 6);
      if (player.inCar === car) exitCar();
      if (car.target && state.missionActive && state.missionIndex === 1) {
        failMission('Mara Voss: The Comet is wrecked. That was the whole job… we go again soon.');
      }
    }
  }

  // ------------------------------------------------------------- player

  function nearestCar(x, y, radius) {
    let best = null;
    let bd = radius;
    for (const car of cars) {
      if (car.wrecked || car.driver === 'police') continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    if (!car) return;
    if (car.driver === 'traffic') {
      // The driver bails out and runs, and the law hears about it.
      car.driver = 'player';
      state.stats.stolen += 1;
      const ped = spawnPed(car.x + 42, car.y + 30);
      ped.state = 'flee';
      ped.stateTimer = 3;
      ped.fleeX = ped.x + 220;
      ped.fleeY = ped.y + 60;
      addWanted(1);
      toast('Car stolen — wanted level up', 2.6);
    } else {
      car.driver = 'player';
    }
    player.inCar = car;
    fx.push('enter');
  }

  function exitCar() {
    const car = player.inCar;
    if (!car) return;
    car.driver = 'parked';
    car.vx = 0; car.vy = 0; car.speed = 0;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 36;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 36;
    player.x = clamp(player.x, 20, BEACH.waterX - 14);
    player.y = clamp(player.y, 20, WORLD.height - 20);
    city.resolveCircle(player, PLAYER.radius);
    player.inCar = null;
    fx.push('exit');
  }

  function shoot(x, y, angle, from, damage) {
    bullets.push({
      x: x + Math.cos(angle) * 18,
      y: y + Math.sin(angle) * 18,
      vx: Math.cos(angle) * PISTOL.bulletSpeed,
      vy: Math.sin(angle) * PISTOL.bulletSpeed,
      from, damage, life: PISTOL.range / PISTOL.bulletSpeed,
    });
  }

  function updatePlayerOnFoot(dt, input) {
    const mag = Math.hypot(input.mx, input.my);
    const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    if (mag > 0.1) {
      player.vx = (input.mx / Math.max(1, mag)) * speed;
      player.vy = (input.my / Math.max(1, mag)) * speed;
      player.walkPhase += dt * (input.sprint ? 13 : 9);
    } else {
      player.vx = 0;
      player.vy = 0;
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 16, BEACH.waterX - 12);
    player.y = clamp(player.y, 16, WORLD.height - 16);
    city.resolveCircle(player, PLAYER.radius);
    if (input.aimX !== undefined) player.angle = angleTo(player.x, player.y, input.aimX, input.aimY);

    if (input.enterPressed) {
      const car = nearestCar(player.x, player.y, 88);
      if (car) { enterCar(car); return; }
    }
    if (input.reloadPressed && player.ammo < PISTOL.magSize && player.reloadTimer === 0 && player.reserve > 0) {
      player.reloadTimer = PISTOL.reloadTime;
      fx.push('reload');
    }
    if (player.reloadTimer > 0 && player.reloadTimer <= dt) {
      const take = Math.min(PISTOL.magSize - player.ammo, player.reserve);
      player.ammo += take;
      player.reserve -= take;
    }
    if (input.fire && player.fireTimer === 0 && player.reloadTimer === 0) {
      if (player.ammo <= 0) {
        fx.push('dry');
        player.fireTimer = 0.3;
      } else {
        player.ammo -= 1;
        player.fireTimer = PISTOL.fireInterval;
        state.stats.shots += 1;
        state.shake = Math.max(state.shake, 2.2);
        shoot(player.x, player.y, player.angle, 'player', PISTOL.damage);
        fx.push('shot');
        scarePeds(player.x, player.y, PEDS.scareRadius);
        witnessCrime(player.x, player.y, 460);
      }
    }
  }

  function updatePlayerCar(dt, input) {
    const car = player.inCar;
    if (input.enterPressed) { exitCar(); return; }
    const fwdX = Math.cos(car.angle);
    const fwdY = Math.sin(car.angle);
    let f = car.vx * fwdX + car.vy * fwdY;
    let accel = 0;
    if (input.my < 0) accel = CAR.accel;
    else if (input.my > 0) accel = f > 0 ? -CAR.brake : -CAR.accel * 0.55;
    car.vx += fwdX * accel * dt;
    car.vy += fwdY * accel * dt;
    const steer = input.mx * CAR.steerRate * clamp(Math.abs(f) / 220, 0, 1) * (f >= 0 ? 1 : -1);
    car.angle += steer * dt;
    const nx = Math.cos(car.angle);
    const ny = Math.sin(car.angle);
    let nf = car.vx * nx + car.vy * ny;
    let lx = car.vx - nx * nf;
    let ly = car.vy - ny * nf;
    const damp = Math.exp(-(input.handbrake ? 1.4 : CAR.grip) * dt);
    lx *= damp;
    ly *= damp;
    if (input.handbrake) nf *= Math.exp(-1.6 * dt);
    nf = clamp(nf, -CAR.reverseMax, car.kind === 'sport' ? CAR.sportMaxSpeed : CAR.maxSpeed);
    car.vx = nx * nf + lx;
    car.vy = ny * nf + ly;
    car.speed = nf;
    moveCar(car, dt, true);
    if (input.fire && player.fireTimer === 0 && player.ammo > 0 && player.reloadTimer === 0) {
      // Drive-by: fire toward the mouse from the car.
      player.ammo -= 1;
      player.fireTimer = PISTOL.fireInterval + 0.08;
      state.stats.shots += 1;
      const a = input.aimX !== undefined ? angleTo(car.x, car.y, input.aimX, input.aimY) : car.angle;
      shoot(car.x, car.y, a, 'player', PISTOL.damage);
      fx.push('shot');
      scarePeds(car.x, car.y, PEDS.scareRadius);
      witnessCrime(car.x, car.y, 460);
    }
  }

  /** Move a car by its velocity, resolve buildings/water, apply crash damage. */
  function moveCar(car, dt, isPlayer) {
    const beforeX = car.x;
    const beforeY = car.y;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.x = clamp(car.x, 30, WORLD.width - 30);
    car.y = clamp(car.y, 30, WORLD.height - 30);
    if (car.x > BEACH.waterX - 24) {
      car.x = BEACH.waterX - 24;
      if (car.vx > 0) car.vx = 0;
    }
    const hit = city.resolveCircle(car, 30);
    if (hit) {
      const impact = Math.hypot(car.vx, car.vy);
      if (impact > CAR.hitDamageFrom && car.hitCd <= 0) {
        damageCar(car, (impact - CAR.hitDamageFrom) / 13, beforeX, beforeY);
        car.hitCd = CAR.hitCooldown;
        fx.push('crash');
        if (isPlayer) state.shake = Math.max(state.shake, Math.min(9, impact / 46));
        scarePeds(car.x, car.y, 200);
      }
      car.vx *= 0.32;
      car.vy *= 0.32;
      if (car.driver !== 'player') car.speed *= 0.3;
      else car.speed = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
    }
  }

  // ------------------------------------------------------------- AI cars

  function obstacleAhead(car, lookDist) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const px = car.x + fx * lookDist;
    const py = car.y + fy * lookDist;
    for (const other of cars) {
      if (other === car) continue;
      if (dist(px, py, other.x, other.y) < 46) return true;
    }
    for (const ped of peds) {
      if (ped.state !== 'down' && dist(px, py, ped.x, ped.y) < 38) return true;
    }
    if (!player.inCar && dist(px, py, player.x, player.y) < 38) return true;
    return false;
  }

  function updateTrafficCar(car, dt) {
    if (car.aiState === 'flee') {
      car.aiTimer -= dt;
      if (car.aiTimer <= 0) car.aiState = 'drive';
    }
    car.turnCd -= dt;
    // Maybe turn at an intersection.
    const crossLines = car.axis === 'v' ? ROADS_H : ROADS_V;
    const along = car.axis === 'v' ? car.y : car.x;
    if (car.turnCd <= 0) {
      for (const line of crossLines) {
        if (Math.abs(along - line) < 12 && random.chance(0.012)) {
          car.axis = car.axis === 'v' ? 'h' : 'v';
          car.line = line;
          car.dir = random.chance(0.5) ? 1 : -1;
          car.turnCd = 1.4;
          break;
        }
      }
    }
    const desired = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    const diff = wrapAngle(desired - car.angle);
    car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
    // Ease onto the lane.
    if (car.axis === 'v') {
      const laneX = car.line - car.dir * 28;
      car.x += (laneX - car.x) * Math.min(1, 1.7 * dt);
    } else {
      const laneY = car.line + car.dir * 28;
      car.y += (laneY - car.y) * Math.min(1, 1.7 * dt);
    }
    const cruise = car.cruise * (car.aiState === 'flee' ? 1.5 : 1);
    const target = obstacleAhead(car, 84) ? 0 : cruise;
    const rate = target < car.speed ? 520 : 240;
    car.speed += clamp(target - car.speed, -rate * dt, rate * dt);
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    moveCar(car, dt, false);
    // Turn around at the city edge instead of piling up.
    if (car.axis === 'v' && (car.y < 76 || car.y > WORLD.height - 76)) car.dir *= -1;
    if (car.axis === 'h' && (car.x < 76 || car.x > BEACH.sandX - 70)) car.dir *= -1;
  }

  function updatePoliceCar(car, dt) {
    const p = playerPos();
    const d = dist(car.x, car.y, p.x, p.y);
    const desired = angleTo(car.x, car.y, p.x, p.y);
    const diff = wrapAngle(desired - car.angle);
    car.angle += clamp(diff, -POLICE.carTurn * dt, POLICE.carTurn * dt);
    let target = POLICE.carSpeed;
    if (!player.inCar) {
      // Roll up to the suspect, do not run him down: the arrest is the point.
      if (d < 150) target = 130;
      if (d < 74) target = 0;
    } else if (d < 60) {
      target = Math.abs(player.inCar.speed) * 0.9;
    }
    const rate = target < car.speed ? 560 : 300;
    car.speed += clamp(target - car.speed, -rate * dt, rate * dt);
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    moveCar(car, dt, false);
  }

  function updateCarCollisions() {
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 56 || d < 0.01) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = 56 - d;
        if (!a.wrecked) { a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5; }
        if (!b.wrecked) { b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5; }
        const rel = Math.abs((b.vx - a.vx) * nx + (b.vy - a.vy) * ny);
        // Swap a share of the normal velocity so cars bounce apart.
        const avn = a.vx * nx + a.vy * ny;
        const bvn = b.vx * nx + b.vy * ny;
        const swap = (bvn - avn) * 0.55;
        a.vx += nx * swap; a.vy += ny * swap;
        b.vx -= nx * swap; b.vy -= ny * swap;
        if (a.driver !== 'player') a.speed = a.vx * Math.cos(a.angle) + a.vy * Math.sin(a.angle);
        if (b.driver !== 'player') b.speed = b.vx * Math.cos(b.angle) + b.vy * Math.sin(b.angle);
        if (rel > 175) {
          const dmg = (rel - 175) / 20;
          damageCar(a, dmg, a.x, a.y);
          damageCar(b, dmg, b.x, b.y);
          fx.push('crash');
          if (a.driver === 'traffic') { a.aiState = 'flee'; a.aiTimer = 3; }
          if (b.driver === 'traffic') { b.aiState = 'flee'; b.aiTimer = 3; }
          if ((a.driver === 'player' && b.driver === 'traffic') || (b.driver === 'player' && a.driver === 'traffic')) {
            witnessCrime(playerPos().x, playerPos().y, 430);
          }
          if (player.inCar === a || player.inCar === b) state.shake = Math.max(state.shake, Math.min(8, rel / 55));
        }
      }
    }
  }

  // ------------------------------------------------------------- police

  let policeTimer = 0;
  function managePolice(dt) {
    policeTimer -= dt;
    const p = playerPos();
    const wantCars = state.wanted === 0 ? 0 : Math.min(1 + (state.wanted - 1), 5);
    const policeCars = cars.filter((c) => c.driver === 'police');
    // Despawn far-away units when the heat is off them.
    for (const car of policeCars) {
      if (dist(car.x, car.y, p.x, p.y) > 1550) {
        cars.splice(cars.indexOf(car), 1);
      }
    }
    if (policeTimer <= 0) {
      policeTimer = 1.1;
      const current = cars.filter((c) => c.driver === 'police').length;
      if (current < wantCars) {
        for (let tries = 0; tries < 9; tries += 1) {
          const spot = city.roadPoint();
          const d = dist(spot.x, spot.y, p.x, p.y);
          if (d > POLICE.spawnMin && d < POLICE.spawnMax) {
            const car = makeCar(spot.x, spot.y, 0, 'sedan', 'police');
            car.color = '#f2f4f6';
            car.angle = angleTo(spot.x, spot.y, p.x, p.y);
            break;
          }
        }
      }
      const wantCops = state.wanted >= 3 ? Math.min(state.wanted - 1, 4) : 0;
      if (cops.length < wantCops) {
        const spot = city.sidewalkPointNear(p.x, p.y, 640);
        if (dist(spot.x, spot.y, p.x, p.y) > 380) {
          cops.push({ id: nextId++, x: spot.x, y: spot.y, angle: 0, health: 60, fireTimer: random.range(0.4, 1.1) });
        }
      }
    }
    // Foot cops who lost the trail drift away.
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      if (state.wanted < 3 || dist(cops[i].x, cops[i].y, p.x, p.y) > 1300) cops.splice(i, 1);
    }
  }

  function updateCop(cop, dt) {
    const p = playerPos();
    const d = dist(cop.x, cop.y, p.x, p.y);
    cop.angle = angleTo(cop.x, cop.y, p.x, p.y);
    if (d > 52) {
      cop.x += Math.cos(cop.angle) * POLICE.copSpeed * dt;
      cop.y += Math.sin(cop.angle) * POLICE.copSpeed * dt;
      city.resolveCircle(cop, 12);
    }
    cop.fireTimer -= dt;
    if (d < POLICE.copShootRange && cop.fireTimer <= 0) {
      cop.fireTimer = random.range(0.7, 1.05);
      const spread = random.range(-0.07, 0.07);
      shoot(cop.x, cop.y, cop.angle + spread, 'cop', POLICE.copDamage);
      fx.push('shot');
    }
  }

  // ------------------------------------------------------------- peds & bullets

  function downPed(ped, dropCash) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downTimer = 7;
    state.stats.downed += 1;
    fx.push('down');
    if (dropCash) {
      pickups.push({ kind: 'cash', x: ped.x + random.range(-8, 8), y: ped.y + random.range(-8, 8), amount: random.int(10, 32), respawn: 0, dropped: true, ttl: 60 });
    }
  }

  function updatePed(ped, dt) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      return;
    }
    if (ped.state === 'flee') {
      ped.stateTimer -= dt;
      const a = angleTo(ped.x, ped.y, ped.fleeX, ped.fleeY);
      ped.angle = a;
      ped.x += Math.cos(a) * 208 * dt;
      ped.y += Math.sin(a) * 208 * dt;
      if (ped.stateTimer <= 0) {
        ped.state = 'walk';
        const t = city.sidewalkPointNear(ped.x, ped.y, 700);
        ped.tx = t.x; ped.ty = t.y;
      }
    } else {
      const d = dist(ped.x, ped.y, ped.tx, ped.ty);
      if (d < 14) {
        const t = city.sidewalkPointNear(ped.x, ped.y, 760);
        ped.tx = t.x; ped.ty = t.y;
      } else {
        const a = angleTo(ped.x, ped.y, ped.tx, ped.ty);
        ped.angle = a;
        ped.x += Math.cos(a) * PEDS.walkSpeed * ped.speedVar * dt;
        ped.y += Math.sin(a) * PEDS.walkSpeed * ped.speedVar * dt;
      }
    }
    ped.x = clamp(ped.x, 14, BEACH.waterX - 10);
    ped.y = clamp(ped.y, 14, WORLD.height - 14);
    city.resolveCircle(ped, 10);
  }

  function pointInBuilding(x, y) {
    for (const b of city.buildings) {
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
    }
    return false;
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height;
      if (!dead && pointInBuilding(b.x, b.y)) {
        spawnParticles(b.x, b.y, 2, '#d8d2c0', 60, 0.3, 2);
        dead = true;
      }
      if (!dead && b.from === 'player') {
        for (const ped of peds) {
          if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 15) {
            downPed(ped, true);
            witnessCrime(b.x, b.y, 430);
            dead = true;
            break;
          }
        }
        if (!dead) for (const cop of cops) {
          if (dist(b.x, b.y, cop.x, cop.y) < 16) {
            cop.health -= PISTOL.copDamage;
            state.stats.hits += 1;
            fx.push('hit');
            if (cop.health <= 0) {
              cops.splice(cops.indexOf(cop), 1);
              state.stats.downed += 1;
              addWanted(1);
              spawnParticles(cop.x, cop.y, 10, '#34558b', 90, 0.7, 4);
            }
            dead = true;
            break;
          }
        }
        if (!dead) for (const crate of crates) {
          if (!crate.dead && dist(b.x, b.y, crate.x, crate.y) < 22) {
            crate.hp -= b.damage;
            fx.push('hit');
            if (crate.hp <= 0) {
              crate.dead = true;
              spawnParticles(crate.x, crate.y, 16, '#b08954', 150, 0.7, 5);
            }
            dead = true;
            break;
          }
        }
        if (!dead) for (const car of cars) {
          if (car !== player.inCar && dist(b.x, b.y, car.x, car.y) < 30) {
            damageCar(car, 7, b.x, b.y);
            if (car.driver === 'traffic') { car.aiState = 'flee'; car.aiTimer = 3; }
            dead = true;
            break;
          }
        }
      } else if (!dead && b.from === 'cop') {
        if (player.inCar) {
          if (dist(b.x, b.y, player.inCar.x, player.inCar.y) < 30) {
            damageCar(player.inCar, 2, b.x, b.y);
            dead = true;
          }
        } else if (dist(b.x, b.y, player.x, player.y) < 15) {
          damagePlayer(b.damage);
          fx.push('hit');
          dead = true;
        }
      }
      if (dead) bullets.splice(i, 1);
    }
  }

  function updateCarPedHits() {
    for (const car of cars) {
      const sp = Math.hypot(car.vx, car.vy);
      if (sp < 65) continue;
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 27) {
          downPed(ped, true);
          scarePeds(ped.x, ped.y, 240);
          if (car.driver === 'player') {
            witnessCrime(ped.x, ped.y, 430);
            state.shake = Math.max(state.shake, 3);
          }
          car.vx *= 0.92;
          car.vy *= 0.92;
        }
      }
      if (!player.inCar && car.driver === 'police' && sp > 150 && dist(car.x, car.y, player.x, player.y) < 27) {
        // A fast police car clips the suspect: it hurts, but the arrest
        // still has to be made on foot.
        damagePlayer(9);
        player.x += car.vx * 0.04;
        player.y += car.vy * 0.04;
      }
    }
  }

  // ------------------------------------------------------------- pickups & spray

  let sprayTimer = 0;
  let sprayMsgCd = 0;
  function updatePickupsAndSpray(dt) {
    const p = playerPos();
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const pk = pickups[i];
      if (pk.respawn > 0) { pk.respawn -= dt; continue; }
      if (pk.dropped) {
        pk.ttl -= dt;
        if (pk.ttl <= 0) { pickups.splice(i, 1); continue; }
      }
      if (dist(p.x, p.y, pk.x, pk.y) < 32) {
        if (pk.kind === 'cash') { state.cash += pk.amount; toast(`+$${pk.amount}`, 1.6); }
        else if (pk.kind === 'health') { player.health = Math.min(PLAYER.health, player.health + 40); toast('Health +40', 1.8); }
        else if (pk.kind === 'armour') { player.armour = Math.min(PLAYER.armourMax, player.armour + 50); toast('Armour +50', 1.8); }
        else if (pk.kind === 'ammo') { player.reserve += 24; toast('Pistol ammo +24', 1.8); }
        else if (pk.kind === 'bribe') {
          if (state.wanted > 0) { state.wanted -= 1; toast('Bribe taken — one star gone', 2.2); } else { state.cash += 25; toast('+$25', 1.6); }
        }
        fx.push(pk.kind === 'bribe' ? 'bribe' : 'pickup');
        spawnParticles(pk.x, pk.y, 7, '#ffe066', 80, 0.5, 3);
        if (pk.dropped) pickups.splice(i, 1);
        else pk.respawn = PICKUPS.respawn;
      }
    }
    // Pay 'n Spray.
    sprayMsgCd -= dt;
    const z = ZONES.spray;
    if (player.inCar && state.wanted > 0 && dist(p.x, p.y, z.x, z.y) < SPRAY.radius && Math.abs(player.inCar.speed) < 26) {
      sprayTimer += dt;
      if (sprayTimer > 0.8) {
        sprayTimer = 0;
        if (state.cash >= SPRAY.cost) {
          state.cash -= SPRAY.cost;
          state.wanted = 0;
          state.heat = 0;
          player.inCar.health = 100;
          fx.push('spray');
          toast("Pay 'n Spray: fresh paint, clean record. -$" + SPRAY.cost, 3);
        } else if (sprayMsgCd <= 0) {
          sprayMsgCd = 5;
          toast("Pay 'n Spray costs $" + SPRAY.cost, 2.4);
        }
      }
    } else {
      sprayTimer = 0;
    }
  }

  // ------------------------------------------------------------- missions

  function currentLeg() {
    if (!state.missionActive) return null;
    return MISSIONS[state.missionIndex].legs[state.missionObj];
  }

  function startMission(i) {
    state.missionActive = true;
    state.missionObj = 0;
    state.bagsGot = 0;
    const m = MISSIONS[i];
    state.missionTimer = m.time || 0;
    if (i === 4) for (const bag of bags) { bag.got = false; bag.active = true; }
    toast(m.intro, 6.5);
    fx.push('mission');
    applyLegStart(m.legs[0]);
  }

  function applyLegStart(leg) {
    if (leg && leg.forceWanted && state.wanted < leg.forceWanted) {
      state.wanted = leg.forceWanted;
      state.heat = 0;
    }
  }

  function failMission(why) {
    state.missionActive = false;
    state.missionWait = 8;
    for (const bag of bags) bag.active = false;
    toast(why || 'Mara Voss: That went sideways. Lie low, we try again.', 4.5);
    fx.push('fail');
  }

  function completeMission() {
    const m = MISSIONS[state.missionIndex];
    state.cash += m.reward;
    state.stats.earned += m.reward;
    state.missionActive = false;
    state.missionWait = 7;
    for (const bag of bags) bag.active = false;
    toast(`${m.outro}  (+$${m.reward})`, 6);
    fx.push('complete');
    if (state.missionIndex === MISSIONS.length - 1) {
      state.storyComplete = true;
      state.storyBanner = 9;
    }
    state.missionIndex += 1;
  }

  function advanceLeg() {
    const m = MISSIONS[state.missionIndex];
    state.missionObj += 1;
    fx.push('mission');
    if (state.missionObj >= m.legs.length) completeMission();
    else applyLegStart(m.legs[state.missionObj]);
  }

  function updateMissions(dt) {
    if (state.missionIndex >= MISSIONS.length) return;
    if (!state.missionActive) {
      state.missionWait -= dt;
      if (state.missionWait <= 0) startMission(state.missionIndex);
      return;
    }
    const m = MISSIONS[state.missionIndex];
    if (m.time) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) {
        failMission('Mara Voss: Too slow. The moment is gone — we go again soon.');
        return;
      }
    }
    const leg = currentLeg();
    if (!leg) return;
    const p = playerPos();
    if (leg.kind === 'goto') {
      if (leg.inTargetCar && !(player.inCar && player.inCar.target)) return;
      if (dist(p.x, p.y, leg.x, leg.y) < leg.r) advanceLeg();
    } else if (leg.kind === 'steal') {
      if (player.inCar && player.inCar.target) advanceLeg();
    } else if (leg.kind === 'crates') {
      if (crates.every((c) => c.dead)) advanceLeg();
    } else if (leg.kind === 'bags') {
      for (const bag of bags) {
        if (bag.active && !bag.got && dist(p.x, p.y, bag.x, bag.y) < 56) {
          bag.got = true;
          state.bagsGot += 1;
          state.cash += 100;
          fx.push('pickup');
          toast(`Cash bag ${state.bagsGot} of 3  (+$100)`, 2.2);
        }
      }
      if (state.bagsGot >= 3) advanceLeg();
    } else if (leg.kind === 'boat') {
      if (dist(p.x, p.y, leg.x, leg.y) < leg.r) advanceLeg();
    }
  }

  function currentObjective() {
    const leg = currentLeg();
    if (!leg) return null;
    let x = leg.x;
    let y = leg.y;
    let text = leg.text;
    if (leg.kind === 'bags') {
      let best = null;
      let bd = Infinity;
      for (const bag of bags) {
        if (!bag.active || bag.got) continue;
        const d = dist(playerPos().x, playerPos().y, bag.x, bag.y);
        if (d < bd) { bd = d; best = bag; }
      }
      if (best) { x = best.x; y = best.y; }
      text = `Collect the cash bags (${state.bagsGot}/3)`;
    } else if (leg.kind === 'crates') {
      const left = crates.filter((c) => !c.dead).length;
      text = `Shoot the supply crates (${3 - left}/3)`;
      const alive = crates.find((c) => !c.dead);
      if (alive) { x = alive.x; y = alive.y; }
    }
    const p = playerPos();
    return { kind: leg.kind, x, y, r: leg.r, text, dist: Math.round(dist(p.x, p.y, x, y)) };
  }

  // ------------------------------------------------------------- wanted

  function updateWanted(dt) {
    const p = playerPos();
    let seen = false;
    for (const car of cars) if (car.driver === 'police' && dist(car.x, car.y, p.x, p.y) < 950) { seen = true; break; }
    if (!seen) for (const cop of cops) if (dist(cop.x, cop.y, p.x, p.y) < 430) { seen = true; break; }
    const leg = currentLeg();
    const noDecay = !!(leg && leg.forceWanted);
    if (seen || noDecay) state.heat = 0;
    else if (state.wanted > 0) {
      state.heat += dt;
      if (state.heat > 7) {
        state.wanted -= 1;
        state.heat = 0;
        if (state.wanted > 0) toast('The heat is dying down…', 2);
        else toast('You lost them. Clean — for now.', 2.4);
      }
    }
    // The bust meter: only a slow suspect on foot can be cuffed.
    if (!player.inCar && state.wanted > 0 && !state.over) {
      let near = false;
      for (const cop of cops) if (dist(cop.x, cop.y, player.x, player.y) < POLICE.bustRange) { near = true; break; }
      if (!near) for (const car of cars) {
        if (car.driver === 'police' && Math.abs(car.speed) < 95 && dist(car.x, car.y, player.x, player.y) < 92) { near = true; break; }
      }
      if (near && playerSpeed() < 55) state.bust += dt / POLICE.bustTime;
      else state.bust -= dt * 1.5;
    } else {
      state.bust -= dt * 1.5;
    }
    state.bust = clamp(state.bust, 0, 1);
    if (state.bust >= 1 && !state.over) {
      state.over = 'busted';
      fx.push('busted');
    }
  }

  // ------------------------------------------------------------- main step

  function step(dt, input) {
    fx.length = 0;
    state.time += dt;
    crimeCd -= dt;
    player.fireTimer = Math.max(0, player.fireTimer - dt);
    player.reloadTimer = Math.max(0, player.reloadTimer - dt);
    state.shake *= Math.exp(-5.5 * dt);
    if (state.storyBanner > 0) state.storyBanner -= dt;
    for (let i = toasts.length - 1; i >= 0; i -= 1) {
      toasts[i].ttl -= dt;
      if (toasts[i].ttl <= 0) toasts.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const pt = particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.exp(-2.4 * dt);
      pt.vy *= Math.exp(-2.4 * dt);
      if (pt.life <= 0) particles.splice(i, 1);
    }
    if (state.over) return;

    if (player.inCar) updatePlayerCar(dt, input);
    else updatePlayerOnFoot(dt, input);

    for (const car of cars) {
      car.hitCd = Math.max(0, car.hitCd - dt);
      if (car.wrecked || car.driver === 'parked' || car.driver === 'player') continue;
      if (car.driver === 'traffic') updateTrafficCar(car, dt);
      else if (car.driver === 'police') updatePoliceCar(car, dt);
    }
    updateCarCollisions();
    updateCarPedHits();
    for (const ped of peds) updatePed(ped, dt);
    // Replace peds who faded out so the streets stay alive.
    for (let i = peds.length - 1; i >= 0; i -= 1) {
      if (peds[i].state === 'down' && peds[i].downTimer <= 0) {
        peds.splice(i, 1);
        const spot = city.sidewalkPoint();
        if (dist(spot.x, spot.y, playerPos().x, playerPos().y) > 500) spawnPed(spot.x, spot.y);
      }
    }
    managePolice(dt);
    for (const cop of cops) updateCop(cop, dt);
    updateBullets(dt);
    updatePickupsAndSpray(dt);
    updateMissions(dt);
    updateWanted(dt);
  }

  // ------------------------------------------------------------- save

  function saveData() {
    return { cash: state.cash, missionIndex: state.missionIndex, storyComplete: state.storyComplete };
  }

  function applySave(data) {
    if (!data) return;
    state.cash = Math.max(0, data.cash | 0);
    state.missionIndex = clamp(data.missionIndex | 0, 0, MISSIONS.length);
    state.storyComplete = !!data.storyComplete;
    state.missionWait = 3;
  }

  return {
    city, state, player, cars, peds, cops, bullets, pickups, crates, bags, particles, toasts, fx,
    step, playerPos, playerSpeed, currentObjective, saveData, applySave,
    get comet() { return comet; },
  };
}
