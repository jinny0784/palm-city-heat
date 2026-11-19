// Palm City Heat — everything the player sees. drawGame paints the world
// from the camera (streets, buildings, palms, cars, people, bullets), then
// the HUD (health, stars, cash, ammo, the minimap, the mission banner and
// Mara's phone toasts), then whichever screen the game mode calls for.
//
// The palette is a warm day in a coastal city: sand, teal water, coral and
// cream rooftops, palm green. Soft shadows under buildings and cars keep
// it grounded.

import { WORLD_W, WORLD_H, V_ROADS, H_ROADS, ROAD_W, BEACH_X, WATER_X, PLACES } from './config.js';

const HALF_ROAD = ROAD_W / 2;

/** The camera's top-left in world space: centred on the player, clamped to the world. */
export function cameraFor(world, view) {
  const focus = world.camOverride ?? world.player;
  const x = Math.max(0, Math.min(WORLD_W - view.w, focus.x - view.w / 2));
  const y = Math.max(0, Math.min(WORLD_H - view.h, focus.y - view.h / 2));
  return { x, y };
}

/** Multiply a #rrggbb colour by a shade factor. */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const money = (n) => '$' + n.toLocaleString('en-US');

// ------------------------------------------------------------------ the world

function drawGround(ctx, world, cam, view) {
  const { city } = world;
  // Base: dry grass-concrete between the blocks.
  ctx.fillStyle = '#8fa36b';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // City blocks: pavement, with special ground for park, depot and strip.
  for (const b of city.blocks) {
    if (b.x + b.w < cam.x - 40 || b.y + b.h < cam.y - 40 || b.x > cam.x + view.w + 40 || b.y > cam.y + view.h + 40) continue;
    ctx.fillStyle = b.kind === 'park' ? '#69a85e' : b.kind === 'depot' ? '#a79b8a' : b.kind === 'strip' ? '#7fae6d' : '#b3a897';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    if (b.kind === 'block') {
      ctx.fillStyle = '#bcb09c';
      ctx.fillRect(b.x + 30, b.y + 30, b.w - 60, b.h - 60);
    }
    if (b.kind === 'strip') {
      // The airstrip: a grey runway with a dashed centreline.
      ctx.fillStyle = '#6d6d75';
      ctx.fillRect(b.x + 26, b.y + b.h / 2 - 44, b.w - 52, 88);
      ctx.fillStyle = '#e8e4da';
      for (let x = b.x + 46; x < b.x + b.w - 70; x += 52) ctx.fillRect(x, b.y + b.h / 2 - 3, 28, 6);
    }
  }

  // Roads: pavement apron, asphalt, dashed centre lines.
  ctx.fillStyle = '#c2b6a2';
  for (const cx of V_ROADS) ctx.fillRect(cx - HALF_ROAD - 10, 0, ROAD_W + 20, WORLD_H);
  for (const cy of H_ROADS) ctx.fillRect(0, cy - HALF_ROAD - 10, BEACH_X, ROAD_W + 20);
  ctx.fillStyle = '#494952';
  for (const cx of V_ROADS) ctx.fillRect(cx - HALF_ROAD, 0, ROAD_W, WORLD_H);
  for (const cy of H_ROADS) ctx.fillRect(0, cy - HALF_ROAD, BEACH_X, ROAD_W);
  ctx.fillStyle = '#e9e2cf';
  for (const cx of V_ROADS) for (let y = 14; y < WORLD_H; y += 56) ctx.fillRect(cx - 3, y, 6, 30);
  for (const cy of H_ROADS) for (let x = 14; x < BEACH_X; x += 56) ctx.fillRect(x, cy - 3, 30, 6);

  // The coast: sand, then water with a foam edge and slow sparkle.
  ctx.fillStyle = '#eed9a4';
  ctx.fillRect(BEACH_X, 0, WATER_X - BEACH_X, WORLD_H);
  const grad = ctx.createLinearGradient(WATER_X, 0, WORLD_W, 0);
  grad.addColorStop(0, '#2f8fb3');
  grad.addColorStop(1, '#1b6ca8');
  ctx.fillStyle = grad;
  ctx.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  const foam = Math.sin(world.time * 1.4) * 3;
  ctx.fillRect(WATER_X + foam, 0, 3, WORLD_H);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let y = 30; y < WORLD_H; y += 90) {
    const off = ((y * 7 + Math.floor(world.time * 12)) % 120) - 20;
    ctx.fillRect(WATER_X + 40 + off, y, 46, 4);
  }

  // The marina: a wooden jetty and the boat that ends the story.
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(PLACES.marina.x - 60, PLACES.marina.y - 14, 130, 28);
  ctx.fillStyle = '#75582f';
  for (let x = PLACES.marina.x - 56; x < PLACES.marina.x + 66; x += 16) ctx.fillRect(x, PLACES.marina.y - 14, 3, 28);
  ctx.save();
  ctx.translate(PLACES.boat.x + 34, PLACES.boat.y);
  ctx.fillStyle = '#f4f6f7';
  ctx.beginPath();
  ctx.moveTo(-34, -11); ctx.lineTo(30, -11); ctx.lineTo(40, 0); ctx.lineTo(30, 11); ctx.lineTo(-34, 11);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2e86ab';
  ctx.fillRect(-16, -6, 24, 12);
  ctx.restore();

  // The docks: crates and a loading apron on the south shore.
  ctx.fillStyle = '#9c8f7a';
  ctx.fillRect(PLACES.docks.x - 90, PLACES.docks.y - 70, 180, 140);

  // The garage pad (Pay 'n Spray, and Mara's drop-off).
  ctx.fillStyle = '#7d7d88';
  roundRect(ctx, PLACES.garage.x - 62, PLACES.garage.y - 52, 124, 104, 8);
  ctx.fill();
  ctx.fillStyle = '#f4f6f7';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("PAY 'N SPRAY", PLACES.garage.x, PLACES.garage.y - 30);
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('GARAGE', PLACES.garage.x, PLACES.garage.y + 42);
}

