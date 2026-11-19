// city.js — Palm City's layout: a road grid, city blocks with buildings,
// palms and props, a beach and two piers on the east shore, and the named
// places the story missions travel between. Pure data + geometry, no DOM,
// so the Node smoke test can import it.

import {
  WORLD_W, WORLD_H, ROADS_X, ROADS_Y, ROAD_W, BEACH_X, WATER_X, ROOF_COLORS,
} from './config.js';
import { mulberry32, pick, randRange, clamp } from './random.js';

// Named places (world coordinates). Markers, missions and pickups use these.
export const PLACES = {
  spawn: { x: 985, y: 855 },
  docks: { x: 3560, y: 2540, label: 'the docks' },
  warehouse: { x: 380, y: 360, label: 'the warehouse' },
  goldCar: { x: 1620, y: 1560, label: 'the gold Sunfire GT' },
  garage: { x: 250, y: 2150, label: "Mara's garage" },
  depot: { x: 500, y: 2380, label: 'the depot' },
  safehouse: { x: 1620, y: 960, label: 'the safehouse' },
  airstrip: { x: 3100, y: 150, label: 'the airstrip' },
  marina: { x: 3600, y: 950, label: 'the marina' },
  spray: { x: 1475, y: 2224, label: "Pay 'n Spray" },
  bags: [
    { x: 340, y: 340 },
    { x: 2240, y: 1560 },
    { x: 3360, y: 2200 },
  ],
};

// Wooden piers that reach over the water: walkable and drivable.
export const PIERS = [
  { x: 3520, y: 905, w: 330, h: 90 }, // marina pier, boat at the end
  { x: 3500, y: 2495, w: 340, h: 90 }, // docks pier
];

// Open ground that is not a road: the airstrip apron up north and the
// depot lot in the south-west. Buildings never cover these.
export const APRON = { x: 2880, y: 40, w: 460, h: 180 };
export const DEPOT_LOT = { x: 400, y: 2180, w: 460, h: 380 };
export const SPRAY_BAY = { x: 1390, y: 2160, w: 170, h: 130 };

const RESERVED = [APRON, DEPOT_LOT, SPRAY_BAY];

export const INTERSECTIONS = [];
for (const x of ROADS_X) for (const y of ROADS_Y) INTERSECTIONS.push({ x, y });

function spans(centers, lo, hi) {
  const out = [];
  let cur = lo;
  for (const c of centers) {
    out.push([cur, c - ROAD_W / 2]);
    cur = c + ROAD_W / 2;
  }
  out.push([cur, hi]);
  return out;
}

function rectsOverlap(a, b, pad = 0) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

export function generateCity(seed) {
  const rng = mulberry32(seed * 7919 + 13);
  const buildings = [];
  const palms = [];
  const props = [];
  const parkingSpots = [];

  const xSpans = spans(ROADS_X, 0, BEACH_X);
  const ySpans = spans(ROADS_Y, 0, WORLD_H);

  for (const [bx0, bx1] of xSpans) {
    for (const [by0, by1] of ySpans) {
      const ix = bx0 + 18;
      const iy = by0 + 18;
      const iw = bx1 - bx0 - 36;
      const ih = by1 - by0 - 36;
      if (iw < 70 || ih < 70) continue;

      // Subdivide the block into lots.
      const cols = iw > 380 ? 2 : 1;
      const rows = ih > 300 ? 2 : 1;
      const gap = 26;
      const lotW = (iw - gap * (cols - 1)) / cols;
      const lotH = (ih - gap * (rows - 1)) / rows;
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          const lot = {
            x: ix + cx * (lotW + gap),
            y: iy + cy * (lotH + gap),
            w: lotW,
            h: lotH,
          };
          if (RESERVED.some((r) => rectsOverlap(lot, r, 4))) continue;
          const roll = rng();
          if (roll < 0.12) {
            // Parking lot: two spots, no building.
            parkingSpots.push({ x: lot.x + lot.w * 0.3, y: lot.y + lot.h / 2, angle: Math.PI / 2 });
            parkingSpots.push({ x: lot.x + lot.w * 0.7, y: lot.y + lot.h / 2, angle: Math.PI / 2 });
          } else if (roll < 0.22) {
            // Plaza: palms and open pavement.
            const n = 3 + Math.floor(rng() * 3);
            for (let i = 0; i < n; i++) {
              palms.push({
                x: lot.x + randRange(rng, 14, lot.w - 14),
                y: lot.y + randRange(rng, 14, lot.h - 14),
                s: randRange(rng, 0.8, 1.25),
              });
            }
          } else {
            buildings.push({
              x: lot.x + 5,
              y: lot.y + 5,
              w: lot.w - 10,
              h: lot.h - 10,
              color: pick(rng, ROOF_COLORS),
              height: randRange(rng, 10, 30),
            });
          }
        }
      }
    }
  }

  // The gold Sunfire GT waits on a marked spot by the central intersection.
  parkingSpots.push({ x: PLACES.goldCar.x, y: PLACES.goldCar.y, angle: 0, reserved: 'gold' });

  // Palms down the beach, clear of the piers.
  for (let y = 90; y < WORLD_H - 60; y += 105) {
    const px = BEACH_X + randRange(rng, 26, 66);
    const py = y + randRange(rng, -18, 18);
    if (PIERS.some((p) => px > p.x - 30 && px < p.x + p.w + 30 && py > p.y - 34 && py < p.y + p.h + 34)) continue;
    palms.push({ x: px, y: py, s: randRange(rng, 0.9, 1.35) });
  }
  // A few palms along the airstrip and the docks road.
  for (let i = 0; i < 7; i++) {
    palms.push({ x: randRange(rng, 2860, 3360), y: randRange(rng, 250, 268), s: randRange(rng, 0.8, 1.1) });
  }

  // Street props: lamps on intersection corners, hydrants on sidewalks.
  for (const { x, y } of INTERSECTIONS) {
    for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      props.push({ kind: 'lamp', x: x + ox * (ROAD_W / 2 + 12), y: y + oy * (ROAD_W / 2 + 12) });
    }
  }
  for (let i = 0; i < 26; i++) {
    const vertical = rng() < 0.5;
    if (vertical) {
      props.push({ kind: 'hydrant', x: pick(rng, ROADS_X) + (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 13), y: randRange(rng, 60, WORLD_H - 60) });
    } else {
      props.push({ kind: 'hydrant', x: randRange(rng, 60, BEACH_X - 60), y: pick(rng, ROADS_Y) + (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 13) });
    }
  }

  return { buildings, palms, props, parkingSpots, piers: PIERS, seed };
}

export function onPier(x, y) {
  return PIERS.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
}

/** True when a circle at (x, y) with radius r hits a building, the water
 *  (off-pier) or the world edge. */
export function circleBlocked(city, x, y, r) {
  if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return true;
  if (x > WATER_X - r && !onPier(x, y)) return true;
  for (const b of city.buildings) {
    if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/** The intersection nearest to a point (used to place police and traffic). */
export function nearestIntersection(x, y) {
  let best = INTERSECTIONS[0];
  let bestD = Infinity;
  for (const p of INTERSECTIONS) {
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
