// render.js — everything Palm City Heat draws: the city from the camera's
// eye, the cars and people in it, and the HUD layered on top (health, wanted
// stars, cash, mission banner, phone toasts, minimap, menus). Pure canvas
// 2D, no assets — every shape is drawn from the world state each frame.

import { dist } from './random.js';
import {
  VIEW_W, VIEW_H, WORLD_W, WORLD_H, BEACH_X, WATER_X, ROAD_W,
  PALETTE, HEAT_PER_STAR,
} from './config.js';
import { starsForHeat, missionTarget, MISSIONS } from './world.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
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

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? line + ' ' + w : w;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = trial;
  }
  if (line) lines.push(line);
  return lines;
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function drawGame(ctx, state) {
  const p = state.player;
  // Camera: follow the player, clamped to the world, plus impact shake.
  const shX = state.shake ? (Math.sin(state.time * 71) * state.shake) : 0;
  const shY = state.shake ? (Math.cos(state.time * 83) * state.shake) : 0;
  const focusX = state.camera ? state.camera.x : p.x;
  const focusY = state.camera ? state.camera.y : p.y;
  const camX = clamp(focusX - VIEW_W / 2 + shX, 0, WORLD_W - VIEW_W);
  const camY = clamp(focusY - VIEW_H / 2 + shY, 0, WORLD_H - VIEW_H);
  state._cam = { x: camX, y: camY };

  ctx.save();
  ctx.translate(-camX, -camY);
  drawWorld(ctx, state);
  ctx.restore();

  if (state.mode === 'title') drawTitle(ctx, state);
  else {
    drawHud(ctx, state);
    if (state.mode === 'paused') drawCenterPanel(ctx, 'PAUSED', ['Esc / P — back to the street'], state);
    if (state.mode === 'busted') drawEnd(ctx, state, 'BUSTED', '#7fb0e6', 'The Palm City PD sends its regards. Fine: $150.');
    if (state.mode === 'wasted') drawEnd(ctx, state, 'WASTED', '#e0483e', 'You wake up outside Mercy Hospital. The city shrugs.');
    if (state.mode === 'complete') drawEnd(ctx, state, 'STORY COMPLETE', '#f4b942', 'Five jobs, one legend. Palm City is yours to roam.');
  }
}

// ------------------------------------------------------------ world view