function drawBuildings(ctx, world, cam, view) {
  for (const b of world.city.buildings) {
    if (b.x + b.w < cam.x - 60 || b.y + b.h < cam.y - 60 || b.x > cam.x + view.w + 60 || b.y > cam.y + view.h + 60) continue;
    ctx.fillStyle = 'rgba(30,30,40,0.28)';
    ctx.fillRect(b.x + 9, b.y + 12, b.w, b.h);
    ctx.fillStyle = shade(b.roof, b.shade * 0.72);
    ctx.fillRect(b.x, b.y + 7, b.w, b.h - 7);
    ctx.fillStyle = shade(b.roof, b.shade);
    ctx.fillRect(b.x, b.y, b.w, b.h - 7);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(b.x + 6, b.y + 6, Math.max(0, b.w - 12), 5);
  }
}

function drawPalmsAndProps(ctx, world) {
  for (const palm of world.city.palms) {
    ctx.fillStyle = 'rgba(30,30,40,0.20)';
    ctx.beginPath(); ctx.ellipse(palm.x + 6, palm.y + 8, 13 * palm.s, 6 * palm.s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a6b46';
    ctx.lineWidth = 4 * palm.s;
    ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.quadraticCurveTo(palm.x + 3, palm.y - 8, palm.x + 5, palm.y - 13 * palm.s); ctx.stroke();
    ctx.strokeStyle = '#3e9b4f';
    ctx.lineWidth = 3 * palm.s;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + palm.x * 0.01;
      ctx.beginPath();
      ctx.moveTo(palm.x + 5, palm.y - 13 * palm.s);
      ctx.quadraticCurveTo(
        palm.x + 5 + Math.cos(a) * 11 * palm.s, palm.y - 13 * palm.s + Math.sin(a) * 5 * palm.s - 3,
        palm.x + 5 + Math.cos(a) * 17 * palm.s, palm.y - 13 * palm.s + Math.sin(a) * 9 * palm.s + 4,
      );
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#5d6d7e';
  for (const lamp of world.city.lamps) {
    ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f9e79f';
    ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5d6d7e';
  }
  ctx.fillStyle = '#c0392b';
  for (const h of world.city.hydrants) {
    ctx.fillRect(h.x - 3, h.y - 3, 6, 6);
  }
}

function drawPickups(ctx, world) {
  for (const pk of world.pickups) {
    const bob = Math.sin(world.time * 3 + pk.phase) * 3;
    const y = pk.y + bob;
    ctx.save();
    ctx.translate(pk.x, y);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#27ae60';
      roundRect(ctx, -11, -7, 22, 14, 3); ctx.fill();
      ctx.fillStyle = '#eafaf1';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 4);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#f4f6f7';
      roundRect(ctx, -10, -10, 20, 20, 4); ctx.fill();
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(-3, -7, 6, 14); ctx.fillRect(-7, -3, 14, 6);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#6e5100';
      roundRect(ctx, -10, -8, 20, 16, 3); ctx.fill();
      ctx.fillStyle = '#ffd76a';
      for (let i = -1; i <= 1; i++) ctx.fillRect(i * 6 - 1.5, -5, 3, 10);
    } else if (pk.kind === 'armour') {
      ctx.fillStyle = '#5d6d7e';
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(9, -7); ctx.lineTo(9, 3); ctx.quadraticCurveTo(9, 10, 0, 12); ctx.quadraticCurveTo(-9, 10, -9, 3); ctx.lineTo(-9, -7);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#aebfd0';
      ctx.fillRect(-2, -7, 4, 12);
    } else if (pk.kind === 'star') {
      ctx.fillStyle = '#ffd700';
      star(ctx, 0, 0, 13);
      ctx.fill();
      ctx.strokeStyle = '#b7950b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }
  // Mission cash bags (M5) and the depot crates.
  for (const bag of world.bags) {
    if (bag.taken) continue;
    ctx.save();
    ctx.translate(bag.x, bag.y + Math.sin(world.time * 3 + bag.x) * 3);
    ctx.fillStyle = '#b7950b';
    roundRect(ctx, -11, -8, 22, 17, 6); ctx.fill();
    ctx.fillStyle = '#fff3cd';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', 0, 5);
    ctx.restore();
  }
  for (const crate of world.crates) {
    if (!crate.alive) continue;
    ctx.save();
    ctx.translate(crate.x, crate.y);
    ctx.fillStyle = 'rgba(30,30,40,0.25)';
    ctx.fillRect(-15, -9, 34, 30);
    ctx.fillStyle = '#c98f3d';
    ctx.fillRect(-17, -17, 34, 34);
    ctx.strokeStyle = '#8a5a1d';
    ctx.lineWidth = 3;
    ctx.strokeRect(-17, -17, 34, 34);
    ctx.beginPath(); ctx.moveTo(-17, -17); ctx.lineTo(17, 17); ctx.moveTo(17, -17); ctx.lineTo(-17, 17); ctx.stroke();
    ctx.restore();
  }
}

function drawMarker(ctx, world) {
  const m = world.mission;
  if (!m || !m.marker || world.mode !== 'play') return;
  const { x, y } = m.marker;
  const pulse = 1 + Math.sin(world.time * 4) * 0.15;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(x - 3, y - 700, 6, 700);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y, 30 * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.moveTo(x, y + 16);
  ctx.lineTo(x - 11, y - 6);
  ctx.lineTo(x + 11, y - 6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawCar(ctx, world, car) {
  const p = world.player;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(30,30,40,0.30)';
  roundRect(ctx, -22, -9, 50, 26, 8); ctx.fill();
  const isPolice = car.kind === 'police';
  const body = isPolice ? '#eef1f3' : car.colour;
  ctx.fillStyle = body;
  roundRect(ctx, -25, -12, 50, 24, 7); ctx.fill();
  if (isPolice) {
    ctx.fillStyle = '#22303c';
    ctx.fillRect(-25, -12, 20, 24);
    ctx.fillRect(8, -12, 17, 24);
  }
  // Cabin and glass.
  ctx.fillStyle = '#22303c';
  roundRect(ctx, -8, -9, 20, 18, 4); ctx.fill();
  ctx.fillStyle = '#7fb3d5';
  roundRect(ctx, 8, -8, 5, 16, 2); ctx.fill();
  // The driver, when there is one.
  if (car.driver || car === p.car) {
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath(); ctx.arc(-1, 0, 5, 0, Math.PI * 2); ctx.fill();
  }
  if (isPolice) {
    const flash = Math.floor(world.time * 5) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3b30' : '#7a130d';
    ctx.fillRect(-4, -8, 6, 6);
    ctx.fillStyle = flash ? '#14507a' : '#35a7ff';
    ctx.fillRect(3, -8, 6, 6);
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(-4, 3, 13, 5);
  }
  if (car.kind === 'gold') {
    ctx.fillStyle = '#8a6d1f';
    ctx.fillRect(-27, -11, 5, 22);
    ctx.fillStyle = '#fff3cd';
    ctx.fillRect(14, -7, 6, 14);
  }
  // Lights.
  ctx.fillStyle = '#fff9c4';
  ctx.fillRect(23, -9, 3, 5); ctx.fillRect(23, 4, 3, 5);
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(-26, -9, 3, 5); ctx.fillRect(-26, 4, 3, 5);
  ctx.restore();
  // Damage bar for the player's own car.
  if (car === p.car && car.hp < car.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(car.x - 24, car.y - 30, 48, 6);
    ctx.fillStyle = car.hp > 40 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(car.x - 23, car.y - 29, 46 * Math.max(0, car.hp / car.maxHp), 4);
  }
}

function drawPerson(ctx, x, y, angle, colour, phase, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(30,30,40,0.25)';
  ctx.beginPath(); ctx.ellipse(2, 4, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
  if (opts.down) {
    ctx.rotate(angle);
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.fillStyle = colour;
    roundRect(ctx, -14, -6, 28, 12, 6); ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath(); ctx.arc(15, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(phase) * 1.6;
  ctx.fillStyle = colour;
  ctx.beginPath(); ctx.arc(0, bob * 0.3, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath(); ctx.arc(0, bob * 0.3, 5.5, 0, Math.PI * 2); ctx.fill();
  if (opts.cap) {
    ctx.fillStyle = '#1b2a6b';
    ctx.beginPath(); ctx.arc(0, bob * 0.3 - 1, 5.5, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-6, bob * 0.3 - 2, 12, 2.5);
  }
  if (opts.gun) {
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(4, 2);
    ctx.lineTo(4 + Math.cos(opts.gun) * 15, 2 + Math.sin(opts.gun) * 15);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEntities(ctx, world) {
  for (const car of world.cars) drawCar(ctx, world, car);
  for (const ped of world.peds) {
    if (ped.state === 'down') {
      drawPerson(ctx, ped.x, ped.y, ped.angle, ped.colour, 0, { down: true, alpha: Math.max(0, 1 - (ped.downT - 3.5) / 2.5) });
    } else {
      drawPerson(ctx, ped.x, ped.y, ped.angle, ped.colour, ped.phase, {});
    }
  }
  for (const cop of world.cops) {
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#2e3d8f', world.time * 7, { cap: true, gun: cop.angle });
  }
  const p = world.player;
  if (!p.car) {
    const aiming = world.input.fire || p.fireCd > 0;
    drawPerson(ctx, p.x, p.y, p.angle, '#12836f', p.walkPhase, { gun: aiming ? p.angle : null });
  }
  // Bullets as short tracer lines.
  ctx.lineWidth = 2.4;
  for (const b of world.bullets) {
    ctx.strokeStyle = b.from === 'player' ? '#ffe66d' : '#ff9f68';
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Particles.
  for (const fx of world.particles) {
    ctx.globalAlpha = Math.max(0, fx.life / fx.maxLife);
    ctx.fillStyle = fx.colour;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ the HUD

function drawMinimap(ctx, world, view) {
  const w = 218;
  const h = 164;
  const x = 14;
  const y = view.h - h - 14;
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(16,24,32,0.82)';
  roundRect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 8);
  ctx.clip();
  ctx.fillStyle = '#2f8fb3';
  ctx.fillRect(x + WATER_X * sx, y, (WORLD_W - WATER_X) * sx, h);
  ctx.fillStyle = '#eed9a4';
  ctx.fillRect(x + BEACH_X * sx, y, (WATER_X - BEACH_X) * sx, h);
  ctx.strokeStyle = 'rgba(230,230,230,0.55)';
  ctx.lineWidth = 2;
  for (const cx of V_ROADS) { ctx.beginPath(); ctx.moveTo(x + cx * sx, y); ctx.lineTo(x + cx * sx, y + h); ctx.stroke(); }
  for (const cy of H_ROADS) { ctx.beginPath(); ctx.moveTo(x, y + cy * sy); ctx.lineTo(x + BEACH_X * sx, y + cy * sy); ctx.stroke(); }
  // Pickups and bags.
  ctx.fillStyle = '#2ecc71';
  for (const pk of world.pickups) if (pk.kind === 'cash') ctx.fillRect(x + pk.x * sx - 1.5, y + pk.y * sy - 1.5, 3, 3);
  ctx.fillStyle = '#ffd700';
  for (const bag of world.bags) if (!bag.taken) ctx.fillRect(x + bag.x * sx - 2, y + bag.y * sy - 2, 4, 4);
  // Police blips flash red and blue.
  const flash = Math.floor(world.time * 4) % 2 === 0;
  ctx.fillStyle = flash ? '#ff3b30' : '#35a7ff';
  for (const car of world.cars) if (car.kind === 'police') { ctx.beginPath(); ctx.arc(x + car.x * sx, y + car.y * sy, 3, 0, Math.PI * 2); ctx.fill(); }
  for (const cop of world.cops) { ctx.beginPath(); ctx.arc(x + cop.x * sx, y + cop.y * sy, 2.4, 0, Math.PI * 2); ctx.fill(); }
  // The mission marker.
  if (world.mission?.marker) {
    const m = world.mission.marker;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(x + m.x * sx, y + m.y * sy, 4 + Math.sin(world.time * 5) * 1.2, 0, Math.PI * 2); ctx.fill();
  }
  // The player: a white arrow.
  const p = world.player;
  ctx.save();
  ctx.translate(x + p.x * sx, y + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawHUD(ctx, world, view) {
  const p = world.player;
  // Health and armour, top-left.
  ctx.fillStyle = 'rgba(16,24,32,0.66)';
  roundRect(ctx, 14, 14, 232, 52, 8); ctx.fill();
  ctx.fillStyle = '#3d4756';
  ctx.fillRect(24, 26, 180, 13);
  ctx.fillStyle = p.hp > 30 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(24, 26, 180 * Math.max(0, p.hp / 100), 13);
  ctx.fillStyle = '#3d4756';
  ctx.fillRect(24, 45, 180, 8);
  ctx.fillStyle = '#7fb3d5';
  ctx.fillRect(24, 45, 180 * (p.armour / 50), 8);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('HP', 210, 37);
  ctx.fillText('AR', 210, 53);

  // Wanted stars and cash, top-right.
  for (let i = 0; i < 5; i++) {
    const cx = view.w - 34 - i * 40;
    ctx.fillStyle = i < world.wanted ? '#ffd700' : 'rgba(255,255,255,0.20)';
    star(ctx, cx, 34, 15);
    ctx.fill();
    if (i < world.wanted) { ctx.strokeStyle = '#b7950b'; ctx.lineWidth = 1.4; ctx.stroke(); }
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(money(world.cash), view.w - 22, 82);

  // Weapon and ammo, bottom-right.
  ctx.fillStyle = 'rgba(16,24,32,0.66)';
  roundRect(ctx, view.w - 168, view.h - 62, 154, 48, 8); ctx.fill();
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PISTOL', view.w - 152, view.h - 36);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(String(p.ammo), view.w - 28, view.h - 34);

  drawMinimap(ctx, world, view);

  // The mission banner, top-centre.
  const m = world.mission;
  if (m && world.mode === 'play') {
    const label = `${m.name} — ${m.text}`;
    ctx.font = 'bold 16px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const bw = tw + 42;
    ctx.fillStyle = 'rgba(16,24,32,0.72)';
    roundRect(ctx, (view.w - bw) / 2, 14, bw, 40, 9); ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.fillText(label, view.w / 2, 40);
    if (m.marker) {
      const d = Math.round(Math.hypot(p.x - m.marker.x, p.y - m.marker.y));
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${d} m`, view.w / 2, 68);
    }
    if (m.timer > 0) {
      const t = Math.ceil(m.timer);
      const text = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = t < 20 ? '#ff6b5e' : '#ffffff';
      ctx.fillText(text, view.w / 2 + bw / 2 + 34, 41);
    }
  }

  // The busted meter, centre screen.
  if (world.bustedMeter > 0.02 && world.mode === 'play') {
    ctx.fillStyle = 'rgba(16,24,32,0.7)';
    roundRect(ctx, view.w / 2 - 130, view.h * 0.62, 260, 40, 8); ctx.fill();
    ctx.fillStyle = '#ff6b5e';
    ctx.fillRect(view.w / 2 - 118, view.h * 0.62 + 24, 236 * Math.min(1, world.bustedMeter), 7);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THE COPS ARE ON YOU — MOVE!', view.w / 2, view.h * 0.62 + 18);
  }

  // Phone toasts, bottom-centre.
  let ty = view.h - 108;
  for (let i = world.toasts.length - 1; i >= 0; i--) {
    const t = world.toasts[i];
    const alpha = t.t < 0.3 ? t.t / 0.3 : t.ttl - t.t < 0.6 ? (t.ttl - t.t) / 0.6 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = '14px system-ui, sans-serif';
    const lines = wrapText(ctx, t.text, 470);
    const hh = 34 + lines.length * 18;
    ctx.fillStyle = 'rgba(20,26,34,0.88)';
    roundRect(ctx, view.w / 2 - 260, ty - hh, 520, hh, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,0,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t.from ? `PHONE — ${t.from.toUpperCase()}` : 'NOTE', view.w / 2 - 244, ty - hh + 19);
    ctx.fillStyle = '#f4f6f7';
    ctx.font = '14px system-ui, sans-serif';
    lines.forEach((line, li) => ctx.fillText(line, view.w / 2 - 244, ty - hh + 40 + li * 18));
    ctx.restore();
    ty -= hh + 8;
  }

  // Low health: a soft red edge.
  if (p.hp < 30 && world.mode === 'play') {
    const g = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.36, view.w / 2, view.h / 2, view.h * 0.75);
    g.addColorStop(0, 'rgba(180,0,0,0)');
    g.addColorStop(1, `rgba(180,0,0,${0.32 + Math.sin(world.time * 5) * 0.08})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
  }
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? line + ' ' + w : w;
    if (ctx.measureText(trial).width > maxW && line) { lines.push(line); line = w; }
    else line = trial;
  }
  if (line) lines.push(line);
  return lines;
}

// ------------------------------------------------------------------ screens

function bigTitle(ctx, view, text, sub, colour) {
  ctx.textAlign = 'center';
  ctx.font = '900 92px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillText(text, view.w / 2 + 4, view.h * 0.40 + 5);
  const g = ctx.createLinearGradient(0, view.h * 0.28, 0, view.h * 0.42);
  g.addColorStop(0, colour);
  g.addColorStop(1, '#ff7e47');
  ctx.fillStyle = g;
  ctx.fillText(text, view.w / 2, view.h * 0.40);
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(sub, view.w / 2, view.h * 0.40 + 44);
}

function statsLine(ctx, world, view, y) {
  const s = world.stats;
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = '#e8eef2';
  ctx.textAlign = 'center';
  ctx.fillText(`Cash earned ${money(s.earned)} · Cars stolen ${s.steals} · Shots fired ${s.shots} · Crashes ${s.crashes}`, view.w / 2, y);
}

function drawScreens(ctx, world, view) {
  if (world.mode === 'title') {
    ctx.fillStyle = 'rgba(10,16,26,0.34)';
    ctx.fillRect(0, 0, view.w, view.h);
    bigTitle(ctx, view, 'PALM CITY HEAT', 'An original top-down crime story — steal, drive, deliver, disappear.', '#ffd76a');
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (world.ui?.hasSave) {
      ctx.fillStyle = '#ffd700';
      ctx.fillText('ENTER — Continue', view.w / 2, view.h * 0.58);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('N — New Game', view.w / 2, view.h * 0.58 + 34);
    } else {
      ctx.fillStyle = '#ffd700';
      ctx.fillText('ENTER or CLICK — Start', view.w / 2, view.h * 0.58);
    }
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#dfe9ee';
    ctx.fillText('WASD / arrows — move & drive · Mouse — aim · Click / Space — shoot · E — enter car · Shift — sprint · Esc — pause · M — mute', view.w / 2, view.h * 0.70);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('A five-mission story for fixer Mara Voss. Every name and place in Palm City is original.', view.w / 2, view.h * 0.70 + 28);
    return;
  }
  if (world.mode === 'pause') {
    ctx.fillStyle = 'rgba(10,16,26,0.55)';
    ctx.fillRect(0, 0, view.w, view.h);
    bigTitle(ctx, view, 'PAUSED', 'Esc or P to keep driving.', '#a8d8ea');
    return;
  }
  if (world.mode === 'wasted') {
    ctx.fillStyle = 'rgba(90,0,0,0.42)';
    ctx.fillRect(0, 0, view.w, view.h);
    bigTitle(ctx, view, 'WASTED', 'Palm City keeps your cash where it fell. Click to try again.', '#ff6b5e');
    statsLine(ctx, world, view, view.h * 0.58);
    return;
  }
  if (world.mode === 'busted') {
    ctx.fillStyle = 'rgba(10,20,70,0.45)';
    ctx.fillRect(0, 0, view.w, view.h);
    bigTitle(ctx, view, 'BUSTED', 'The law caught up. Click to slip away and try again.', '#7fb3d5');
    statsLine(ctx, world, view, view.h * 0.58);
    return;
  }
  if (world.mode === 'story') {
    ctx.fillStyle = 'rgba(10,26,16,0.45)';
    ctx.fillRect(0, 0, view.w, view.h);
    bigTitle(ctx, view, 'STORY COMPLETE', "Mara Voss's five jobs are done. Click to roam Palm City free.", '#8be09a');
    statsLine(ctx, world, view, view.h * 0.58);
  }
}

// ------------------------------------------------------------------ entry

export function drawGame(ctx, world, view) {
  const cam = cameraFor(world, view);
  ctx.fillStyle = '#1b6ca8';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.save();
  const shX = world.shake ? (Math.random() - 0.5) * world.shake : 0;
  const shY = world.shake ? (Math.random() - 0.5) * world.shake : 0;
  ctx.translate(-cam.x + shX, -cam.y + shY);
  drawGround(ctx, world, cam, view);
  drawBuildings(ctx, world, cam, view);
  drawPalmsAndProps(ctx, world);
  drawPickups(ctx, world);
  drawMarker(ctx, world);
  drawEntities(ctx, world);
  ctx.restore();
  if (world.mode !== 'title') drawHUD(ctx, world, view);
  drawScreens(ctx, world, view);
}
