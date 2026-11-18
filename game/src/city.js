// Palm City itself: a seeded road grid, city blocks filled with buildings, palms
// along the sidewalks, and the named places the story uses. Pure data + geometry:
// no drawing and no browser in here. Collision is circle-vs-rectangle against the
// building list, and the water strip is solid for everyone.
import { BEACH, LANE, PALETTE, ROADS_H, ROADS_V, ROAD_W, WORLD } from './config.js';

export function createCity(random) {
  const buildings = [];
  const palms = [];
  const props = [];
  const half = ROAD_W / 2;

  // City blocks are the rectangles between neighbouring roads. Each block gets
  // 1-3 buildings, or stays a park (palms only) or a parking lot.
  const xs = [0, ...ROADS_V, WORLD.width];
  const ys = [0, ...ROADS_H, WORLD.height];
  for (let bx = 0; bx < xs.length - 1; bx += 1) {
    for (let by = 0; by < ys.length - 1; by += 1) {
      const x0 = xs[bx] + (bx === 0 ? 60 : half + 26);
      const x1 = xs[bx + 1] - (bx === xs.length - 2 ? 60 : half + 26);
      const y0 = ys[by] + (by === 0 ? 60 : half + 26);
      const y1 = ys[by + 1] - (by === ys.length - 2 ? 60 : half + 26);
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 130 || bh < 110) continue;
      // The beach blocks (east edge) stay open sand, no buildings.
      if (x0 > BEACH.sandX - 200) continue;
      const roll = random();
      if (roll < 0.12) {
        // Park: palms only.
        const n = 3 + Math.floor(random() * 4);
        for (let i = 0; i < n; i += 1) {
          palms.push({ x: x0 + 30 + random() * (bw - 60), y: y0 + 30 + random() * (bh - 60), s: 0.8 + random() * 0.5 });
        }
        continue;
      }
      const count = roll < 0.45 ? 1 : roll < 0.85 ? 2 : 3;
      // Split the block into a 2x2 grid of cells and put one building in a few
      // of them: dense, and buildings can never overlap each other.
      const cells = [
        { x: x0, y: y0, w: bw / 2, h: bh / 2 },
        { x: x0 + bw / 2, y: y0, w: bw / 2, h: bh / 2 },
        { x: x0, y: y0 + bh / 2, w: bw / 2, h: bh / 2 },
        { x: x0 + bw / 2, y: y0 + bh / 2, w: bw / 2, h: bh / 2 },
      ];
      // Shuffle the cells with the seeded random.
      for (let i = cells.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const tmp = cells[i];
        cells[i] = cells[j];
        cells[j] = tmp;
      }
      for (let i = 0; i < count; i += 1) {
        const cell = cells[i];
        const w = Math.min(cell.w - 24, 120 + random() * 150);
        const h = Math.min(cell.h - 24, 100 + random() * 130);
        if (w < 60 || h < 50) continue;
        const x = cell.x + 12 + random() * Math.max(1, cell.w - w - 24);
        const y = cell.y + 12 + random() * Math.max(1, cell.h - h - 24);
        buildings.push({
          x, y, w, h,
          color: PALETTE.building[Math.floor(random() * PALETTE.building.length)],
          roof: random() < 0.5,
          height: 1 + Math.floor(random() * 3),
        });
      }
      // A lamp or hydrant on the block corner.
      if (random() < 0.6) props.push({ kind: random() < 0.6 ? 'lamp' : 'hydrant', x: x0 + 8, y: y0 + 8 });
    }
  }

  // Palms along every sidewalk, skipping intersections and building fronts.
  for (const rx of ROADS_V) {
    for (let y = 90; y < WORLD.height - 90; y += 190) {
      if (ROADS_H.some((ry) => Math.abs(y - ry) < 110)) continue;
      const px = rx + half + 16;
      if (px < BEACH.sandX - 40 && random() < 0.75) palms.push({ x: px, y: y + random() * 40, s: 0.9 + random() * 0.4 });
    }
  }
  for (const ry of ROADS_H) {
    for (let x = 90; x < WORLD.width - 90; x += 190) {
      if (ROADS_V.some((rx) => Math.abs(x - rx) < 110)) continue;
      const py = ry + half + 16;
      if (x < BEACH.sandX - 40 && random() < 0.75) palms.push({ x: x + random() * 40, y: py, s: 0.9 + random() * 0.4 });
    }
  }
  // A palm row down the beach.
  for (let y = 200; y < WORLD.height - 150; y += 170) {
    palms.push({ x: BEACH.sandX + 26, y: y + random() * 30, s: 1 + random() * 0.5 });
  }

  // The story's named places (fixed, so missions and screenshots are stable).
  const zones = {
    spawn: { x: 960, y: 780 },
    docks: { x: 330, y: 2680 },
    safehouse: { x: 3360, y: 330 },
    garage: { x: 1560, y: 2360, w: 220, h: 150 },
    marina: { x: 3800, y: 1500 },
    airstrip: { x: 2400, y: 2900 },
    depot: { x: 600, y: 1900 },
    sportsCar: { x: 2790, y: 1290 },
    cashBags: [
      { x: 960, y: 360 },
      { x: 2160, y: 1860 },
      { x: 1560, y: 860 },
    ],
    depotCrates: [
      { x: 560, y: 1860 },
      { x: 660, y: 1920 },
      { x: 600, y: 1980 },
    ],
  };

  function circleHitsBuilding(x, y, r) {
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      const cx = Math.max(b.x, Math.min(x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r * r) return b;
    }
    return null;
  }

  /** Push a circle out of every building it overlaps; returns the building hit, if any. */
  function resolveCircle(pos, r) {
    let hit = null;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      const cx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(pos.y, b.y + b.h));
      let dx = pos.x - cx;
      let dy = pos.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = b;
      if (d2 < 0.0001) {
        // Centre inside the rectangle: push out along the shortest side.
        const left = pos.x - b.x;
        const right = b.x + b.w - pos.x;
        const top = pos.y - b.y;
        const bottom = b.y + b.h - pos.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.x - r;
        else if (m === right) pos.x = b.x + b.w + r;
        else if (m === top) pos.y = b.y - r;
        else pos.y = b.y + b.h + r;
      } else {
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        pos.x = cx + dx * r;
        pos.y = cy + dy * r;
      }
    }
    return hit;
  }

  function pointOnRoad(x, y) {
    for (const rx of ROADS_V) if (Math.abs(x - rx) < half) return true;
    for (const ry of ROADS_H) if (Math.abs(y - ry) < half) return true;
    return false;
  }

  function inWater(x) {
    return x >= BEACH.waterX;
  }

  /** A random point on a sidewalk (just off a road), clear of buildings. */
  function sidewalkPoint() {
    for (let tries = 0; tries < 40; tries += 1) {
      const vertical = random() < 0.5;
      let x;
      let y;
      if (vertical) {
        const rx = ROADS_V[Math.floor(random() * ROADS_V.length)];
        x = rx + (random() < 0.5 ? -1 : 1) * (half + 18 + random() * 10);
        y = 80 + random() * (WORLD.height - 160);
      } else {
        const ry = ROADS_H[Math.floor(random() * ROADS_H.length)];
        y = ry + (random() < 0.5 ? -1 : 1) * (half + 18 + random() * 10);
        x = 80 + random() * (WORLD.width - 220);
      }
      if (x < 40 || x > BEACH.sandX - 30 || y < 40 || y > WORLD.height - 40) continue;
      if (circleHitsBuilding(x, y, 20)) continue;
      return { x, y };
    }
    return { x: 960, y: 780 };
  }

  /** A random point on a road lane, clear of buildings. */
  function roadPoint() {
    for (let tries = 0; tries < 40; tries += 1) {
      const vertical = random() < 0.5;
      let x;
      let y;
      if (vertical) {
        const rx = ROADS_V[Math.floor(random() * ROADS_V.length)];
        x = rx + (random() < 0.5 ? -1 : 1) * LANE;
        y = 80 + random() * (WORLD.height - 160);
      } else {
        const ry = ROADS_H[Math.floor(random() * ROADS_H.length)];
        y = ry + (random() < 0.5 ? -1 : 1) * LANE;
        x = 80 + random() * (WORLD.width - 220);
      }
      if (x < 40 || x > BEACH.sandX - 30 || y < 40 || y > WORLD.height - 40) continue;
      return { x, y };
    }
    return { x: 960, y: 860 };
  }

  return { buildings, palms, props, zones, circleHitsBuilding, resolveCircle, pointOnRoad, inWater, sidewalkPoint, roadPoint };
}