function drawWorld(ctx, state) {
  const city = state.city;
  const t = state.time;

  // Land, beach and sea.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = PALETTE.grassDark;
  for (let x = 0; x < BEACH_X; x += 260) {
    for (let y = ((x / 260) % 2) * 130; y < WORLD_H; y += 260) {
      ctx.fillRect(x, y, 130, 130);
    }
  }
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(BEACH_X, 0, WATER_X - BEACH_X + 40, WORLD_H);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const wx = WATER_X + 30 + ((i * 173) % (WORLD_W - WATER_X - 70));
    const wy = (i * 389 + Math.sin(t * 0.7 + i) * 12) % WORLD_H;
    ctx.beginPath();
    ctx.arc(wx, wy, 16, 0.3, Math.PI - 0.6);
    ctx.stroke();
  }

  // Sidewalk slabs under the roads, then the tarmac itself.
  const half = ROAD_W / 2;
  ctx.fillStyle = PALETTE.sidewalk;
  for (const ax of city.avenues) ctx.fillRect(ax - half - 14, 0, ROAD_W + 28, WORLD_H);
  for (const sy of city.streets) ctx.fillRect(0, sy - half - 14, BEACH_X + 30, ROAD_W + 28);
  ctx.fillStyle = PALETTE.asphalt;
  for (const ax of city.avenues) ctx.fillRect(ax - half, 0, ROAD_W, WORLD_H);
  for (const sy of city.streets) ctx.fillRect(0, sy - half, BEACH_X + 30, ROAD_W);
  // Lane dashes.
  ctx.fillStyle = PALETTE.lane;
  for (const ax of city.avenues) {
    for (let y = 24; y < WORLD_H; y += 64) ctx.fillRect(ax - 2, y, 4, 34);
  }
  for (const sy of city.streets) {
    for (let x = 24; x < BEACH_X; x += 64) ctx.fillRect(x, sy - 2, 34, 4);
  }

  // The old airstrip: a grey ribbon in the south-west.
  ctx.fillStyle = '#8d8d94';
  ctx.fillRect(270, 2578, 600, 84);
  ctx.fillStyle = '#e8e4d2';
  for (let x = 290; x < 850; x += 60) ctx.fillRect(x, 2616, 30, 6);

  drawPlaces(ctx, state);

  // Buildings: soft shadow, warm roof, a lighter inset slab.
  for (const b of city.buildings) {
    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(b.x + 9, b.y + 11, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(34,48,60,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    ctx.fillStyle = 'rgba(34,48,60,0.18)';
    const unit = 26;
    for (let wx = b.x + 14; wx < b.x + b.w - 12; wx += unit) {
      for (let wy = b.y + 14; wy < b.y + b.h - 12; wy += unit) {
        ctx.fillRect(wx, wy, 8, 8);
      }
    }
  }

  // Palms and lamps.
  for (const palm of city.palms) drawPalm(ctx, palm.x, palm.y);
  ctx.fillStyle = '#3c4652';
  for (const prop of city.props) {
    ctx.fillRect(prop.x - 2, prop.y - 2, 4, 4);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(prop.x, prop.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3c4652';
  }

  drawPickups(ctx, state);

  // Mission crates and cash bags.
  for (const c of state.crates) {
    if (c.gone) continue;
    ctx.fillStyle = '#9a6b3f';
    ctx.fillRect(c.x - 17, c.y - 17, 34, 34);
    ctx.strokeStyle = '#6e4a26';
    ctx.lineWidth = 3;
    ctx.strokeRect(c.x - 17, c.y - 17, 34, 34);
    ctx.beginPath();
    ctx.moveTo(c.x - 17, c.y - 17);
    ctx.lineTo(c.x + 17, c.y + 17);
    ctx.moveTo(c.x + 17, c.y - 17);
    ctx.lineTo(c.x - 17, c.y + 17);
    ctx.stroke();
  }
  for (const bag of state.bags) {
    if (bag.got) continue;
    drawMarker(ctx, state, bag.x, bag.y);
    ctx.fillStyle = '#3f7a3a';
    roundRect(ctx, bag.x - 11, bag.y - 9, 22, 18, 5);
    ctx.fill();
    ctx.fillStyle = '#fdf6e3';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', bag.x, bag.y + 5);
  }

  // Objective beacon.
  const target = missionTarget(state);
  if (target && state.mode === 'playing') drawMarker(ctx, state, target.x, target.y);

  // People, then cars, then the player.
  for (const ped of state.peds) drawPed(ctx, ped, state);
  for (const cop of state.cops) drawCop(ctx, cop);
  for (const car of state.cars) drawCar(ctx, car, state);
  if (!state.player.carId) drawPlayer(ctx, state);

  // Tracers and bursts.
  for (const e of state.effects) {
    const a = Math.max(0, e.ttl / e.max);
    if (e.kind === 'tracer') {
      ctx.strokeStyle = 'rgba(255, 230, 150,' + (a * 0.9) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
    } else if (e.kind === 'burst') {
      ctx.strokeStyle = 'rgba(230, 140, 60,' + a + ')';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(e.x1, e.y1, (1 - a) * 34 + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawPlaces(ctx, state) {
  const P = state.city.places;
  // Marina pier reaching into the water.
  ctx.fillStyle = '#a9805a';
  ctx.fillRect(3400, P.marina.y - 16, 190, 32);
  ctx.fillStyle = '#8a6845';
  for (let x = 3410; x < 3580; x += 24) ctx.fillRect(x, P.marina.y - 16, 4, 32);
  // A moored boat at the pier's end.
  ctx.fillStyle = '#e8e4da';
  ctx.beginPath();
  ctx.ellipse(3620, P.marina.y, 34, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4ea5a0';
  ctx.fillRect(3606, P.marina.y - 8, 22, 9);

  // Docks: crates stacks and a working pad.
  ctx.fillStyle = '#b9ac93';
  ctx.fillRect(P.docks.x - 70, P.docks.y - 60, 150, 120);
  ctx.fillStyle = '#7a8a99';
  ctx.fillRect(P.docks.x - 55, P.docks.y - 45, 30, 30);
  ctx.fillRect(P.docks.x - 15, P.docks.y - 45, 30, 30);
  ctx.fillRect(P.docks.x - 35, P.docks.y - 12, 30, 30);

  // Pay 'n Spray bay.
  ctx.fillStyle = '#5b84ae';
  roundRect(ctx, P.spray.x - 46, P.spray.y - 34, 92, 68, 8);
  ctx.fill();
  ctx.fillStyle = '#fdf6e3';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("PAY 'N", P.spray.x, P.spray.y - 4);
  ctx.fillText('SPRAY', P.spray.x, P.spray.y + 12);

  // Hospital and precinct pads with signs.
  ctx.fillStyle = '#e8e4da';
  ctx.fillRect(P.hospital.x - 40, P.hospital.y - 30, 80, 60);
  ctx.fillStyle = '#e0483e';
  ctx.fillRect(P.hospital.x - 5, P.hospital.y - 16, 10, 32);
  ctx.fillRect(P.hospital.x - 16, P.hospital.y - 5, 32, 10);
  ctx.fillStyle = '#d8d2c0';
  ctx.fillRect(P.precinct.x - 40, P.precinct.y - 30, 80, 60);
  ctx.fillStyle = '#274b9f';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('PD', P.precinct.x, P.precinct.y + 4);
}

function drawPalm(ctx, x, y) {
  ctx.strokeStyle = 'rgba(40,35,20,0.2)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 5);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.strokeStyle = '#8a6845';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y + 6);
  ctx.quadraticCurveTo(x + 2, y - 4, x + 5, y - 10);
  ctx.stroke();
  ctx.strokeStyle = '#3e7d3a';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(x + 5, y - 10);
    ctx.quadraticCurveTo(
      x + 5 + Math.cos(a) * 13, y - 10 + Math.sin(a) * 9 - 4,
      x + 5 + Math.cos(a) * 20, y - 10 + Math.sin(a) * 13 + 4,
    );
    ctx.stroke();
  }
}

function drawMarker(ctx, state, x, y) {
  const pulse = 1 + Math.sin(state.time * 5) * 0.15;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(244,185,66,0.2)';
  ctx.beginPath();
  ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.moveTo(x, y - 58 - Math.sin(state.time * 5) * 5);
  ctx.lineTo(x - 10, y - 78 - Math.sin(state.time * 5) * 5);
  ctx.lineTo(x + 10, y - 78 - Math.sin(state.time * 5) * 5);
  ctx.closePath();
  ctx.fill();
}

function drawPickups(ctx, state) {
  for (const pk of state.pickups) {
    if (pk.respawnT > 0) continue;
    const bob = Math.sin(state.time * 3 + pk.id) * 3;
    const y = pk.y + bob;
    ctx.fillStyle = 'rgba(40,35,20,0.25)';
    ctx.beginPath();
    ctx.ellipse(pk.x, pk.y + 12, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#3f9e4d';
      roundRect(ctx, pk.x - 11, y - 8, 22, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#fdf6e3';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('$', pk.x, y + 4);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#fdf6e3';
      roundRect(ctx, pk.x - 11, y - 11, 22, 22, 4);
      ctx.fill();
      ctx.fillStyle = '#e0483e';
      ctx.fillRect(pk.x - 3, y - 7, 6, 14);
      ctx.fillRect(pk.x - 7, y - 3, 14, 6);
    } else if (pk.kind === 'armour') {
      ctx.fillStyle = '#4ea5a0';
      roundRect(ctx, pk.x - 10, y - 11, 20, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#dff3f1';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('A', pk.x, y + 4);
    } else if (pk.kind === 'bribe') {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('★', pk.x, y + 7);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#d97b29';
      roundRect(ctx, pk.x - 10, y - 8, 20, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#fdf6e3';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillText('AM', pk.x, y + 3);
    }
  }
}

function drawCar(ctx, car, state) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const spec = { sedan: [46, 22], taxi: [46, 22], sports: [48, 22], truck: [56, 26], police: [47, 22] }[car.kind];
  const w = spec[0];
  const h = spec[1];
  ctx.fillStyle = 'rgba(40,35,20,0.3)';
  roundRect(ctx, -w / 2 + 3, -h / 2 + 5, w, h, 7);
  ctx.fill();
  const wreck = car.hp <= 0;
  ctx.fillStyle = wreck ? '#4c4c4c' : car.color;
  if (car.kind === 'police') ctx.fillStyle = wreck ? '#4c4c4c' : '#2b3a4a';
  roundRect(ctx, -w / 2, -h / 2, w, h, 7);
  ctx.fill();
  if (car.kind === 'taxi' && !wreck) {
    ctx.fillStyle = '#f4b942';
    roundRect(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fill();
  }
  if (car.kind === 'police' && !wreck) {
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(-8, -h / 2, 18, h);
    // Light bar, flashing with the clock.
    const phase = Math.floor(state.time * 4) % 2 === 0;
    ctx.fillStyle = phase ? '#e0483e' : '#5b84ae';
    ctx.fillRect(-4, -7, 8, 6);
    ctx.fillStyle = phase ? '#5b84ae' : '#e0483e';
    ctx.fillRect(-4, 1, 8, 6);
  }
  // Cabin and glass.
  ctx.fillStyle = 'rgba(20,30,40,0.75)';
  roundRect(ctx, -w * 0.18, -h / 2 + 3, w * 0.34, h - 6, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,240,0.5)';
  ctx.fillRect(w * 0.13, -h / 2 + 4, 4, h - 8);
  // Headlights.
  ctx.fillStyle = '#ffedb5';
  ctx.fillRect(w / 2 - 3, -h / 2 + 3, 3, 5);
  ctx.fillRect(w / 2 - 3, h / 2 - 8, 3, 5);
  if (car.flashT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (car.flashT * 3) + ')';
    roundRect(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fill();
  }
  ctx.restore();

  if (wreck && car.hp > -40) {
    ctx.fillStyle = 'rgba(90,90,90,0.35)';
    const s = (state.time * 13 + car.id * 7) % 3;
    ctx.beginPath();
    ctx.arc(car.x, car.y - 14 - s * 7, 6 + s * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (car.gold) {
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼', car.x, car.y - 30 - Math.sin(state.time * 5) * 4);
  }
}

function drawFigure(ctx, x, y, angle, shirt, skin, phase, gunAngle) {
  ctx.fillStyle = 'rgba(40,35,20,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs scissor as they walk.
  ctx.strokeStyle = '#2e3440';
  ctx.lineWidth = 4;
  const sw = Math.sin(phase) * 6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle + 2.6) * 8 + Math.cos(angle) * sw * 0.4, y + Math.sin(angle + 2.6) * 8 + Math.sin(angle) * sw * 0.4);
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle - 2.6) * 8 - Math.cos(angle) * sw * 0.4, y + Math.sin(angle - 2.6) * 8 - Math.sin(angle) * sw * 0.4);
  ctx.stroke();
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3, 5, 0, Math.PI * 2);
  ctx.fill();
  if (gunAngle !== null && gunAngle !== undefined) {
    ctx.strokeStyle = '#22262c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(gunAngle) * 17, y + Math.sin(gunAngle) * 17);
    ctx.stroke();
  }
}

function drawPed(ctx, ped, state) {
  if (ped.mode === 'down') {
    const fade = clamp(ped.downT / 3, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, fade);
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.shirt;
    roundRect(ctx, -6, -13, 12, 26, 6);
    ctx.fill();
    ctx.fillStyle = '#e8b58e';
    ctx.beginPath();
    ctx.arc(0, -16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    void state;
    return;
  }
  drawFigure(ctx, ped.x, ped.y, ped.angle, ped.shirt, '#e8b58e', ped.walkPhase, null);
}

function drawCop(ctx, cop) {
  if (cop.mode === 'down') {
    ctx.save();
    ctx.translate(cop.x, cop.y);
    ctx.rotate(cop.angle + Math.PI / 2);
    ctx.fillStyle = '#274b9f';
    roundRect(ctx, -6, -13, 12, 26, 6);
    ctx.fill();
    ctx.restore();
    return;
  }
  drawFigure(ctx, cop.x, cop.y, cop.angle, '#274b9f', '#d9a06e', 0, cop.angle);
  ctx.fillStyle = '#1d3a7d';
  ctx.beginPath();
  ctx.arc(cop.x, cop.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(ctx, state) {
  const p = state.player;
  drawFigure(ctx, p.x, p.y, p.angle, '#0f766e', '#e8b58e', p.walkPhase, p.angle);
  // A small gold ring so the player reads at a glance.
  ctx.strokeStyle = 'rgba(244,185,66,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
  ctx.stroke();
}

// ------------------------------------------------------------ HUD & menus

function drawHud(ctx, state) {
  const p = state.player;
  const stars = starsForHeat(state.heat);

  // Top-left: health and armour.
  ctx.textAlign = 'left';
  bar(ctx, 18, 16, 210, 15, p.hp / 100, p.hp > 30 ? '#58b368' : '#e0483e', 'HP');
  if (p.armour > 0) bar(ctx, 18, 36, 210, 10, p.armour / 100, '#4ea5a0', '');
  // Weapon readout under the bars.
  ctx.fillStyle = 'rgba(24,32,40,0.72)';
  roundRect(ctx, 18, 54, 150, 30, 6);
  ctx.fill();
  ctx.fillStyle = '#fdf6e3';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('PISTOL', 28, 74);
  ctx.textAlign = 'right';
  ctx.fillText(p.reloadT > 0 ? '···' : p.mag + ' / ' + p.reserve, 158, 74);
  ctx.textAlign = 'left';

  // Top-right: cash and wanted stars.
  ctx.fillStyle = 'rgba(24,32,40,0.72)';
  roundRect(ctx, VIEW_W - 238, 16, 220, 58, 8);
  ctx.fill();
  ctx.fillStyle = '#7dd87d';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('$' + p.cash.toLocaleString('en-US'), VIEW_W - 30, 42);
  ctx.font = '19px system-ui, sans-serif';
  let starStr = '';
  for (let i = 0; i < 5; i++) starStr += i < stars ? '★' : '☆';
  ctx.fillStyle = stars > 0 ? PALETTE.gold : 'rgba(253,246,227,0.4)';
  ctx.fillText(starStr, VIEW_W - 30, 66);
  ctx.textAlign = 'left';

  // Mission banner, top centre.
  const m = state.mission;
  const target = missionTarget(state);
  if (m.active && target) {
    const distM = Math.round(dist(p.x, p.y, target.x, target.y) / 10);
    ctx.fillStyle = 'rgba(24,32,40,0.78)';
    roundRect(ctx, VIEW_W / 2 - 265, 14, 530, 56, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MISSION ' + (m.idx + 1) + ' — ' + MISSIONS[m.idx].name.toUpperCase(), VIEW_W / 2, 34);
    ctx.fillStyle = '#fdf6e3';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(target.text + '   ·   ' + distM + 'm', VIEW_W / 2, 57);
    if (m.timer !== null) {
      ctx.fillStyle = m.timer < 30 ? '#e0483e' : '#fdf6e3';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText('⏱ ' + fmtTime(m.timer), VIEW_W / 2, 88);
    }
    ctx.textAlign = 'left';
  }

  // Busted meter.
  if (state.bustedMeter > 0.02) {
    ctx.fillStyle = 'rgba(24,32,40,0.8)';
    roundRect(ctx, VIEW_W / 2 - 130, 110, 260, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#e0483e';
    roundRect(ctx, VIEW_W / 2 - 122, 126, 244 * clamp(state.bustedMeter, 0, 1), 10, 5);
    ctx.fill();
    ctx.fillStyle = '#fdf6e3';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', VIEW_W / 2, 122);
    ctx.textAlign = 'left';
  }
  if (state.sprayT > 0) {
    ctx.fillStyle = '#fdf6e3';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("PAY 'N SPRAY — hold still…", VIEW_W / 2, 130);
    ctx.textAlign = 'left';
  }

  drawToasts(ctx, state);
  drawMinimap(ctx, state);

  // Controls reminder, bottom centre.
  ctx.fillStyle = 'rgba(24,32,40,0.55)';
  roundRect(ctx, VIEW_W / 2 - 275, VIEW_H - 30, 550, 22, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(253,246,227,0.9)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WASD drive / walk · Mouse aim · Click / Space shoot · E enter car · Shift sprint · Esc pause · M mute' + (state.muted ? '  ·  MUTED' : ''), VIEW_W / 2, VIEW_H - 15);
  ctx.textAlign = 'left';
}

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(24,32,40,0.72)';
  roundRect(ctx, x - 4, y - 3, w + 8, h + 6, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
  if (label) {
    ctx.fillStyle = '#fdf6e3';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(label, x + 5, y + h - 4);
  }
}

function drawToasts(ctx, state) {
  let y = VIEW_H - 190;
  for (const toast of state.toasts) {
    ctx.font = '13px system-ui, sans-serif';
    const lines = wrapText(ctx, toast.text, 240);
    const h = 34 + lines.length * 16;
    ctx.fillStyle = 'rgba(20,26,34,0.88)';
    roundRect(ctx, 18, y - h, 272, h, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('📱 ' + toast.from.toUpperCase(), 30, y - h + 18);
    ctx.fillStyle = '#fdf6e3';
    ctx.font = '13px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, 30, y - h + 38 + i * 16));
    y -= h + 8;
  }
}

function drawMinimap(ctx, state) {
  const mw = 208;
  const mh = 156;
  const x0 = VIEW_W - mw - 16;
  const y0 = VIEW_H - mh - 40;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.fillStyle = 'rgba(24,38,48,0.88)';
  roundRect(ctx, x0 - 3, y0 - 3, mw + 6, mh + 6, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x0, y0, mw, mh, 6);
  ctx.clip();
  ctx.fillStyle = '#5d7a48';
  ctx.fillRect(x0, y0, mw, mh);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(x0 + WATER_X * sx, y0, (WORLD_W - WATER_X) * sx, mh);
  ctx.strokeStyle = 'rgba(253,246,227,0.55)';
  ctx.lineWidth = 2;
  for (const ax of state.city.avenues) {
    ctx.beginPath();
    ctx.moveTo(x0 + ax * sx, y0);
    ctx.lineTo(x0 + ax * sx, y0 + mh);
    ctx.stroke();
  }
  for (const sy2 of state.city.streets) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + sy2 * sy);
    ctx.lineTo(x0 + mw, y0 + sy2 * sy);
    ctx.stroke();
  }
  // Police blips flash blue/red.
  const phase = Math.floor(state.time * 3) % 2 === 0;
  for (const c of state.cars) {
    if (c.driver !== 'police') continue;
    ctx.fillStyle = phase ? '#e0483e' : '#7fb0e6';
    ctx.beginPath();
    ctx.arc(x0 + c.x * sx, y0 + c.y * sy, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of state.cops) {
    if (c.mode === 'down') continue;
    ctx.fillStyle = '#7fb0e6';
    ctx.beginPath();
    ctx.arc(x0 + c.x * sx, y0 + c.y * sy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const target = missionTarget(state);
  if (target) {
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(x0 + target.x * sx, y0 + target.y * sy, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#22303c';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  // Player arrow.
  const px = x0 + state.player.x * sx;
  const py = y0 + state.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(state.player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.6);
  ctx.lineTo(-5, 4.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawTitle(ctx, state) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, 'rgba(20,24,40,0.55)');
  grad.addColorStop(0.55, 'rgba(20,24,40,0.25)');
  grad.addColorStop(1, 'rgba(20,24,40,0.65)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 92px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.fillText('PALM CITY', VIEW_W / 2, 268);
  ctx.fillStyle = '#fdf6e3';
  ctx.fillText('HEAT', VIEW_W / 2, 362);
  ctx.shadowBlur = 0;
  ctx.font = 'italic 21px system-ui, sans-serif';
  ctx.fillStyle = '#ffe1a8';
  ctx.fillText('One city. Five jobs. No brakes.', VIEW_W / 2, 404);
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#fdf6e3';
  ctx.fillText('ENTER — Start new game', VIEW_W / 2, 486);
  if (state.hasSave) {
    ctx.fillText('C — Continue  (Mission ' + Math.min(5, (state.savedMission || 0) + 1) + ')', VIEW_W / 2, 522);
  }
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(253,246,227,0.85)';
  ctx.fillText('WASD / arrows — move & drive · Mouse — aim · Click / Space — shoot · E — enter / exit car', VIEW_W / 2, 580);
  ctx.fillText('Shift — sprint · Esc / P — pause · M — mute', VIEW_W / 2, 604);
  ctx.fillText('Help fixer Mara Voss run five jobs across a palm-lined coastal city.', VIEW_W / 2, 652);
  ctx.textAlign = 'left';
}

function drawCenterPanel(ctx, title, lines, state) {
  ctx.fillStyle = 'rgba(16,20,28,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fdf6e3';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText(title, VIEW_W / 2, VIEW_H / 2 - 20);
  ctx.font = '17px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, VIEW_H / 2 + 24 + i * 24));
  ctx.textAlign = 'left';
  void state;
}

function drawEnd(ctx, state, title, color, flavor) {
  ctx.fillStyle = 'rgba(16,20,28,0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = 'bold 76px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 16;
  ctx.fillText(title, VIEW_W / 2, 300);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fdf6e3';
  ctx.font = 'italic 18px system-ui, sans-serif';
  ctx.fillText(flavor, VIEW_W / 2, 342);
  const mins = fmtTime(state.time - state.stats.startedAt);
  const done = state.storyComplete ? 5 : state.mission.idx;
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('Cash on hand: $' + state.player.cash.toLocaleString('en-US') + '   ·   Earned this run: $' + state.stats.earned.toLocaleString('en-US'), VIEW_W / 2, 396);
  ctx.fillText('Missions done: ' + done + ' / 5   ·   Cars stolen: ' + state.stats.steals + '   ·   Time in the city: ' + mins, VIEW_W / 2, 426);
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillText(state.mode === 'complete' ? 'ENTER — Free roam the city' : 'ENTER — Back on the street', VIEW_W / 2, 486);
  ctx.textAlign = 'left';
}
