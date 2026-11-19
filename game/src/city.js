// Palm City's layout: a grid of avenues with city blocks between them, a
// palm beach and open water down the east edge, and a few special places
// the story needs — a rival depot yard, a little airstrip, a park, the
// docks. Generation is seeded, so a seed always builds the same city.
//
// This module is pure logic (no DOM), so the smoke test can build a city
// in Node and push circles around in it.

import { makeRng } from './random.js';
import { WORLD_W, WORLD_H, V_ROADS, H_ROADS, ROAD_W, BEACH_X, WATER_X, ROOF_COLOURS, PLACES } from './config.js';

const HALF_ROAD = ROAD_W / 2;

/** The spans of ground between neighbouring roads, as [start, end] pairs. */
function intervals(centres, limit) {
  const out = [];
  let start = 0;
  for (const c of centres) {
    out.push([start, c - HALF_ROAD]);
    start = c + HALF_ROAD;
  }
  out.push([start, limit]);
  return out;
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const palms = [];
  const lamps = [];
  const hydrants = [];
  const blocks = [];

  const xBands = intervals(V_ROADS, BEACH_X);
  const yBands = intervals(H_ROADS, WORLD_H);

  for (const [bx, bx2] of xBands) {
    for (const [by, by2] of yBands) {
      const bw = bx2 - bx;
      const bh = by2 - by;
      if (bw < 60 || bh < 60) continue;
      const block = { x: bx, y: by, w: bw, h: bh, kind: 'block' };

      const isDepot = bx === 505 && by === 505;
      const isStrip = bx === 505 && by === 2605;
      const isPark = bx === 1905 && by === 505;

      if (isDepot) {
        block.kind = 'depot';
        // An open yard with two low sheds against its north edge.
        buildings.push({ x: bx + 40, y: by + 34, w: 150, h: 74, roof: '#b8a88f', shade: 0.82 });
        buildings.push({ x: bx + 330, y: by + 34, w: 150, h: 74, roof: '#a89a83', shade: 0.78 });
      } else if (isStrip) {
        block.kind = 'strip';
        // The runway itself is drawn by the renderer; the block stays clear.
      } else if (isPark) {
        block.kind = 'park';
        for (let i = 0; i < 14; i++) {
          palms.push({ x: bx + 40 + rng.next() * (bw - 80), y: by + 40 + rng.next() * (bh - 80), s: rng.range(0.85, 1.25) });
        }
      } else {
        // Ordinary block: a pavement border (the sidewalk peds walk on),
        // then a grid of lots, most holding a building.
        const inner = { x: bx + 30, y: by + 30, w: bw - 60, h: bh - 60 };
        const cols = inner.w > 430 ? 3 : 2;
        const rows = inner.h > 430 ? 3 : 2;
        const lotW = inner.w / cols;
        const lotH = inner.h / rows;
        for (let cx = 0; cx < cols; cx++) {
          for (let cy = 0; cy < rows; cy++) {
            if (!rng.chance(0.8)) continue;
            const m = rng.range(9, 17);
            buildings.push({
              x: inner.x + cx * lotW + m,
              y: inner.y + cy * lotH + m,
              w: lotW - m * 2,
              h: lotH - m * 2,
              roof: rng.pick(ROOF_COLOURS),
              shade: rng.range(0.8, 1.05),
            });
          }
        }
        // A palm or two on the sidewalk corners.
        if (rng.chance(0.7)) palms.push({ x: bx + 16, y: by + 16, s: rng.range(0.85, 1.15) });
        if (rng.chance(0.7)) palms.push({ x: bx2 - 16, y: by2 - 16, s: rng.range(0.85, 1.15) });
        if (rng.chance(0.35)) hydrants.push({ x: bx + 15, y: by2 - 15 });
      }
      blocks.push(block);
    }
  }

  // Beach palms in a loose double row along the sand.
  for (let y = 70; y < WORLD_H - 40; y += rng.range(80, 130)) {
    if (Math.abs(y - PLACES.marina.y) < 90 || Math.abs(y - PLACES.docks.y) < 110) continue;
    palms.push({ x: rng.range(BEACH_X + 36, WATER_X - 60), y, s: rng.range(0.9, 1.35) });
  }

  // Street lamps on the intersection corners.
  for (const vx of V_ROADS) {
    for (const hy of H_ROADS) {
      lamps.push({ x: vx - HALF_ROAD - 8, y: hy - HALF_ROAD - 8 });
      lamps.push({ x: vx + HALF_ROAD + 8, y: hy + HALF_ROAD + 8 });
    }
  }

  return { buildings, palms, lamps, hydrants, blocks };
}

/** Is this point on asphalt (a road or an intersection)? */
export function onRoad(x, y) {
  if (x >= BEACH_X) return false;
  for (const c of V_ROADS) if (Math.abs(x - c) <= HALF_ROAD) return true;
  for (const c of H_ROADS) if (Math.abs(y - c) <= HALF_ROAD) return true;
  return false;
}

/** Is this point in the sea? */
export function inWater(x, y) {
  return x >= WATER_X && y >= 0 && y <= WORLD_H;
}

/** Does the circle overlap any building? Returns the building or null. */
export function buildingAt(city, x, y, r) {
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

/**
 * Push a circle out of every building and keep it inside the world and
 * out of the sea. Mutates and returns the {x, y} object it is given.
 */
export function resolveCircle(city, pos, r) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of city.buildings) {
      const nx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(pos.y, b.y + b.h));
      let dx = pos.x - nx;
      let dy = pos.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.y = ny + (dy / d) * r;
      } else {
        // Centre inside the rect: leave by the nearest face.
        const left = pos.x - b.x;
        const right = b.x + b.w - pos.x;
        const top = pos.y - b.y;
        const bottom = b.y + b.h - pos.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = b.x - r;
        else if (min === right) pos.x = b.x + b.w + r;
        else if (min === top) pos.y = b.y - r;
        else pos.y = b.y + b.h + r;
      }
    }
  }
  pos.x = Math.max(r, Math.min(pos.x, WATER_X - r));
  pos.y = Math.max(r, Math.min(pos.y, WORLD_H - r));
  return pos;
}
