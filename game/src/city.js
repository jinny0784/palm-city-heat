// city.js — builds the static layout of Palm City from a seed: the road grid,
// the buildings that fill its blocks, palms and street props, the named
// places the story missions travel between, and the intersection graph the
// traffic AI drives on. Pure data in, pure data out — no DOM, no globals —
// so the smoke test can generate the same city the browser plays in.

import { createRng } from './random.js';
import { WORLD_W, WORLD_H, ROAD_W, BEACH_X, ROOF_PAINTS } from './config.js';

// Centre-lines of the avenues (vertical) and streets (horizontal). The grid
// stops short of the beach so the east side stays sand and water.
export const AVENUES = [240, 720, 1200, 1680, 2160, 2640, 3120];
export const STREETS = [240, 800, 1360, 1920, 2480];

// Named story locations, spread so missions cross the whole map.
export const PLACES = {
  docks: { x: 3300, y: 420, label: 'Palm Docks' },
  warehouse: { x: 610, y: 2560, label: 'West Warehouse' },
  garage: { x: 2290, y: 615, label: "Rico's Garage" },
  depot: { x: 1570, y: 1090, label: 'Sunport Depot' },
  safehouse: { x: 650, y: 2070, label: 'Safehouse' },
  airstrip: { x: 380, y: 2620, label: 'Old Airstrip' },
  marina: { x: 3470, y: 2560, label: 'Marina Pier' },
  spray: { x: 1905, y: 1625, label: "Pay 'n Spray" },
  hospital: { x: 1010, y: 905, label: 'Mercy Hospital' },
  precinct: { x: 1505, y: 305, label: 'Precinct' },
};

// Where the fixed pickups live (bribe stars, health, armour).
export const BRIBE_SPOTS = [
  { x: 830, y: 1470 },
  { x: 2530, y: 905 },
  { x: 2980, y: 2200 },
];

function blockFree(x, y, w, h, keepOut) {
  for (const k of keepOut) {
    if (x < k.x + k.w && x + w > k.x && y < k.y + k.h && y + h > k.y) return false;
  }
  return true;
}

export function generateCity(seed) {
  const rng = createRng(seed * 7919 + 13);

  // Keep-out pads around the named places so buildings never swallow a
  // mission target or the Pay 'n Spray bay.
  const keepOut = Object.values(PLACES).map((p) => ({ x: p.x - 85, y: p.y - 85, w: 170, h: 170 }));
  keepOut.push({ x: 250, y: 2540, w: 620, h: 170 }); // airstrip runway

  const buildings = [];
  const half = ROAD_W / 2;
  for (let i = 0; i < AVENUES.length - 1; i++) {
    for (let j = 0; j < STREETS.length - 1; j++) {
      const bx = AVENUES[i] + half + 26;
      const bw = AVENUES[i + 1] - half - 26 - bx;
      const by = STREETS[j] + half + 26;
      const bh = STREETS[j + 1] - half - 26 - by;
      // Each block gets a 2x2 arrangement of lots with a small plaza gap.
      const lotW = (bw - 18) / 2;
      const lotH = (bh - 18) / 2;
      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          if (rng.chance(0.12)) continue; // occasional empty lot / plaza
          const w = lotW * rng.range(0.78, 0.97);
          const h = lotH * rng.range(0.78, 0.97);
          const x = bx + a * (lotW + 18) + (lotW - w) / 2;
          const y = by + b * (lotH + 18) + (lotH - h) / 2;
          if (!blockFree(x, y, w, h, keepOut)) continue;
          buildings.push({
            x, y, w, h,
            color: rng.pick(ROOF_PAINTS),
            floors: rng.int(2, 9),
          });
        }
      }
    }
  }

  // Palms line the sidewalks and crowd the beach.
  const palms = [];
  for (const ax of AVENUES) {
    for (let y = 90; y < WORLD_H - 60; y += 118) {
      if (rng.chance(0.8)) palms.push({ x: ax - half - 16, y: y + rng.range(-14, 14) });
      if (rng.chance(0.8)) palms.push({ x: ax + half + 16, y: y + rng.range(-14, 14) });
    }
  }
  for (let y = 120; y < WORLD_H - 80; y += 96) {
    palms.push({ x: BEACH_X + rng.range(6, 60), y });
  }
  // Palms are scenery only where they do not sit inside a building.
  const clearPalms = palms.filter(
    (p) => !buildings.some((b) => p.x > b.x - 8 && p.x < b.x + b.w + 8 && p.y > b.y - 8 && p.y < b.y + b.h + 8),
  );

  // Street props: lamps and hydrants along the avenues (visual dressing).
  const props = [];
  for (const ax of AVENUES) {
    for (let y = 150; y < WORLD_H - 100; y += 210) {
      props.push({ x: ax - half - 8, y, kind: 'lamp' });
      props.push({ x: ax + half + 8, y: y + 105, kind: 'lamp' });
    }
  }

  // Parked cars hug the kerbs: alongside the avenues at mid-block, and
  // alongside a few streets. Kerb spots are computed from the grid itself
  // (just off the tarmac, clear of the building lots), so a parked car can
  // never end up inside a building.
  const kerb = half + 13;
  const spotDefs = [
    [AVENUES[0] - kerb, 520, Math.PI / 2],
    [AVENUES[1] + kerb, 1640, Math.PI / 2],
    [AVENUES[2] - kerb, 1080, Math.PI / 2],
    [AVENUES[3] + kerb, 2200, Math.PI / 2],
    [AVENUES[4] - kerb, 520, Math.PI / 2],
    [AVENUES[5] + kerb, 1640, Math.PI / 2],
    [AVENUES[6] - kerb, 1080, Math.PI / 2],
    [960, STREETS[1] - kerb, 0],
    [1920, STREETS[3] + kerb, 0],
    [1440, STREETS[4] - kerb, 0],
    [AVENUES[5] - kerb, 2760, Math.PI / 2],
    [480, STREETS[2] + kerb, 0],
  ];
  const parkedSpots = [];
  for (const [x, y, ang] of spotDefs) parkedSpots.push({ x, y, angle: ang });

  // Intersection graph for traffic: nodes where avenues cross streets, each
  // linked to its grid neighbours.
  const nodes = [];
  const nodeIndex = new Map();
  for (let i = 0; i < AVENUES.length; i++) {
    for (let j = 0; j < STREETS.length; j++) {
      nodeIndex.set(i + ',' + j, nodes.length);
      nodes.push({ x: AVENUES[i], y: STREETS[j], i, j, next: [] });
    }
  }
  for (const n of nodes) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [di, dj] of dirs) {
      const key = (n.i + di) + ',' + (n.j + dj);
      if (nodeIndex.has(key)) n.next.push(nodeIndex.get(key));
    }
  }

  return {
    width: WORLD_W,
    height: WORLD_H,
    avenues: AVENUES,
    streets: STREETS,
    roadW: ROAD_W,
    buildings,
    palms: clearPalms,
    props,
    parkedSpots,
    places: PLACES,
    bribeSpots: BRIBE_SPOTS,
    nodes,
  };
}

// Is a point on tarmac? Used for spawning and for keeping walkers sensible.
export function onRoad(city, x, y) {
  const half = city.roadW / 2 + 4;
  for (const ax of city.avenues) if (Math.abs(x - ax) < half) return true;
  for (const sy of city.streets) if (Math.abs(y - sy) < half) return true;
  return false;
}

// Nearest intersection node index to a point.
export function nearestNode(city, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < city.nodes.length; i++) {
    const n = city.nodes[i];
    const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
