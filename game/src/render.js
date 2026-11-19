// Palm City Heat — the canvas renderer. Everything is drawn in world
// space under a camera transform, then the HUD is drawn in screen space.
// Decorations that must not flicker between frames are derived from the
// hash of an entity's id or position, never from Math.random.

import { BEACH, MISSIONS, PALETTE, PISTOL, ROADS_H, ROADS_V, ROAD_W, VIEW_H, VIEW_W, WORLD, ZONES } from './config.js';
import { hash2 } from './random.js';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, x, y, r, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = rot + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

const fmtCash = (n) => '$' + n.toLocaleString('en-US');

// ------------------------------------------------------------------ world

export function drawWorld(ctx, world, cam) {
  const { city, state } = world;
  const t = state.time;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  // Land and sea.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(cam.x - 20, cam.y - 20, VIEW_W + 40, VIEW_H + 40);
  ctx.fillStyle = PALETTE.grassDark;
  for (let gx = Math.floor(cam.x / 260) * 260; gx < cam.x + VIEW_W + 260; gx += 260) {
    for (let gy = Math.floor(cam.y / 260) * 260; gy < cam.y + VIEW_H + 260; gy += 260) {
      if (hash2(gx, gy) > 0.5) ctx.fillRect(gx, gy, 260, 260);
    }
  }
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(BEACH.sandX, cam.y - 20, BEACH.waterX - BEACH.sandX, VIEW_H + 40);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(BEACH.waterX, cam.y - 20, WORLD.width - BEACH.waterX + 60, VIEW_H + 40);
  ctx.fillStyle = PALETTE.waterDeep;
  for (let wy = Math.floor(cam.y / 90) * 90; wy < cam.y + VIEW_H + 90; wy += 90) {
    const off = Math.sin(t * 0.7 + wy * 0.05) * 14;
    ctx.fillRect(BEACH.waterX + 30 + off, wy, 130, 7);
  }

  // Sidewalks, then asphalt, then lane dashes.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const rx of ROADS_V) ctx.fillRect(rx - ROAD_W / 2 - 16, 0, ROAD_W + 32, WORLD.height);
  for (const ry of ROADS_H) ctx.fillRect(0, ry - ROAD_W / 2 - 16, BEACH.sandX + 60, ROAD_W + 32);
  ctx.fillStyle = PALETTE.asphalt;
  for (const rx of ROADS_V) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.height);
  for (const ry of ROADS_H) ctx.fillRect(0, ry - ROAD_W / 2, BEACH.sandX + 60, ROAD_W);
  ctx.fillStyle = PALETTE.laneMark;
  for (const rx of ROADS_V) {
    for (let y = 24; y < WORLD.height; y += 52) {
      if (ROADS_H.some((ry) => Math.abs(y - ry) < 74)) continue;
      ctx.fillRect(rx - 2, y, 4, 28);
    }
  }
  for (const ry of ROADS_H) {
    for (let x = 24; x < BEACH.sandX + 40; x += 52) {
      if (ROADS_V.some((rx) => Math.abs(x - rx) < 74)) continue;
      ctx.fillRect(x, ry - 2, 28, 4);
    }
  }

  // Painted pads: docks, airstrip, spray bay, marina pier.
  for (const pad of city.pads) {
    if (pad.kind === 'pier') {
      ctx.fillStyle = '#9a7d55';
      ctx.fillRect(pad.x, pad.y, pad.w, pad.h);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let px = pad.x + 12; px < pad.x + pad.w; px += 26) ctx.fillRect(px, pad.y, 3, pad.h);
    } else if (pad.kind === 'strip') {
      ctx.fillStyle = '#5b5b63';
      ctx.fillRect(pad.x, pad.y, pad.w, pad.h);
      ctx.fillStyle = PALETTE.laneMark;
      for (let px = pad.x + 20; px < pad.x + pad.w - 30; px += 64) ctx.fillRect(px, pad.y + pad.h / 2 - 3, 36, 6);
    } else if (pad.kind === 'spray') {
      ctx.fillStyle = '#7fc8bc';
      ctx.fillRect(pad.x, pad.y, pad.w, pad.h);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 21px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("PAY 'N SPRAY", pad.x + pad.w / 2, pad.y + pad.h / 2 + 7);
    } else {
      ctx.fillStyle = '#b9ac8f';
      ctx.fillRect(pad.x, pad.y, pad.w, pad.h);
    }
  }
  // The marina boat.
  drawBoat(ctx, ZONES.marina.x + 120, ZONES.marina.y, t);

  // Pickups, bags, crates.
  for (const pk of world.pickups) {
    if (pk.respawn > 0) continue;
    drawPickup(ctx, pk, t);
  }
  for (const bag of world.bags) {
    if (!bag.active || bag.got) continue;
    drawBag(ctx, bag.x, bag.y, t);
  }
  for (const crate of world.crates) {
    if (crate.dead) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(crate.x - 17, crate.y - 12, 38, 38);
    ctx.fillStyle = '#a87f4f';
    ctx.fillRect(crate.x - 19, crate.y - 19, 38, 38);
    ctx.strokeStyle = '#7d5a33';
    ctx.lineWidth = 3;
    ctx.strokeRect(crate.x - 19, crate.y - 19, 38, 38);
    ctx.beginPath();
    ctx.moveTo(crate.x - 19, crate.y - 19);
    ctx.lineTo(crate.x + 19, crate.y + 19);
    ctx.moveTo(crate.x + 19, crate.y - 19);
    ctx.lineTo(crate.x - 19, crate.y + 19);
    ctx.stroke();
  }

  // Buildings: shadow, walls, roof, a rooftop detail or two.
  for (const b of city.buildings) {
    if (b.x > cam.x + VIEW_W + 60 || b.x + b.w < cam.x - 60 || b.y > cam.y + VIEW_H + 60 || b.y + b.h < cam.y - 60) continue;
    ctx.fillStyle = 'rgba(50, 35, 15, 0.20)';
    ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
    ctx.fillStyle = '#8f8578';
    ctx.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    ctx.fillStyle = PALETTE.roof[b.roof];
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
    if (b.trim > 0.35) {
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      const ax = b.x + b.w * (0.2 + b.trim * 0.4);
      const ay = b.y + b.h * (0.25 + b.trim * 0.3);
      ctx.fillRect(ax, ay, 20, 14);
    }
    if (b.trim > 0.72) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(b.x + b.w * 0.55, b.y + b.h * 0.6, 26, 10);
    }
  }

  // Lamps.
  ctx.fillStyle = '#5d6066';
  for (const lamp of city.lamps) {
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Palms.
  for (const palm of city.palms) {
    if (palm.x < cam.x - 60 || palm.x > cam.x + VIEW_W + 60 || palm.y < cam.y - 60 || palm.y > cam.y + VIEW_H + 60) continue;
    drawPalm(ctx, palm);
  }

  // The mission marker: a pulsing gold ring with a light beam.
  const obj = world.currentObjective();
  if (obj) {
    const pulse = 1 + Math.sin(t * 4.4) * 0.13;
    ctx.fillStyle = 'rgba(255, 190, 40, 0.13)';
    ctx.fillRect(obj.x - 7, obj.y - 330, 14, 330);
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, obj.r * 0.55 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffb703';
    star(ctx, obj.x, obj.y, 13 * pulse);
    ctx.fill();
  }

  // Cars, people, bullets, particles.
  for (const car of world.cars) drawCar(ctx, car, t);
  for (const ped of world.peds) drawPed(ctx, ped);
  for (const cop of world.cops) drawCop(ctx, cop);
  if (!world.player.inCar) drawPlayer(ctx, world.player, t);
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const b of world.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const pt of world.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBoat(ctx, x, y, t) {
  const bob = Math.sin(t * 1.3) * 3;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(6, 10, 74, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f7f3e8';
  ctx.beginPath();
  ctx.moveTo(-70, 0);
  ctx.lineTo(58, 0);
  ctx.lineTo(38, 16);
  ctx.lineTo(-48, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e2725b';
  ctx.fillRect(-40, -13, 52, 13);
  ctx.fillStyle = '#22749c';
  ctx.fillRect(-32, -10, 12, 8);
  ctx.fillRect(-12, -10, 12, 8);
  ctx.restore();
}

function drawPickup(ctx, pk, t) {
  const bob = Math.sin(t * 3 + pk.x * 0.05) * 3;
  const y = pk.y + bob;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(pk.x, pk.y + 12, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const colors = { cash: '#3fa34d', health: '#f4f6f6', armour: '#3f7fbf', ammo: '#e0a32e', bribe: '#ffd23f' };
  ctx.fillStyle = colors[pk.kind];
  ctx.beginPath();
  ctx.arc(pk.x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = pk.kind === 'health' ? '#d64541' : pk.kind === 'bribe' ? '#7a5b00' : '#ffffff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyph = { cash: '$', health: '+', armour: 'A', ammo: '≡', bribe: '★' }[pk.kind];
  ctx.fillText(glyph, pk.x, y + 1);
  ctx.textBaseline = 'alphabetic';
}

function drawBag(ctx, x, y, t) {
  const bob = Math.sin(t * 3.4 + x * 0.07) * 3;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + 13, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2e7d46';
  ctx.beginPath();
  ctx.arc(x, y + bob, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#256b3a';
  ctx.fillRect(x - 4, y + bob - 19, 8, 7);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', x, y + bob + 1);
  ctx.textBaseline = 'alphabetic';
}

function drawPalm(ctx, palm) {
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(palm.x + 7, palm.y + 9, 15, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.palmTrunk;
  ctx.lineWidth = 4.5 * palm.s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(palm.x, palm.y + 8);
  ctx.quadraticCurveTo(palm.x + palm.lean * 26, palm.y, palm.x + palm.lean * 44, palm.y - 9);
  ctx.stroke();
  const topX = palm.x + palm.lean * 44;
  const topY = palm.y - 9;
  ctx.strokeStyle = PALETTE.palmLeaf;
  ctx.lineWidth = 3.4 * palm.s;
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 + palm.lean * 3;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(a) * 15 * palm.s, topY + Math.sin(a) * 12 * palm.s - 3,
      topX + Math.cos(a) * 24 * palm.s, topY + Math.sin(a) * 17 * palm.s + 4,
    );
    ctx.stroke();
  }
}

function drawCar(ctx, car, t) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  rr(ctx, -21, -9, 48, 24, 7);
  ctx.fill();
  const isPolice = car.driver === 'police';
  ctx.fillStyle = isPolice ? '#f2f4f6' : car.color;
  rr(ctx, -24, -12, 48, 24, 7);
  ctx.fill();
  if (isPolice) {
    ctx.fillStyle = '#2456a6';
    ctx.fillRect(-24, -4, 48, 8);
    const phase = Math.floor(t * 5 + car.id) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#ffd9d6';
    ctx.fillRect(-7, -8, 6, 5);
    ctx.fillStyle = phase ? '#cfe4ff' : '#2f7bff';
    ctx.fillRect(1, -8, 6, 5);
  }
  if (car.kind === 'taxi') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(-18 + i * 10, 8, 5, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-4, -4, 8, 8);
  }
  if (car.kind === 'sport') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-27, -11, 5, 22);
  }
  // Glass and nose.
  ctx.fillStyle = '#22303c';
  rr(ctx, 2, -9, 10, 18, 3);
  ctx.fill();
  rr(ctx, -13, -8, 7, 16, 3);
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(22, -9, 3, 5);
  ctx.fillRect(22, 4, 3, 5);
  ctx.fillStyle = '#1c1c1e';
  ctx.fillRect(-18, -14, 10, 4);
  ctx.fillRect(8, -14, 10, 4);
  ctx.fillRect(-18, 10, 10, 4);
  ctx.fillRect(8, 10, 10, 4);
  if (car.target) {
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2.5;
    rr(ctx, -26, -14, 52, 28, 8);
    ctx.stroke();
  }
  if (car.wrecked) {
    ctx.fillStyle = 'rgba(25,25,25,0.45)';
    rr(ctx, -24, -12, 48, 24, 7);
    ctx.fill();
  }
  ctx.restore();
  if (car.wrecked) {
    const flicker = hash2(car.id * 7, Math.floor(t * 2));
    ctx.fillStyle = `rgba(70,70,70,${0.12 + flicker * 0.1})`;
    ctx.beginPath();
    ctx.arc(car.x + (flicker - 0.5) * 8, car.y - 16 - flicker * 8, 8 + flicker * 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (car.health < 45 && car.driver === 'player') {
    ctx.fillStyle = 'rgba(70,70,70,0.18)';
    ctx.beginPath();
    ctx.arc(car.x, car.y - 14, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.globalAlpha = Math.max(0.25, Math.min(1, ped.downTimer / 3));
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98d';
    ctx.beginPath();
    ctx.arc(13, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(1, 4, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(0, -1, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCop(ctx, cop) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(cop.x + 1, cop.y + 4, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#274268';
  ctx.beginPath();
  ctx.arc(cop.x, cop.y, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(cop.x, cop.y - 1, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#16283f';
  ctx.beginPath();
  ctx.arc(cop.x, cop.y - 3.5, 5.4, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cop.x, cop.y);
  ctx.lineTo(cop.x + Math.cos(cop.angle) * 15, cop.y + Math.sin(cop.angle) * 15);
  ctx.stroke();
}

function drawPlayer(ctx, player, t) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(player.x + 1, player.y + 5, 10, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // The pistol arm points where the mouse aims.
  ctx.strokeStyle = '#20242a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(player.x + Math.cos(player.angle) * 17, player.y + Math.sin(player.angle) * 17);
  ctx.stroke();
  const bob = Math.sin(player.walkPhase) * 1.2;
  ctx.fillStyle = '#ff5a1f';
  ctx.beginPath();
  ctx.arc(player.x, player.y + bob * 0.3, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(player.x, player.y - 1 + bob * 0.3, 5.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242a';
  ctx.beginPath();
  ctx.arc(player.x, player.y - 4 + bob * 0.3, 5.6, Math.PI, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------------ HUD

export function drawHUD(ctx, world, opts = {}) {
  const { state, player } = world;
  ctx.save();
  // Health and armour, top-left.
  bar(ctx, 18, 16, 224, 17, player.health / 100, '#e23b3b', '#571d1d', 'HP');
  bar(ctx, 18, 39, 224, 12, player.armour / 100, '#3f7fbf', '#1d3557', '');
  if (player.inCar) {
    bar(ctx, 18, 57, 224, 10, player.inCar.health / 100, '#f2c14e', '#5c4712', '');
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CAR', 20, 65);
  }
  // Cash and stars, top-right.
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 5;
  ctx.fillText(fmtCash(state.cash), VIEW_W - 20, 42);
  ctx.shadowBlur = 0;
  for (let i = 0; i < 5; i += 1) {
    const x = VIEW_W - 34 - i * 31;
    if (i < state.wanted) {
      ctx.fillStyle = '#ffd23f';
      star(ctx, x, 66, 12);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      star(ctx, x, 66, 12);
      ctx.stroke();
    }
  }
  // Weapon, bottom-right.
  ctx.fillStyle = 'rgba(12,14,20,0.55)';
  rr(ctx, VIEW_W - 196, VIEW_H - 58, 178, 42, 9);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'right';
  const reloading = player.reloadTimer > 0 ? '  (reloading)' : '';
  ctx.fillText(`PISTOL  ${player.ammo} / ${player.reserve}${reloading}`, VIEW_W - 30, VIEW_H - 31);
  if (opts.muted) {
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('MUTED — M to unmute', VIEW_W - 30, VIEW_H - 66);
  }

  drawMinimap(ctx, world);
  drawBanner(ctx, world);

  // Bust meter.
  if (state.bust > 0.02 && !state.over) {
    ctx.fillStyle = 'rgba(12,14,20,0.6)';
    rr(ctx, VIEW_W / 2 - 130, VIEW_H - 118, 260, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#ff3b30';
    rr(ctx, VIEW_W / 2 - 124, VIEW_H - 112, 248 * state.bust, 14, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THEY ARE ON YOU — RUN!', VIEW_W / 2, VIEW_H - 124);
  }

  // Toasts.
  ctx.textAlign = 'center';
  let ty = VIEW_H - 148;
  for (let i = world.toasts.length - 1; i >= 0; i -= 1) {
    const toast = world.toasts[i];
    const alpha = Math.min(1, toast.ttl / 0.6);
    ctx.globalAlpha = alpha;
    ctx.font = '600 15px system-ui, sans-serif';
    const w = Math.min(660, ctx.measureText(toast.text).width + 34);
    ctx.fillStyle = 'rgba(14,16,24,0.78)';
    rr(ctx, VIEW_W / 2 - w / 2, ty - 21, w, 30, 9);
    ctx.fill();
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(toast.text, VIEW_W / 2, ty);
    ty -= 38;
  }
  ctx.globalAlpha = 1;

  // Story-complete banner.
  if (state.storyBanner > 0) {
    ctx.globalAlpha = Math.min(1, state.storyBanner / 1.2);
    ctx.fillStyle = 'rgba(14,16,24,0.72)';
    rr(ctx, VIEW_W / 2 - 330, 120, 660, 96, 14);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText('STORY COMPLETE', VIEW_W / 2, 162);
    ctx.fillStyle = '#fff';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('All five jobs done. Palm City is yours — free roam, the city keeps living.', VIEW_W / 2, 192);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function bar(ctx, x, y, w, h, frac, fill, back, label) {
  ctx.fillStyle = 'rgba(12,14,20,0.55)';
  rr(ctx, x - 3, y - 3, w + 6, h + 6, 7);
  ctx.fill();
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  if (label) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 5, y + h - 4);
  }
}

function drawBanner(ctx, world) {
  const { state } = world;
  const m = MISSIONS[state.missionIndex];
  let title = '';
  let line = '';
  let timed = 0;
  if (state.missionActive && m) {
    const obj = world.currentObjective();
    title = `JOB ${state.missionIndex + 1} — ${m.name.toUpperCase()}`;
    line = obj ? `${obj.text}   ·   ${Math.round(obj.dist / 10)}m` : '';
    if (m.time) timed = state.missionTimer;
  } else if (state.missionIndex < MISSIONS.length) {
    title = 'PALM CITY';
    line = 'Mara Voss will call with the next job…';
  } else {
    title = 'PALM CITY';
    line = 'Free roam — every job is done.';
  }
  ctx.fillStyle = 'rgba(12,14,20,0.62)';
  rr(ctx, VIEW_W / 2 - 300, 14, 600, 58, 11);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(title, VIEW_W / 2, 37);
  ctx.fillStyle = '#fff';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText(line, VIEW_W / 2, 60);
  if (timed > 0) {
    ctx.fillStyle = timed < 15 ? '#ff3b30' : '#ffd23f';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(timed)}s`, VIEW_W / 2 + 288, 37);
  }
}

function drawMinimap(ctx, world) {
  const { state } = world;
  const W = 198;
  const H = 150;
  const x0 = 16;
  const y0 = VIEW_H - H - 16;
  const sx = W / WORLD.width;
  const sy = H / WORLD.height;
  ctx.fillStyle = 'rgba(10, 26, 34, 0.82)';
  rr(ctx, x0 - 3, y0 - 3, W + 6, H + 6, 9);
  ctx.fill();
  ctx.save();
  rr(ctx, x0, y0, W, H, 7);
  ctx.clip();
  ctx.fillStyle = '#2c5d43';
  ctx.fillRect(x0, y0, W, H);
  ctx.fillStyle = '#c9b078';
  ctx.fillRect(x0 + BEACH.sandX * sx, y0, (BEACH.waterX - BEACH.sandX) * sx, H);
  ctx.fillStyle = '#22749c';
  ctx.fillRect(x0 + BEACH.waterX * sx, y0, W - BEACH.waterX * sx, H);
  ctx.strokeStyle = 'rgba(240,240,230,0.55)';
  ctx.lineWidth = 2;
  for (const rx of ROADS_V) {
    ctx.beginPath();
    ctx.moveTo(x0 + rx * sx, y0);
    ctx.lineTo(x0 + rx * sx, y0 + H);
    ctx.stroke();
  }
  for (const ry of ROADS_H) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + ry * sy);
    ctx.lineTo(x0 + W, y0 + ry * sy);
    ctx.stroke();
  }
  // Objective.
  const obj = world.currentObjective();
  if (obj) {
    ctx.fillStyle = '#ffd23f';
    star(ctx, x0 + obj.x * sx, y0 + obj.y * sy, 6);
    ctx.fill();
  }
  // Police blips.
  ctx.fillStyle = '#ff3b30';
  for (const car of world.cars) {
    if (car.driver !== 'police') continue;
    ctx.beginPath();
    ctx.arc(x0 + car.x * sx, y0 + car.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of world.cops) {
    ctx.beginPath();
    ctx.arc(x0 + cop.x * sx, y0 + cop.y * sy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const p = world.playerPos();
  const facing = world.player.inCar ? world.player.inCar.angle : world.player.angle;
  ctx.save();
  ctx.translate(x0 + p.x * sx, y0 + p.y * sy);
  ctx.rotate(facing);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.5);
  ctx.lineTo(-5, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  if (state.wanted > 0) {
    ctx.strokeStyle = `rgba(255,59,48,${0.5 + Math.sin(state.time * 6) * 0.3})`;
    ctx.lineWidth = 2.5;
    rr(ctx, x0 - 3, y0 - 3, W + 6, H + 6, 9);
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ screens

export function titleButtons(hasSave) {
  const buttons = [{ id: 'start', x: VIEW_W / 2 - 130, y: 470, w: 260, h: 52, label: 'START NEW GAME' }];
  if (hasSave) buttons.push({ id: 'continue', x: VIEW_W / 2 - 130, y: 534, w: 260, h: 52, label: 'CONTINUE' });
  return buttons;
}

export function drawTitle(ctx, world, cam, hasSave, mouse) {
  drawWorld(ctx, world, cam);
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, 'rgba(38,16,44,0.62)');
  grad.addColorStop(0.55, 'rgba(38,16,44,0.25)');
  grad.addColorStop(1, 'rgba(20,10,26,0.66)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd9a0';
  ctx.font = '600 25px system-ui, sans-serif';
  ctx.fillText('M A K E . F U N   P R E S E N T S', VIEW_W / 2, 120);
  ctx.font = '900 104px system-ui, sans-serif';
  ctx.fillStyle = '#fff3e0';
  ctx.shadowColor = 'rgba(255,90,31,0.55)';
  ctx.shadowBlur = 26;
  ctx.fillText('PALM CITY', VIEW_W / 2, 238);
  ctx.fillStyle = '#ff5a1f';
  ctx.fillText('HEAT', VIEW_W / 2, 338);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffe9c9';
  ctx.font = '19px system-ui, sans-serif';
  ctx.fillText('One city. Five jobs. Every car is yours — if you can keep it.', VIEW_W / 2, 386);
  for (const b of titleButtons(hasSave)) {
    const hover = mouse && mouse.x > b.x && mouse.x < b.x + b.w && mouse.y > b.y && mouse.y < b.y + b.h;
    ctx.fillStyle = hover ? '#ff7a3c' : '#ff5a1f';
    rr(ctx, b.x, b.y, b.w, b.h, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + 33);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '14.5px system-ui, sans-serif';
  ctx.fillText('WASD / arrows — move & drive      Mouse — aim      Click / Space — shoot      E — steal car      Shift — sprint', VIEW_W / 2, 664);
  ctx.fillText('Space in a car — handbrake      R — reload      Esc / P — pause      M — mute', VIEW_W / 2, 690);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('A top-down open-world crime game. All people, places and cars are fictional.', VIEW_W / 2, 742);
}

export function drawOver(ctx, world, kind) {
  const { state } = world;
  ctx.fillStyle = kind === 'busted' ? 'rgba(16,26,54,0.78)' : 'rgba(54,10,10,0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'busted' ? '#9ec2ff' : '#ff8a7a';
  ctx.font = '900 92px system-ui, sans-serif';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', VIEW_W / 2, 268);
  ctx.fillStyle = '#fff';
  ctx.font = '19px system-ui, sans-serif';
  ctx.fillText(kind === 'busted' ? 'The law finally caught up with you.' : 'Palm City keeps your story now.', VIEW_W / 2, 316);
  ctx.font = '17px system-ui, sans-serif';
  const lines = [
    `Cash on hand: ${fmtCash(state.cash)}`,
    `Jobs completed: ${state.missionIndex} of ${MISSIONS.length}`,
    `Cars stolen: ${state.stats.stolen}`,
    `Total earned: ${fmtCash(state.stats.earned)}`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 386 + i * 30));
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillText('Press ENTER to run it back', VIEW_W / 2, 560);
}

export function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(10,10,18,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '900 54px system-ui, sans-serif';
  ctx.fillText('PAUSED', VIEW_W / 2, 380);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText('Esc / P — resume', VIEW_W / 2, 424);
}
