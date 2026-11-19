// Palm City's layout: the road grid, the blocks and buildings between the
// roads, palms and lamps, the beach, and the collision helpers every mover
// in the world shares. Generation is driven by the seeded random passed
// in, so a seed always builds the same city.

import { BEACH, LANE, PALETTE, ROADS_H, ROADS_V, ROAD_W, SIDEWALK, WORLD, ZONES } from './config.js';

const HALF_ROAD = ROAD_W / 2 + SIDEWALK; // buildings keep this far from a centre line

/** The strips of land between two neighbouring road centre lines. */
function strips(lines, limit) {
  const out = [];
  let from = 36;
  for (const line of lines) {
    out.push([from, line - HALF_ROAD]);
    from = line + HALF_ROAD;
  }
  out.push([from, limit]);
  return out.filter(([a, b]) => b - a > 60);
}

export function createCity(random) {
  const buildings = [];
  const xStrips = strips(ROADS_V, BEACH.sandX - 16);
  const yStrips = strips(ROADS_H, WORLD.height - 36);
  for (const [x0, x1] of xStrips) {
    for (const [y0, y1] of yStrips) {
      // Fill each block with a few lots; a lot usually holds one building.
      const lotW = 168;
      const lotH = 168;
      for (let lx = x0 + 8; lx + 70 < x1; lx += lotW) {
        for (let ly = y0 + 8; ly + 70 < y1; ly += lotH) {
          if (random.chance(0.22)) continue; // a courtyard or parking gap
          const w = Math.min(random.range(86, 150), x1 - lx - 14);
          const h = Math.min(random.range(86, 150), y1 - ly - 14);
          if (w < 60 || h < 60) continue;
          buildings.push({
            x: lx + random.range(2, 10),
            y: ly + random.range(2, 10),
            w,
            h,
            roof: random.int(0, PALETTE.roof.length - 1),
            trim: random.range(0, 1),
          });
        }
      }
    }
  }

  // Palms line the sidewalks and the beach.
  const palms = [];
  const palmRow = (fixed, along, vertical) => {
    for (let a = 90; a < along; a += random.range(150, 230)) {
      const off = (random.chance(0.5) ? -1 : 1) * (ROAD_W / 2 + 7);
      const x = vertical ? fixed + off : a + random.range(-16, 16);
      const y = vertical ? a + random.range(-16, 16) : fixed + off;
      if (x > BEACH.sandX - 8) continue;
      palms.push({ x, y, s: random.range(0.85, 1.25), lean: random.range(-0.14, 0.14) });
    }
  };
  for (const rx of ROADS_V) palmRow(rx, WORLD.height - 60, true);
  for (const ry of ROADS_H) palmRow(ry, BEACH.sandX - 40, false);
  for (let i = 0; i < 26; i += 1) {
    palms.push({ x: random.range(BEACH.sandX + 24, BEACH.waterX - 30), y: random.range(60, WORLD.height - 60), s: random.range(0.9, 1.35), lean: random.range(-0.2, 0.2) });
  }

  // Lamps stand at intersection corners.
  const lamps = [];
  for (const rx of ROADS_V) {
    for (const ry of ROADS_H) {
      lamps.push({ x: rx - HALF_ROAD + 4, y: ry - HALF_ROAD + 4 });
      lamps.push({ x: rx + HALF_ROAD - 4, y: ry + HALF_ROAD - 4 });
    }
  }

  // Painted ground pads for the story locations.
  const pads = [
    { x: 190, y: 2540, w: 300, h: 300, kind: 'docks' },
    { x: 2030, y: 2835, w: 740, h: 110, kind: 'strip' },
    { x: ZONES.spray.x - 90, y: ZONES.spray.y - 130, w: 180, h: 180, kind: 'spray' },
    { x: BEACH.waterX - 6, y: ZONES.marina.y - 60, w: 210, h: 120, kind: 'pier' },
  ];

  function inWater(x) {
    return x >= BEACH.waterX;
  }

  function isOnRoad(x, y) {
    if (ROADS_V.some((rx) => Math.abs(x - rx) <= ROAD_W / 2)) return true;
    return ROADS_H.some((ry) => Math.abs(y - ry) <= ROAD_W / 2);
  }

  /** Push a circle out of every building it overlaps; returns the building hit, if any. */
  function resolveCircle(pos, r) {
    let hit = null;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (pos.x < b.x - r || pos.x > b.x + b.w + r || pos.y < b.y - r || pos.y > b.y + b.h + r) continue;
      const cx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(pos.y, b.y + b.h));
      let dx = pos.x - cx;
      let dy = pos.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      hit = b;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.y = cy + (dy / d) * r;
      } else {
        // Centre inside the box: leave by the nearest face.
        const left = pos.x - b.x;
        const right = b.x + b.w - pos.x;
        const top = pos.y - b.y;
        const bottom = b.y + b.h - pos.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.x - r;
        else if (m === right) pos.x = b.x + b.w + r;
        else if (m === top) pos.y = b.y - r;
        else pos.y = b.y + b.h + r;
      }
      dx = pos.x - cx;
      dy = pos.y - cy;
    }
    return hit;
  }

  /** A random point on a random road, in a random lane. */
  function roadPoint() {
    if (random.chance(0.5)) {
      const rx = random.pick(ROADS_V);
      return { x: rx + (random.chance(0.5) ? -LANE : LANE), y: random.range(70, WORLD.height - 70), vertical: true, line: rx };
    }
    const ry = random.pick(ROADS_H);
    return { x: random.range(70, BEACH.sandX - 40), y: ry + (random.chance(0.5) ? -LANE : LANE), vertical: false, line: ry };
  }

  /** A random point on a sidewalk beside a random road. */
  function sidewalkPoint() {
    const off = ROAD_W / 2 + SIDEWALK / 2;
    if (random.chance(0.5)) {
      const rx = random.pick(ROADS_V);
      return { x: rx + (random.chance(0.5) ? -off : off), y: random.range(60, WORLD.height - 60) };
    }
    const ry = random.pick(ROADS_H);
    return { x: random.range(60, BEACH.sandX - 30), y: ry + (random.chance(0.5) ? -off : off) };
  }

  /** A sidewalk point within `radius` of (x, y), with a few tries. */
  function sidewalkPointNear(x, y, radius) {
    for (let i = 0; i < 10; i += 1) {
      const p = sidewalkPoint();
      if (Math.hypot(p.x - x, p.y - y) < radius) return p;
    }
    return sidewalkPoint();
  }

  return {
    buildings,
    palms,
    lamps,
    pads,
    zones: ZONES,
    inWater,
    isOnRoad,
    resolveCircle,
    roadPoint,
    sidewalkPoint,
    sidewalkPointNear,
  };
}
