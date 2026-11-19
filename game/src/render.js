// render.js — canvas drawing for Palm City Heat: the city, every entity,
// the HUD and minimap, and the title / pause / end screens. Draws only
// what the simulation gives it; holds no game state of its own.

import {
  VIEW_W, VIEW_H, WORLD_W, WORLD_H, ROADS_X, ROADS_Y, ROAD_W,
  BEACH_X, WATER_X, CAR_TYPES,
} from './config.js';
import { PLACES, SPRAY_BAY, APRON, DEPOT_LOT } from './city.js';
import { missionTarget, objectiveText, starsOf, nearestEnterableCar, MISSIONS } from './world.js';
import { clamp } from './random.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (fill) ctx.fill();
  else ctx.stroke();
}

/** Deterministic per-index jitter for roof details (never uses time). */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawWorld(ctx, world, camX, camY) {
  const city = world.city;
  const vx0 = camX - VIEW_W / 2 - 60;
  const vy0 = camY - VIEW_H / 2 - 60;
  const vx1 = camX + VIEW_W / 2 + 60;
  const vy1 = camY + VIEW_H / 2 + 60;
  const inView = (x, y, w, h) => x + w > vx0 && x < vx1 && y + h > vy0 && y < vy1;

  // Ground, beach, water.
  ctx.fillStyle = '#7fb85c';
  ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  ctx.fillStyle = '#ecd9a0';
  ctx.fillRect(BEACH_X, vy0, WATER_X - BEACH_X, vy1 - vy0);
  ctx.fillStyle = '#2fa8c9';
  ctx.fillRect(WATER_X, vy0, WORLD_W - WATER_X, vy1 - vy0);
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  for (let y = 60; y < WORLD_H; y += 130) {
    ctx.fillRect(WATER_X + 18 + ((y * 7) % 60), y, 90, 5);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(WATER_X - 4, vy0, 5, vy1 - vy0);

  // Airstrip apron and depot lot.
  ctx.fillStyle = '#b9bec4';
  ctx.fillRect(APRON.x, APRON.y, APRON.w, APRON.h);
  ctx.fillStyle = '#f5f6fa';
  for (let x = APRON.x + 16; x < APRON.x + APRON.w - 20; x += 44) ctx.fillRect(x, APRON.y + APRON.h / 2 - 3, 26, 6);
  ctx.fillStyle = '#cbb98f';
  ctx.fillRect(DEPOT_LOT.x, DEPOT_LOT.y, DEPOT_LOT.w, DEPOT_LOT.h);

  // A parked plane on the apron, drawn simply.
  ctx.save();
  ctx.translate(3100, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath(); ctx.ellipse(6, 10, 74, 17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#eef2f5';
  ctx.beginPath(); ctx.ellipse(0, 0, 74, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-14, -46, 30, 92);
  ctx.fillStyle = '#3d7bd9';
  ctx.fillRect(52, -13, 16, 26);
  ctx.fillRect(-72, -24, 12, 48);
  ctx.restore();

  // Roads: sidewalk slab, asphalt, edge lines, centre dashes.
  for (const cx of ROADS_X) {
    ctx.fillStyle = '#cfc8b8';
    ctx.fillRect(cx - ROAD_W / 2 - 13, vy0, ROAD_W + 26, vy1 - vy0);
  }
  for (const cy of ROADS_Y) {
    ctx.fillStyle = '#cfc8b8';
    ctx.fillRect(vx0, cy - ROAD_W / 2 - 13, vx1 - vx0, ROAD_W + 26);
  }
  ctx.fillStyle = '#3a3f47';
  for (const cx of ROADS_X) ctx.fillRect(cx - ROAD_W / 2, vy0, ROAD_W, vy1 - vy0);
  for (const cy of ROADS_Y) ctx.fillRect(vx0, cy - ROAD_W / 2, vx1 - vx0, ROAD_W);
  ctx.fillStyle = 'rgba(245,246,250,0.5)';
  for (const cx of ROADS_X) {
    ctx.fillRect(cx - ROAD_W / 2 + 3, vy0, 3, vy1 - vy0);
    ctx.fillRect(cx + ROAD_W / 2 - 6, vy0, 3, vy1 - vy0);
  }
  for (const cy of ROADS_Y) {
    ctx.fillRect(vx0, cy - ROAD_W / 2 + 3, vx1 - vx0, 3);
    ctx.fillRect(vx0, cy + ROAD_W / 2 - 6, vx1 - vx0, 3);
  }
  ctx.fillStyle = 'rgba(247,209,84,0.85)';
  for (const cx of ROADS_X) {
    for (let y = Math.floor(vy0 / 52) * 52; y < vy1; y += 52) ctx.fillRect(cx - 2, y, 4, 28);
  }
  for (const cy of ROADS_Y) {
    for (let x = Math.floor(vx0 / 52) * 52; x < vx1; x += 52) ctx.fillRect(x, cy - 2, 28, 4);
  }

  // Piers and the marina boat.
  for (const pier of city.piers) {
    ctx.fillStyle = '#a87f4f';
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.strokeStyle = 'rgba(90,60,25,0.55)';
    ctx.lineWidth = 2;
    for (let x = pier.x + 22; x < pier.x + pier.w; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, pier.y + 4); ctx.lineTo(x, pier.y + pier.h - 4); ctx.stroke();
    }
    ctx.strokeStyle = '#7c5a30';
    ctx.strokeRect(pier.x, pier.y, pier.w, pier.h);
  }
  ctx.save();
  ctx.translate(3812, 950);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-52, 0); ctx.lineTo(30, -16); ctx.lineTo(58, 0); ctx.lineTo(30, 16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0fb9b1';
  ctx.fillRect(-18, -8, 42, 16);
  ctx.fillStyle = '#263238';
  ctx.fillRect(2, -5, 16, 10);
  ctx.restore();

  // Pay 'n Spray bay.
  ctx.fillStyle = '#7ea8e0';
  ctx.fillRect(SPRAY_BAY.x, SPRAY_BAY.y, SPRAY_BAY.w, SPRAY_BAY.h);
  ctx.strokeStyle = '#f5f6fa';
  ctx.lineWidth = 3;
  ctx.strokeRect(SPRAY_BAY.x + 3, SPRAY_BAY.y + 3, SPRAY_BAY.w - 6, SPRAY_BAY.h - 6);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 17px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText("PAY 'N SPRAY", SPRAY_BAY.x + SPRAY_BAY.w / 2, SPRAY_BAY.y + SPRAY_BAY.h / 2 + 6);

  // Buildings: pavement, soft shadow, roof, parapet and roof clutter.
  city.buildings.forEach((b, i) => {
    if (!inView(b.x, b.y, b.w + 30, b.h + 30)) return;
    ctx.fillStyle = '#ddd6c2';
    ctx.fillRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    ctx.fillStyle = 'rgba(30,40,30,0.20)';
    ctx.fillRect(b.x + b.height * 0.5, b.y + b.height * 0.62, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(90,70,50,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    const ax = b.x + 12 + hash(i) * Math.max(4, b.w - 44);
    const ay = b.y + 12 + hash(i + 500) * Math.max(4, b.h - 44);
    ctx.fillRect(ax, ay, 20, 14);
    if (b.w > 130 && b.h > 110) ctx.fillRect(b.x + b.w - 40, b.y + b.h - 34, 24, 16);
  });

  // Palms and props.
  for (const palm of city.palms) {
    if (!inView(palm.x - 30, palm.y - 30, 60, 60)) continue;
    const s = palm.s;
    ctx.fillStyle = 'rgba(30,60,30,0.20)';
    ctx.beginPath(); ctx.ellipse(palm.x + 5, palm.y + 7, 15 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a6b46';
    ctx.lineWidth = 3.5 * s;
    ctx.beginPath(); ctx.moveTo(palm.x, palm.y + 8); ctx.lineTo(palm.x + 2, palm.y - 4); ctx.stroke();
    ctx.fillStyle = '#2e9e5b';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + palm.x * 0.01;
      ctx.beginPath();
      ctx.ellipse(palm.x + 2 + Math.cos(a) * 10 * s, palm.y - 5 + Math.sin(a) * 6 * s, 8.5 * s, 4.2 * s, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#43b96d';
    ctx.beginPath(); ctx.arc(palm.x + 2, palm.y - 5, 5.5 * s, 0, Math.PI * 2); ctx.fill();
  }
  for (const prop of city.props) {
    if (!inView(prop.x - 10, prop.y - 10, 20, 20)) continue;
    if (prop.kind === 'lamp') {
      ctx.fillStyle = '#546e7a';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,241,160,0.5)';
      ctx.beginPath(); ctx.arc(prop.x, prop.y, 6.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#d94f3d';
      rr(ctx, prop.x - 3.5, prop.y - 5, 7, 10, 2.5);
      ctx.fill();
    }
  }

  // Story crates at the depot.
  for (const crate of world.crates) {
    if (!crate.alive) continue;
    ctx.fillStyle = '#b07f3f';
    ctx.fillRect(crate.x - 14, crate.y - 14, 28, 28);
    ctx.strokeStyle = '#7c5a30';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(crate.x - 14, crate.y - 14, 28, 28);
    ctx.beginPath();
    ctx.moveTo(crate.x - 14, crate.y - 14); ctx.lineTo(crate.x + 14, crate.y + 14);
    ctx.moveTo(crate.x + 14, crate.y - 14); ctx.lineTo(crate.x - 14, crate.y + 14);
    ctx.stroke();
  }
}

function drawFigure(ctx, x, y, angle, bodyColor, opts = {}) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x, y + 5, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = opts.headColor || '#f1c27d';
  ctx.beginPath(); ctx.arc(x, y, 5.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle) * 11, y + Math.sin(angle) * 11);
  ctx.stroke();
  if (opts.badge) {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(x - 4, y - 4, 2.4, 0, Math.PI * 2); ctx.fill();
  }
}

function drawCar(ctx, world, car) {
  const spec = CAR_TYPES[car.model];
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(3, 6, spec.w * 0.58, spec.h * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(car.angle);
  // Wheels.
  ctx.fillStyle = '#16181c';
  const wx = spec.w / 2 - 9;
  const wy = spec.h / 2 - 2;
  ctx.fillRect(-wx - 4, -wy - 3, 9, 5);
  ctx.fillRect(wx - 5, -wy - 3, 9, 5);
  ctx.fillRect(-wx - 4, wy - 2, 9, 5);
  ctx.fillRect(wx - 5, wy - 2, 9, 5);
  // Body.
  ctx.fillStyle = car.dead ? '#4a4a4a' : car.color;
  rr(ctx, -spec.w / 2, -spec.h / 2, spec.w, spec.h, 6);
  ctx.fill();
  // Cabin and glass.
  ctx.fillStyle = 'rgba(24,34,40,0.88)';
  rr(ctx, -spec.w * 0.16, -spec.h * 0.36, spec.w * 0.4, spec.h * 0.72, 3);
  ctx.fill();
  ctx.fillStyle = car.dead ? '#333' : car.color;
  rr(ctx, -spec.w * 0.08, -spec.h * 0.28, spec.w * 0.22, spec.h * 0.56, 2);
  ctx.fill();
  if (car.model === 'police') {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-spec.w * 0.3, -spec.h / 2, spec.w * 0.2, spec.h);
    const flash = Math.floor(world.time * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3b30' : '#5a1210';
    ctx.fillRect(-4, -spec.h * 0.3, 8, spec.h * 0.28);
    ctx.fillStyle = flash ? '#28324a' : '#3d7bd9';
    ctx.fillRect(-4, spec.h * 0.04, 8, spec.h * 0.28);
  }
  if (car.kind === 'mission') {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-spec.w / 2 + 3, -2, spec.w - 6, 4);
  }
  ctx.restore();
  if (car.kind === 'mission') {
    // A gold ring so the target car reads from a distance.
    ctx.strokeStyle = 'rgba(255,210,63,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(car.x, car.y, 36 + Math.sin(world.time * 5) * 3, 0, Math.PI * 2); ctx.stroke();
  }
}

const PICKUP_STYLE = {
  cash: { bg: '#2e9e5b', glyph: '$', fg: '#ffffff' },
  health: { bg: '#ffffff', glyph: '+', fg: '#d94f3d' },
  ammo: { bg: '#37474f', glyph: 'A', fg: '#ffb74d' },
  armour: { bg: '#3d7bd9', glyph: 'S', fg: '#ffffff' },
  star: { bg: '#f7b731', glyph: '', fg: '#ffffff' },
};

function drawPickups(ctx, world) {
  for (const pk of world.pickups) {
    if (!pk.active) continue;
    const bob = Math.sin(world.time * 3.4 + pk.x * 0.05) * 3;
    const style = PICKUP_STYLE[pk.type];
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(pk.x, pk.y + 8, 11, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = style.bg;
    ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (pk.type === 'star') {
      ctx.fillStyle = '#ffffff';
      star(ctx, pk.x, pk.y + bob, 6.5, true);
    } else {
      ctx.fillStyle = style.fg;
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(style.glyph, pk.x, pk.y + bob + 0.5);
      ctx.textBaseline = 'alphabetic';
    }
  }
  const m = world.mission;
  if (m && m.index === 4 && m.stage === 0) {
    for (const bag of m.bags) {
      if (bag.taken) continue;
      const bob = Math.sin(world.time * 3.4 + bag.x * 0.05) * 3;
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath(); ctx.arc(bag.x, bag.y + bob, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', bag.x, bag.y + bob);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

function drawMarker(ctx, world, camX, camY) {
  const t = missionTarget(world);
  if (!t || world.over) return;
  const pulse = 0.72 + Math.sin(world.time * 5) * 0.28;
  const grad = ctx.createLinearGradient(0, t.y - 190, 0, t.y);
  grad.addColorStop(0, 'rgba(255,210,63,0)');
  grad.addColorStop(1, `rgba(255,210,63,${0.4 * pulse})`);
  ctx.fillStyle = grad;
  ctx.fillRect(t.x - 13, t.y - 190, 26, 190);
  ctx.strokeStyle = `rgba(255,210,63,${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(t.x, t.y, 26 + Math.sin(world.time * 5) * 4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.save();
  ctx.translate(t.x, t.y - 34 + Math.sin(world.time * 5) * 4);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-8, -8, 16, 16);
  ctx.restore();
  // Off-screen direction arrow at the view edge.
  const dx = t.x - camX;
  const dy = t.y - camY;
  if (Math.abs(dx) > VIEW_W / 2 - 40 || Math.abs(dy) > VIEW_H / 2 - 40) {
    const a = Math.atan2(dy, dx);
    const ex = camX + clamp(dx, -VIEW_W / 2 + 46, VIEW_W / 2 - 46);
    const ey = camY + clamp(dy, -VIEW_H / 2 + 46, VIEW_H / 2 - 46);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(255,210,63,0.92)';
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawEntities(ctx, world) {
  drawPickups(ctx, world);
  const p = world.player;

  if (world.driver && world.mission && world.mission.index === 3) {
    drawFigure(ctx, world.driver.x, world.driver.y, -Math.PI / 2, '#f5f6fa', { headColor: '#8d6e63' });
  }
  for (const ped of world.peds) {
    if (ped.state === 'down') {
      ctx.save();
      ctx.globalAlpha = clamp(ped.downT / 1.5, 0.2, 1);
      ctx.translate(ped.x, ped.y);
      ctx.rotate(1.25);
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f1c27d';
      ctx.beginPath(); ctx.arc(13, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      drawFigure(ctx, ped.x, ped.y, ped.angle, ped.color);
    }
  }
  for (const cop of world.cops) {
    if (cop.state === 'down') {
      ctx.save();
      ctx.globalAlpha = clamp(cop.downT / 1.5, 0.2, 1);
      ctx.translate(cop.x, cop.y);
      ctx.rotate(1.25);
      ctx.fillStyle = '#1f3a93';
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      const a = Math.atan2(p.y - cop.y, p.x - cop.x);
      drawFigure(ctx, cop.x, cop.y, a, '#1f3a93', { badge: true });
    }
  }
  for (const car of world.cars) drawCar(ctx, world, car);

  if (!p.inCar && !world.over) {
    // The player: teal shirt, gun toward the aim.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 5, 11, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0fb9b1';
    ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#20242c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * 8, p.y + Math.sin(p.angle) * 8);
    ctx.lineTo(p.x + Math.cos(p.angle) * 21, p.y + Math.sin(p.angle) * 21);
    ctx.stroke();
    if (p.armour > 0) {
      ctx.strokeStyle = 'rgba(90,162,232,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 13.5, 0, Math.PI * 2); ctx.stroke();
    }
    const near = nearestEnterableCar(world);
    if (near) {
      ctx.font = `700 13px ${FONT}`;
      ctx.textAlign = 'center';
      const label = near.kind === 'traffic' ? 'E — STEAL' : 'E — ENTER';
      const w = ctx.measureText(label).width + 18;
      ctx.fillStyle = 'rgba(10,20,26,0.78)';
      rr(ctx, near.x - w / 2, near.y - 52, w, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(label, near.x, near.y - 37);
    }
  }

  for (const b of world.bullets) {
    ctx.strokeStyle = b.from === 'player' ? 'rgba(255,245,157,0.95)' : 'rgba(255,171,145,0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const pt of world.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(8,18,24,0.62)';
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = color;
    rr(ctx, x + 2, y + 2, Math.max(h - 4, (w - 4) * clamp(frac, 0, 1)), h - 4, (h - 4) / 2);
    ctx.fill();
  }
  if (label) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${h - 3}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 8, y + h - 3.5);
  }
}

function drawMinimap(ctx, world) {
  const MW = 224;
  const MH = 168;
  const MX = 14;
  const MY = VIEW_H - MH - 14;
  const s = MW / WORLD_W;
  ctx.fillStyle = 'rgba(10,26,34,0.85)';
  rr(ctx, MX, MY, MW, MH, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  rr(ctx, MX, MY, MW, MH, 8);
  ctx.clip();
  ctx.fillStyle = '#2fa8c9';
  ctx.fillRect(MX + WATER_X * s, MY, (WORLD_W - WATER_X) * s, MH);
  ctx.fillStyle = '#ecd9a0';
  ctx.fillRect(MX + BEACH_X * s, MY, (WATER_X - BEACH_X) * s, MH);
  ctx.fillStyle = 'rgba(205,215,225,0.55)';
  for (const cx of ROADS_X) ctx.fillRect(MX + cx * s - 3, MY, 6, MH);
  for (const cy of ROADS_Y) ctx.fillRect(MX, MY + cy * s - 3, MW, 6);
  const t = missionTarget(world);
  if (t && !world.over) {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(MX + t.x * s, MY + t.y * s, 4 + Math.sin(world.time * 5) * 1.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#ff5252';
  for (const car of world.cars) {
    if (car.kind !== 'police' || car.dead) continue;
    ctx.beginPath(); ctx.arc(MX + car.x * s, MY + car.y * s, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#ffab91';
  for (const cop of world.cops) {
    if (cop.state === 'down') continue;
    ctx.beginPath(); ctx.arc(MX + cop.x * s, MY + cop.y * s, 1.9, 0, Math.PI * 2); ctx.fill();
  }
  const p = world.player;
  ctx.save();
  ctx.translate(MX + p.x * s, MY + p.y * s);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6.5, 0); ctx.lineTo(-4.5, -4); ctx.lineTo(-4.5, 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  rr(ctx, MX, MY, MW, MH, 8);
  ctx.stroke();
}

function formatTime(sec) {
  const t = Math.max(0, Math.ceil(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function drawHUD(ctx, world, ui) {
  const p = world.player;
  const hpFrac = p.hp / 100;
  bar(ctx, 16, 16, 212, 17, hpFrac, hpFrac > 0.5 ? '#58c24e' : hpFrac > 0.25 ? '#f7b731' : '#e74c3c', 'HP');
  if (p.armour > 0) bar(ctx, 16, 39, 150, 11, p.armour / 100, '#5aa2e8', '');

  ctx.textAlign = 'right';
  ctx.fillStyle = '#a5e8a1';
  ctx.font = `800 27px ${FONT}`;
  ctx.fillText(`$${p.cash}`, VIEW_W - 18, 40);
  const stars = starsOf(world);
  for (let i = 0; i < 5; i++) {
    const cx = VIEW_W - 34 - (4 - i) * 30;
    if (i < stars) {
      ctx.fillStyle = '#ffd23f';
      star(ctx, cx, 66, 12.5, true);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      star(ctx, cx, 66, 12.5, true);
    }
  }

  // Objective banner.
  const m = world.mission;
  const obj = objectiveText(world);
  if (m && obj && !world.over) {
    const t = missionTarget(world);
    const distText = t ? ` · ${Math.round(Math.hypot(t.x - p.x, t.y - p.y) / 10)}m` : '';
    const timerText = m.timer !== null && m.timer !== undefined ? ` · ${formatTime(m.timer)}` : '';
    const text = `${MISSIONS[m.index].name} — ${obj}${distText}${timerText}`;
    ctx.font = `700 16.5px ${FONT}`;
    const w = ctx.measureText(text).width + 34;
    ctx.fillStyle = 'rgba(10,20,26,0.74)';
    rr(ctx, VIEW_W / 2 - w / 2, 14, w, 32, 9);
    ctx.fill();
    ctx.fillStyle = m.timer !== null && m.timer !== undefined && m.timer < 20 ? '#ff8a80' : '#ffd23f';
    ctx.textAlign = 'center';
    ctx.fillText(text, VIEW_W / 2, 36);
  }

  // Weapon / car state, bottom right.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText('PISTOL', VIEW_W - 18, VIEW_H - 52);
  ctx.fillStyle = p.ammo > 0 ? '#ffffff' : '#ff8a80';
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(`${p.ammo}`, VIEW_W - 18, VIEW_H - 20);
  if (p.inCar) {
    const spec = CAR_TYPES[p.inCar.model];
    bar(ctx, VIEW_W - 182, VIEW_H - 84, 164, 12, p.inCar.hp / spec.hp, '#7ec8f7', 'CAR');
  }
  if (ui.muted) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('MUTED (M)', 16, 66);
  }

  // Busted meter.
  if (p.busted > 0.02 && !world.over) {
    const w = 260;
    ctx.fillStyle = 'rgba(8,18,24,0.66)';
    rr(ctx, VIEW_W / 2 - w / 2, VIEW_H - 108, w, 20, 8);
    ctx.fill();
    ctx.fillStyle = '#e74c3c';
    rr(ctx, VIEW_W / 2 - w / 2 + 3, VIEW_H - 105, (w - 6) * clamp(p.busted, 0, 1), 14, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', VIEW_W / 2, VIEW_H - 94);
  }

  // Toasts (Mara's phone, warnings).
  const toasts = world.toasts.slice(-2);
  toasts.forEach((toast, i) => {
    const alpha = clamp((toast.until - world.time) / 0.8, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.font = `600 15px ${FONT}`;
    const w = Math.min(VIEW_W - 80, ctx.measureText(toast.text).width + 32);
    const y = VIEW_H - 148 - (toasts.length - 1 - i) * 38;
    ctx.fillStyle = 'rgba(10,24,30,0.82)';
    rr(ctx, VIEW_W / 2 - w / 2, y, w, 30, 8);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(toast.text, VIEW_W / 2, y + 20, w - 20);
    ctx.globalAlpha = 1;
  });

  drawMinimap(ctx, world);
}

function drawTitle(ctx, world, ui) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, 'rgba(6,32,40,0.80)');
  grad.addColorStop(0.55, 'rgba(6,32,40,0.30)');
  grad.addColorStop(1, 'rgba(6,32,40,0.62)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fdfdf8';
  ctx.font = `900 86px ${FONT}`;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 5;
  ctx.fillText('PALM CITY HEAT', VIEW_W / 2, 238);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(VIEW_W / 2 - 190, 262, 380, 5);
  ctx.fillStyle = '#e8f6f3';
  ctx.font = `600 21px ${FONT}`;
  ctx.fillText('An original top-down open-world crime story', VIEW_W / 2, 302);
  ctx.font = `800 24px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('ENTER — NEW GAME', VIEW_W / 2, 402);
  if (ui.saveExists) {
    ctx.fillStyle = '#a5e8a1';
    ctx.fillText('C — CONTINUE', VIEW_W / 2, 440);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 16.5px ${FONT}`;
  ctx.fillText('WASD / Arrows — move · Mouse — aim · Click / Space — shoot · E — enter or steal a car · Shift — sprint', VIEW_W / 2, 690);
  ctx.fillText('Esc / P — pause · M — mute · Five jobs for Mara Voss stand between you and the boat out', VIEW_W / 2, 716);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText('Built for the make.fun "Make GTA 6" bounty — every name and place in Palm City is original', VIEW_W / 2, 762);
}

function drawOver(ctx, world, ui) {
  const kind = ui.overKind;
  ctx.fillStyle = kind === 'wasted' ? 'rgba(60,8,8,0.66)' : kind === 'busted' ? 'rgba(8,20,60,0.66)' : 'rgba(50,40,4,0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = `900 76px ${FONT}`;
  ctx.fillStyle = kind === 'wasted' ? '#ff5252' : kind === 'busted' ? '#7ec8f7' : '#ffd23f';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.fillText(kind === 'wasted' ? 'WASTED' : kind === 'busted' ? 'BUSTED' : 'STORY COMPLETE', VIEW_W / 2, 300);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  const s = world.stats;
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 21px ${FONT}`;
  ctx.fillText(
    `Cash earned $${s.earned} · Missions ${world.missionIndex}/5 · Cars stolen ${s.stolen} · Shots fired ${s.shots}`,
    VIEW_W / 2, 366,
  );
  ctx.font = `800 22px ${FONT}`;
  ctx.fillStyle = '#ffe9a8';
  if (kind === 'complete') ctx.fillText('C — KEEP ROAMING · ENTER — NEW GAME', VIEW_W / 2, 436);
  else ctx.fillText('ENTER — TRY AGAIN', VIEW_W / 2, 436);
}

function drawPause(ctx) {
  ctx.fillStyle = 'rgba(6,20,26,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 58px ${FONT}`;
  ctx.fillText('PAUSED', VIEW_W / 2, 330);
  ctx.font = `700 19px ${FONT}`;
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('Esc / P — RESUME', VIEW_W / 2, 386);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `600 15.5px ${FONT}`;
  ctx.fillText('WASD move · Mouse aim · Click/Space shoot · E enter/steal car · Shift sprint · M mute', VIEW_W / 2, 424);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    draw(world, ui) {
      ctx.fillStyle = '#12303c';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const focus = world.shotCam || world.player;
      const camX = clamp(focus.x, VIEW_W / 2, WORLD_W - VIEW_W / 2);
      const camY = clamp(focus.y, VIEW_H / 2, WORLD_H - VIEW_H / 2);
      const sx = Math.sin(world.time * 91.7) * world.shake;
      const sy = Math.cos(world.time * 83.3) * world.shake * 0.7;
      ctx.save();
      ctx.translate(VIEW_W / 2 - camX + sx, VIEW_H / 2 - camY + sy);
      drawWorld(ctx, world, camX, camY);
      drawMarker(ctx, world, camX, camY);
      drawEntities(ctx, world);
      ctx.restore();
      if (ui.mode === 'title') {
        drawTitle(ctx, world, ui);
      } else {
        drawHUD(ctx, world, ui);
        if (ui.mode === 'pause') drawPause(ctx);
        if (ui.mode === 'over') drawOver(ctx, world, ui);
      }
    },
  };
}
