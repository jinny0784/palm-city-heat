// Drawing only: the world's state and the current screen in, pixels out. The
// camera follows the player across Palm City; the HUD, minimap and mission banner
// are drawn in screen space. Day setting, warm Miami-ish palette, soft shadows.
import { BEACH, FONT, MISSIONS, PALETTE, PISTOL, ROADS_H, ROADS_V, ROAD_W, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_STORY = 'story';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { w: VIEW.width, h: VIEW.height, ratio: 1 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * ratio);
    const h = Math.round(window.innerHeight * ratio);
    canvas.width = w;
    canvas.height = h;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    view.ratio = ratio;
  }
  resize();
  window.addEventListener('resize', resize);

  function font(size, bold) {
    const key = `${bold ? '700 ' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, bold) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function rr(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawPalm(x, y, s, time) {
    const sway = Math.sin(time * 0.7 + x * 0.01) * 0.06;
    context.strokeStyle = PALETTE.palmTrunk;
    context.lineWidth = 3 * s;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.sin(sway) * 4 * s, y - 16 * s);
    context.stroke();
    const topX = x + Math.sin(sway) * 4 * s;
    const topY = y - 16 * s;
    context.strokeStyle = PALETTE.palmLeaf;
    context.lineWidth = 2.4 * s;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + sway;
      context.beginPath();
      context.moveTo(topX, topY);
      context.quadraticCurveTo(topX + Math.cos(a) * 10 * s, topY + Math.sin(a) * 10 * s - 3 * s, topX + Math.cos(a) * 15 * s, topY + Math.sin(a) * 15 * s + 4 * s);
      context.stroke();
    }
    context.fillStyle = PALETTE.palmLeafDark;
    context.beginPath();
    context.arc(topX, topY, 2.6 * s, 0, TAU);
    context.fill();
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.25)';
    rr(-30, -12, 62, 30, 8);
    context.fill();
    context.translate(2, 2);
    // Wheels.
    context.fillStyle = '#1a1a1a';
    context.fillRect(-22, -18, 12, 6);
    context.fillRect(10, -18, 12, 6);
    context.fillRect(-22, 12, 12, 6);
    context.fillRect(10, 12, 12, 6);
    // Body.
    if (car.kind === 'police') {
      context.fillStyle = '#1c2733';
      rr(-32, -15, 64, 30, 9);
      context.fill();
      context.fillStyle = PALETTE.policeWhite;
      rr(-6, -15, 22, 30, 6);
      context.fill();
      // Light bar, flashing.
      const phase = Math.floor(time * 4) % 2 === 0;
      context.fillStyle = phase ? '#ff3b30' : '#2f7bff';
      context.fillRect(-2, -15, 7, 8);
      context.fillStyle = phase ? '#2f7bff' : '#ff3b30';
      context.fillRect(-2, 7, 7, 8);
    } else {
      context.fillStyle = car.wrecked ? '#3a3a3a' : car.color;
      rr(-32, -15, 64, 30, 9);
      context.fill();
      if (car.kind === 'taxi') {
        context.fillStyle = '#1a1a1a';
        context.fillRect(-8, -15, 6, 30);
        context.fillStyle = '#f2f2ee';
        for (let i = 0; i < 3; i += 1) context.fillRect(-8, -15 + i * 10, 6, 5);
      }
      if (car.kind === 'sport') {
        context.fillStyle = '#1a1a1a';
        context.fillRect(-30, -15, 8, 30);
      }
      // Target car for the Hot Wheels job gets a gold outline.
      if (car.target) {
        context.strokeStyle = PALETTE.gold;
        context.lineWidth = 3;
        rr(-32, -15, 64, 30, 9);
        context.stroke();
      }
    }
    // Windshield + roof.
    context.fillStyle = 'rgba(20,30,44,0.85)';
    context.fillRect(8, -11, 12, 22);
    context.fillStyle = 'rgba(255,255,255,0.16)';
    context.fillRect(-4, -11, 8, 22);
    // Headlights.
    context.fillStyle = '#ffe9a8';
    context.beginPath();
    context.arc(31, -9, 2.6, 0, TAU);
    context.arc(31, 9, 2.6, 0, TAU);
    context.fill();
    context.restore();
  }

  function drawPerson(x, y, angle, color, bob, down, fade) {
    context.save();
    context.translate(x, y);
    if (down > 0) {
      context.globalAlpha = Math.max(0, fade);
      context.rotate(angle + Math.PI / 2);
      context.fillStyle = color;
      context.beginPath();
      context.ellipse(0, 0, 15, 8, 0, 0, TAU);
      context.fill();
      context.fillStyle = '#e8b98a';
      context.beginPath();
      context.arc(16, 0, 6, 0, TAU);
      context.fill();
      context.restore();
      return;
    }
    const step = Math.sin(bob) * 2;
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(0, 8, 10, 4, 0, 0, TAU);
    context.fill();
    context.rotate(angle);
    context.fillStyle = color;
    context.beginPath();
    context.arc(0, 0, 9, 0, TAU);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(10 + step * 0.3, 0, 6, 0, TAU);
    context.fill();
    context.restore();
  }

  function drawWorld(world, cam) {
    const st = world.state;
    const city = world.city;
    const vx0 = cam.x - view.w / 2 - 60;
    const vy0 = cam.y - view.h / 2 - 60;
    const vx1 = cam.x + view.w / 2 + 60;
    const vy1 = cam.y + view.h / 2 + 60;
    const time = st.time;

    // Base ground.
    context.fillStyle = PALETTE.block;
    context.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    // Water + sand on the east edge.
    if (vx1 > BEACH.sandX) {
      context.fillStyle = PALETTE.sand;
      context.fillRect(Math.max(vx0, BEACH.sandX), vy0, Math.min(vx1, BEACH.waterX) - Math.max(vx0, BEACH.sandX), vy1 - vy0);
      context.fillStyle = PALETTE.water;
      context.fillRect(Math.max(vx0, BEACH.waterX), vy0, vx1 - Math.max(vx0, BEACH.waterX), vy1 - vy0);
      context.strokeStyle = 'rgba(255,255,255,0.35)';
      context.lineWidth = 2;
      for (let y = Math.floor(vy0 / 90) * 90; y < vy1; y += 90) {
        const wob = Math.sin(time * 1.4 + y * 0.05) * 8;
        context.beginPath();
        context.moveTo(BEACH.waterX + 6 + wob, y);
        context.quadraticCurveTo(BEACH.waterX + 30, y + 14, BEACH.waterX + 6 + wob, y + 28);
        context.stroke();
      }
    }

    // Roads: asphalt, sidewalks, dashes, crosswalks.
    context.fillStyle = PALETTE.road;
    for (const rx of ROADS_V) context.fillRect(rx - ROAD_W / 2, vy0, ROAD_W, vy1 - vy0);
    for (const ry of ROADS_H) context.fillRect(vx0, ry - ROAD_W / 2, vx1 - vx0, ROAD_W);
    context.fillStyle = PALETTE.sidewalk;
    for (const rx of ROADS_V) {
      context.fillRect(rx - ROAD_W / 2 - 10, vy0, 10, vy1 - vy0);
      context.fillRect(rx + ROAD_W / 2, vy0, 10, vy1 - vy0);
    }
    for (const ry of ROADS_H) {
      context.fillRect(vx0, ry - ROAD_W / 2 - 10, vx1 - vx0, 10);
      context.fillRect(vx0, ry + ROAD_W / 2, vx1 - vx0, 10);
    }
    context.fillStyle = PALETTE.dash;
    for (const rx of ROADS_V) {
      for (let y = Math.floor(vy0 / 60) * 60; y < vy1; y += 60) {
        if (ROADS_H.some((ry) => Math.abs(y - ry) < 80)) continue;
        context.fillRect(rx - 2, y, 4, 26);
      }
    }
    for (const ry of ROADS_H) {
      for (let x = Math.floor(vx0 / 60) * 60; x < vx1; x += 60) {
        if (ROADS_V.some((rx) => Math.abs(x - rx) < 80)) continue;
        context.fillRect(x, ry - 2, 26, 4);
      }
    }
    // Crosswalks.
    context.fillStyle = PALETTE.crosswalk;
    for (const rx of ROADS_V) {
      for (const ry of ROADS_H) {
        for (let i = -4; i <= 4; i += 1) {
          context.fillRect(rx - ROAD_W / 2 + 6 + i * 12, ry - 22, 6, 44);
        }
      }
    }

    // Docks containers.
    const docks = city.zones.docks;
    context.fillStyle = '#c85a3a';
    context.fillRect(docks.x - 90, docks.y - 60, 60, 30);
    context.fillStyle = '#3a7ac8';
    context.fillRect(docks.x - 20, docks.y - 60, 60, 30);
    context.fillStyle = '#e8a83a';
    context.fillRect(docks.x - 90, docks.y - 20, 60, 30);
    context.fillStyle = '#3aa87a';
    context.fillRect(docks.x - 20, docks.y - 20, 60, 30);
    text('DOCKS', docks.x - 60, docks.y + 70, 15, '#5a5142', 'left', true);

    // Airstrip.
    const strip = city.zones.airstrip;
    context.fillStyle = '#4a4a52';
    context.fillRect(strip.x - 260, strip.y - 26, 520, 52);
    context.fillStyle = '#f2f2ee';
    for (let x = strip.x - 240; x < strip.x + 240; x += 60) context.fillRect(x, strip.y - 2, 30, 4);
    text('PALM CITY AIRSTRIP', strip.x - 90, strip.y - 40, 14, '#5a5142', 'left', true);

    // Marina: dock + boat.
    const marina = city.zones.marina;
    context.fillStyle = '#8a6a4a';
    context.fillRect(marina.x - 90, marina.y - 8, 90, 16);
    context.fillStyle = '#f2f2ee';
    rr(marina.x - 150, marina.y - 16, 62, 32, 12);
    context.fill();
    context.fillStyle = '#2f7ab8';
    context.fillRect(marina.x - 138, marina.y - 30, 20, 16);
    text('MARINA', marina.x - 70, marina.y + 44, 14, '#5a5142', 'left', true);

    // Pay 'n Spray garage.
    const g = city.zones.garage;
    context.fillStyle = '#2f6ab8';
    context.fillRect(g.x - g.w / 2, g.y - g.h / 2, g.w, g.h);
    context.fillStyle = '#f2f2ee';
    context.fillRect(g.x - g.w / 2 + 12, g.y - g.h / 2 + 12, g.w - 24, g.h - 24);
    text("PAY 'N SPRAY", g.x, g.y - 8, 16, '#2f6ab8', 'center', true);
    text('$200 · clears heat', g.x, g.y + 14, 13, '#5a5142', 'center');

    // Safehouse.
    const safe = city.zones.safehouse;
    context.fillStyle = '#3aa87a';
    context.beginPath();
    context.arc(safe.x, safe.y, 26, 0, TAU);
    context.fill();
    text('SAFEHOUSE', safe.x, safe.y + 44, 13, '#2f6a4a', 'center', true);

    // Depot crates (mission 3 targets).
    for (const crate of world.crates) {
      if (crate.dead) continue;
      context.fillStyle = '#b8762e';
      context.fillRect(crate.x - 18, crate.y - 18, 36, 36);
      context.strokeStyle = '#7a4a12';
      context.lineWidth = 3;
      context.strokeRect(crate.x - 18, crate.y - 18, 36, 36);
      context.beginPath();
      context.moveTo(crate.x - 18, crate.y - 18);
      context.lineTo(crate.x + 18, crate.y + 18);
      context.moveTo(crate.x + 18, crate.y - 18);
      context.lineTo(crate.x - 18, crate.y + 18);
      context.stroke();
    }

    // Buildings (culled).
    for (const b of city.buildings) {
      if (b.x + b.w < vx0 || b.x > vx1 || b.y + b.h < vy0 || b.y > vy1) continue;
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.fillRect(b.x + 8, b.y + 10, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = PALETTE.roof;
      context.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 2;
      context.strokeRect(b.x, b.y, b.w, b.h);
      if (b.roof) {
        context.fillStyle = 'rgba(0,0,0,0.18)';
        context.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.3, 26, 18);
        context.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.55, 18, 14);
      }
    }

    // Props.
    for (const p of city.props) {
      if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
      if (p.kind === 'lamp') {
        context.strokeStyle = '#3a3a44';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x, p.y - 22);
        context.stroke();
        context.fillStyle = '#ffe9a8';
        context.beginPath();
        context.arc(p.x, p.y - 24, 4, 0, TAU);
        context.fill();
      } else {
        context.fillStyle = '#c83a3a';
        context.fillRect(p.x - 4, p.y - 7, 8, 14);
      }
    }

    // Palms (culled).
    for (const palm of city.palms) {
      if (palm.x < vx0 || palm.x > vx1 || palm.y < vy0 || palm.y > vy1) continue;
      drawPalm(palm.x, palm.y, palm.s, time);
    }

    // Cash bags (mission 5).
    for (const bag of world.bags) {
      if (bag.taken) continue;
      const bob = Math.sin(time * 3 + bag.x) * 3;
      context.fillStyle = '#2f8a4a';
      rr(bag.x - 14, bag.y - 10 + bob, 28, 20, 6);
      context.fill();
      context.fillStyle = PALETTE.gold;
      text('$', bag.x, bag.y + 5 + bob, 15, PALETTE.gold, 'center', true);
    }

    // Pickups (bobbing, hidden while respawning).
    for (const p of world.pickups) {
      if (p.respawn > 0) continue;
      if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
      const bob = Math.sin(p.bob) * 3;
      const y = p.y + bob;
      if (p.kind === 'cash') {
        context.fillStyle = PALETTE.cash;
        context.beginPath();
        context.arc(p.x, y, 11, 0, TAU);
        context.fill();
        text('$', p.x, y + 5, 14, '#ffffff', 'center', true);
      } else if (p.kind === 'health') {
        context.fillStyle = PALETTE.health;
        context.fillRect(p.x - 11, y - 11, 22, 22);
        context.fillStyle = '#ffffff';
        context.fillRect(p.x - 2.5, y - 8, 5, 16);
        context.fillRect(p.x - 8, y - 2.5, 16, 5);
      } else if (p.kind === 'armour') {
        context.fillStyle = PALETTE.armour;
        context.beginPath();
        context.moveTo(p.x, y - 12);
        context.lineTo(p.x + 10, y - 6);
        context.lineTo(p.x + 10, y + 4);
        context.quadraticCurveTo(p.x + 6, y + 12, p.x, y + 14);
        context.quadraticCurveTo(p.x - 6, y + 12, p.x - 10, y + 4);
        context.lineTo(p.x - 10, y - 6);
        context.closePath();
        context.fill();
      } else if (p.kind === 'ammo') {
        context.fillStyle = PALETTE.ammo;
        for (let i = -1; i <= 1; i += 1) context.fillRect(p.x + i * 7 - 2, y - 9, 4, 18);
      } else if (p.kind === 'star') {
        context.fillStyle = PALETTE.star;
        context.save();
        context.translate(p.x, y);
        context.rotate(Math.sin(time * 2) * 0.2);
        context.beginPath();
        for (let i = 0; i < 10; i += 1) {
          const a = (i / 10) * TAU - Math.PI / 2;
          const r = i % 2 === 0 ? 13 : 6;
          if (i === 0) context.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else context.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        context.closePath();
        context.fill();
        context.restore();
      }
    }

    // Cars.
    for (const car of world.cars) {
      if (car.driver === 'gone') continue;
      if (car.x < vx0 || car.x > vx1 || car.y < vy0 || car.y > vy1) continue;
      drawCar(car, time);
      if (car.wrecked) {
        context.fillStyle = 'rgba(40,40,40,0.55)';
        context.beginPath();
        context.arc(car.x, car.y, 26, 0, TAU);
        context.fill();
      }
    }

    // Pedestrians + foot cops.
    for (const ped of world.peds) {
      if (ped.x < vx0 || ped.x > vx1 || ped.y < vy0 || ped.y > vy1) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.bob, ped.down, ped.fade);
    }
    for (const cop of world.cops) {
      if (cop.x < vx0 || cop.x > vx1 || cop.y < vy0 || cop.y > vy1) continue;
      drawPerson(cop.x, cop.y, cop.angle, '#1c2733', st.time * 8, cop.down, cop.fade);
    }

    // Player on foot (not drawn while driving — the car is the player).
    const player = world.player;
    if (!player.inCar) {
      drawPerson(player.x, player.y, player.angle, PALETTE.player, st.time * 10, 0, 1);
      // Aim line.
      context.strokeStyle = 'rgba(255,255,255,0.5)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(player.x + Math.cos(player.angle) * 16, player.y + Math.sin(player.angle) * 16);
      context.lineTo(player.x + Math.cos(player.angle) * 34, player.y + Math.sin(player.angle) * 34);
      context.stroke();
    } else if (world.state.passenger) {
      // The driver rides along: a small head in the passenger seat.
      const car = player.inCar;
      context.fillStyle = '#e8b98a';
      context.beginPath();
      context.arc(car.x - Math.sin(car.angle) * 8, car.y + Math.cos(car.angle) * 8, 5, 0, TAU);
      context.fill();
    }

    // Bullets as tracers.
    context.strokeStyle = '#ffe9a8';
    context.lineWidth = 2.5;
    for (const b of world.bullets) {
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      context.lineTo(b.x, b.y);
      context.stroke();
    }

    // Particles.
    for (const p of world.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, TAU);
      context.fill();
    }
    context.globalAlpha = 1;

    // Mission marker: pulsing gold diamond + beacon.
    const obj = world.currentObjective();
    if (obj && st.missionActive) {
      const pulse = 1 + Math.sin(time * 4) * 0.15;
      context.fillStyle = 'rgba(255,217,74,0.14)';
      context.fillRect(obj.x - 8, obj.y - 260, 16, 260);
      context.fillStyle = PALETTE.gold;
      context.save();
      context.translate(obj.x, obj.y - 30);
      context.rotate(Math.PI / 4);
      context.fillRect(-11 * pulse, -11 * pulse, 22 * pulse, 22 * pulse);
      context.restore();
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(obj.x, obj.y, obj.r * (0.9 + Math.sin(time * 3) * 0.08), 0, TAU);
      context.stroke();
    }
  }

  function drawMinimap(world) {
    const mw = 200;
    const mh = 150;
    const x0 = 16;
    const y0 = view.h - mh - 16;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    context.fillStyle = 'rgba(10,20,26,0.72)';
    rr(x0 - 6, y0 - 6, mw + 12, mh + 12, 8);
    context.fill();
    context.save();
    context.beginPath();
    rr(x0, y0, mw, mh, 4);
    context.clip();
    context.fillStyle = '#8a9a6a';
    context.fillRect(x0, y0, mw, mh);
    context.fillStyle = PALETTE.water;
    context.fillRect(x0 + BEACH.waterX * sx, y0, mw, mh);
    context.strokeStyle = '#e8e6da';
    context.lineWidth = 2;
    for (const rx of ROADS_V) {
      context.beginPath();
      context.moveTo(x0 + rx * sx, y0);
      context.lineTo(x0 + rx * sx, y0 + mh);
      context.stroke();
    }
    for (const ry of ROADS_H) {
      context.beginPath();
      context.moveTo(x0, y0 + ry * sy);
      context.lineTo(x0 + mw, y0 + ry * sy);
      context.stroke();
    }
    const st = world.state;
    const obj = world.currentObjective();
    if (obj && st.missionActive) {
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(x0 + obj.x * sx, y0 + obj.y * sy, 4, 0, TAU);
      context.fill();
    }
    for (const p of world.pickups) {
      if (p.respawn > 0) continue;
      context.fillStyle = '#37c978';
      context.fillRect(x0 + p.x * sx - 1, y0 + p.y * sy - 1, 2, 2);
    }
    for (const car of world.cars) {
      if (car.driver !== 'police' || car.wrecked) continue;
      context.fillStyle = '#ff5a4a';
      context.beginPath();
      context.arc(x0 + car.x * sx, y0 + car.y * sy, 3, 0, TAU);
      context.fill();
    }
    const pp = world.playerPos();
    context.fillStyle = '#ffffff';
    context.save();
    context.translate(x0 + pp.x * sx, y0 + pp.y * sy);
    context.rotate(world.player.angle);
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -4.5);
    context.lineTo(-5, 4.5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    context.strokeStyle = 'rgba(255,255,255,0.5)';
    context.lineWidth = 1;
    rr(x0 - 6, y0 - 6, mw + 12, mh + 12, 8);
    context.stroke();
  }

  function drawHud(world, ui) {
    const st = world.state;
    const player = world.player;
    context.textBaseline = 'alphabetic';

    // Top-left: health + armour.
    context.fillStyle = 'rgba(10,20,26,0.6)';
    rr(16, 14, 220, 46, 8);
    context.fill();
    text('HEALTH', 26, 32, 12, '#d8d0bc', 'left', true);
    context.fillStyle = '#3a2020';
    context.fillRect(90, 20, 130, 12);
    context.fillStyle = player.hp > 30 ? '#37c978' : '#ff5a4a';
    context.fillRect(90, 20, 130 * (player.hp / 100), 12);
    text('ARMOUR', 26, 50, 12, '#d8d0bc', 'left', true);
    context.fillStyle = '#1a2a3a';
    context.fillRect(90, 38, 130, 12);
    context.fillStyle = '#4aa8ff';
    context.fillRect(90, 38, 130 * (player.armour / 100), 12);

    // Top-right: wanted stars + cash.
    context.fillStyle = 'rgba(10,20,26,0.6)';
    rr(view.w - 236, 14, 220, 46, 8);
    context.fill();
    for (let i = 0; i < 5; i += 1) {
      text('★', view.w - 222 + i * 24, 46, 24, i < st.wanted ? PALETTE.gold : 'rgba(255,255,255,0.25)', 'left', true);
    }
    text(`$${st.cash.toLocaleString('en-US')}`, view.w - 26, 46, 22, '#37c978', 'right', true);

    // Mission banner, top-centre.
    const obj = world.currentObjective();
    if (obj && st.missionActive) {
      const m = MISSIONS[st.missionIndex];
      const pp = world.playerPos();
      const d = Math.round(Math.hypot(obj.x - pp.x, obj.y - pp.y));
      const label = `${m.name} — ${obj.text}  ·  ${d}m`;
      context.font = font(16, true);
      const w = context.measureText(label).width + 36;
      context.fillStyle = 'rgba(10,20,26,0.72)';
      rr((view.w - w) / 2, 14, w, 34, 8);
      context.fill();
      context.fillStyle = PALETTE.gold;
      context.fillRect((view.w - w) / 2, 14, 5, 34);
      text(label, view.w / 2, 37, 16, '#fff8ea', 'center', true);
      if (st.missionTimer !== null) {
        const t = Math.max(0, Math.ceil(st.missionTimer));
        text(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, view.w / 2, 66, 18, t <= 15 ? '#ff5a4a' : '#fff8ea', 'center', true);
      }
    } else if (!st.storyComplete) {
      text('PALM CITY — free roam', view.w / 2, 36, 15, 'rgba(255,248,234,0.75)', 'center', true);
    }

    // Bottom-right: weapon + ammo, speed while driving.
    context.fillStyle = 'rgba(10,20,26,0.6)';
    rr(view.w - 216, view.h - 62, 200, 46, 8);
    context.fill();
    if (player.inCar) {
      const kmh = Math.round(world.playerSpeed() * 0.32);
      text(`${kmh} km/h`, view.w - 26, view.h - 40, 20, '#fff8ea', 'right', true);
      text(player.inCar.kind === 'sport' ? 'COMET GT' : 'CAR', view.w - 26, view.h - 22, 12, '#d8d0bc', 'right', true);
      text(player.inCar.health > 0 ? `CAR ${Math.max(0, Math.round(player.inCar.health))}%` : 'WRECKED', view.w - 206, view.h - 40, 13, '#ffd94a', 'left', true);
    } else {
      text('PISTOL', view.w - 26, view.h - 40, 18, '#fff8ea', 'right', true);
      text(player.reloadTimer > 0 ? 'RELOADING…' : `${player.ammo} / ${PISTOL.magSize}`, view.w - 26, view.h - 22, 13, player.ammo === 0 ? '#ff5a4a' : '#d8d0bc', 'right', true);
    }

    // Minimap first: the toast below must sit on top of it, not under it.
    drawMinimap(world);

    // Toast, bottom-centre, above the minimap.
    if (st.toast && st.time < st.toastUntil) {
      context.font = font(15, false);
      const w = Math.min(view.w - 40, context.measureText(st.toast).width + 32);
      context.fillStyle = 'rgba(10,20,26,0.78)';
      rr((view.w - w) / 2, view.h - 190, w, 34, 8);
      context.fill();
      text(st.toast, view.w / 2, view.h - 167, 15, '#fff8ea', 'center');
    }

    // Busted meter.
    if (st.bustMeter > 0 && !player.inCar) {
      const w = 260;
      context.fillStyle = 'rgba(10,20,26,0.72)';
      rr((view.w - w) / 2, view.h - 170, w, 30, 8);
      context.fill();
      text('BUSTED', view.w / 2 - 40, view.h - 149, 15, '#ff5a4a', 'center', true);
      context.fillStyle = '#3a2020';
      context.fillRect(view.w / 2 + 10, view.h - 161, 110, 12);
      context.fillStyle = '#ff5a4a';
      context.fillRect(view.w / 2 + 10, view.h - 161, 110 * (st.bustMeter / 1.6), 12);
    }

    // Early controls hint.
    if (st.time < 8 && st.missionIndex === 0) {
      text('WASD move · Mouse aim · Click / Space shoot · E enter car · Shift sprint · P pause · M mute', view.w / 2, view.h - 130, 14, 'rgba(255,248,234,0.85)', 'center');
    }
    if (ui.muted) text('MUTED', view.w / 2, 66, 13, 'rgba(255,248,234,0.6)', 'center', true);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const lineH = 30;
    const height = 120 + lines.length * lineH + 70;
    const x = (view.w - width) / 2;
    const y = (view.h - height) / 2;
    context.fillStyle = PALETTE.panel;
    rr(x, y, width, height, 14);
    context.fill();
    context.fillStyle = accent || PALETTE.gold;
    context.fillRect(x, y, width, 5);
    text(title, view.w / 2, y + 66, 44, '#fff8ea', 'center', true);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], view.w / 2, y + 112 + i * lineH, 19, PALETTE.muted, 'center');
    }
    text(prompt, view.w / 2, y + height - 30, 20, PALETTE.gold, 'center', true);
  }

  function drawTitle(world, ui) {
    const st = world.state;
    // The city keeps moving behind the title.
    const pp = world.playerPos();
    const cam = { x: pp.x, y: pp.y };
    drawWorldAt(world, cam);
    context.fillStyle = 'rgba(8,26,34,0.45)';
    context.fillRect(0, 0, view.w, view.h);
    // Palm skyline silhouette along the bottom.
    context.fillStyle = 'rgba(10,32,30,0.85)';
    context.fillRect(0, view.h - 130, view.w, 130);
    for (let x = 40; x < view.w; x += 150) {
      drawPalm(x, view.h - 130, 2.2, st.time);
    }
    context.fillStyle = '#ffb84a';
    context.beginPath();
    context.arc(view.w - 180, 150, 52, 0, TAU);
    context.fill();
    text('PALM CITY', view.w / 2, 210, 84, '#fff8ea', 'center', true);
    text('HEAT', view.w / 2, 300, 84, PALETTE.gold, 'center', true);
    text('An open-world story in the sun — five jobs for Mara Voss.', view.w / 2, 350, 20, '#fff8ea', 'center');
    const lines = [
      'WASD / Arrows — move & drive      Mouse — aim      Click / Space — shoot',
      'E — steal & enter cars      Shift — sprint      Space — handbrake while driving',
      "P — pause      M — mute      Steal cars, dodge the law, finish all five jobs.",
    ];
    for (let i = 0; i < lines.length; i += 1) text(lines[i], view.w / 2, 420 + i * 30, 17, PALETTE.muted, 'center');
    const prompt = ui.hasSave ? 'Press Space — Continue your story, or N for a New Game' : 'Press Space or click to start';
    text(prompt, view.w / 2, 560, 22, PALETTE.gold, 'center', true);
    text('An original game. Palm City, Mara Voss and every character are our own.', view.w / 2, view.h - 40, 14, 'rgba(255,248,234,0.6)', 'center');
  }

  function drawWorldAt(world, cam) {
    const shake = world.state.shake;
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    context.save();
    context.translate(-cam.x + view.w / 2 + sx, -cam.y + view.h / 2 + sy);
    drawWorld(world, cam);
    context.restore();
  }

  /** Paint one frame: the world (or the title backdrop), then the HUD or a panel. */
  function draw(world, screen, ui) {
    context.setTransform(view.ratio, 0, 0, view.ratio, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, view.w, view.h);
    const st = world.state;
    if (screen === SCREEN_TITLE) {
      drawTitle(world, ui);
      return;
    }
    const pp = world.playerPos();
    const cam = {
      x: clamp(pp.x, view.w / 2, Math.max(view.w / 2, WORLD.width - view.w / 2)),
      y: clamp(pp.y, view.h / 2, Math.max(view.h / 2, WORLD.height - view.h / 2)),
    };
    drawWorldAt(world, cam);
    drawHud(world, ui);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(8,20,26,0.55)';
      context.fillRect(0, 0, view.w, view.h);
      drawPanel('Paused', ['The city will wait. Mara will not.'], 'Press P to resume', '#4aa8ff');
    } else if (screen === SCREEN_WASTED) {
      context.fillStyle = 'rgba(40,8,8,0.45)';
      context.fillRect(0, 0, view.w, view.h);
      drawPanel('WASTED', [
        `Cash kept: $${st.cash.toLocaleString('en-US')}   ·   Missions done: ${st.stats.missions} / 5`,
        `Cars stolen: ${st.stats.stolen}   ·   Time in the city: ${Math.floor(st.time / 60)}:${String(Math.floor(st.time % 60)).padStart(2, '0')}`,
      ], 'Press Space to try again', '#ff5a4a');
    } else if (screen === SCREEN_BUSTED) {
      context.fillStyle = 'rgba(8,12,40,0.45)';
      context.fillRect(0, 0, view.w, view.h);
      drawPanel('BUSTED', [
        `Cash kept: $${st.cash.toLocaleString('en-US')}   ·   Missions done: ${st.stats.missions} / 5`,
        'The Palm City PD thanks you for your cooperation.',
      ], 'Press Space to try again', '#4aa8ff');
    } else if (screen === SCREEN_STORY) {
      context.fillStyle = 'rgba(20,26,8,0.4)';
      context.fillRect(0, 0, view.w, view.h);
      drawPanel('STORY COMPLETE', [
        'All five jobs done. Mara Voss owns Palm City tonight — and so do you.',
        `Final cash: $${st.cash.toLocaleString('en-US')}   ·   Cars stolen: ${st.stats.stolen}   ·   Time: ${Math.floor(st.time / 60)}:${String(Math.floor(st.time % 60)).padStart(2, '0')}`,
      ], 'Press Space to play again in free roam', PALETTE.gold);
    }
  }

  return { draw };
}
