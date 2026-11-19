// random.js — a small seeded random number generator plus the geometry and
// math helpers the rest of the game shares. Everything in Palm City Heat is
// built from a seed so a given world always comes out the same way, which is
// what makes the staged screenshot scenes and the smoke test reproducible.

// mulberry32: tiny, fast, good-enough distribution for game dressing.
export function createRng(seed) {
  let a = (seed >>> 0) || 1;
  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    // float in [min, max)
    range(min, max) {
      return min + next() * (max - min);
    },
    // integer in [min, max] inclusive
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
    angle() {
      return next() * Math.PI * 2;
    },
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

// shortest signed difference from a to b, in (-PI, PI]
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDiff(a, b) * clamp(t, 0, 1);
}

// circle vs axis-aligned box overlap test
export function circleHitsBox(cx, cy, r, box) {
  const nx = clamp(cx, box.x, box.x + box.w);
  const ny = clamp(cy, box.y, box.y + box.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// push a circle out of a box along the shallowest axis; returns corrected [x, y]
export function pushCircleOutOfBox(cx, cy, r, box) {
  const nx = clamp(cx, box.x, box.x + box.w);
  const ny = clamp(cy, box.y, box.y + box.h);
  let dx = cx - nx;
  let dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return [cx, cy];
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return [nx + (dx / d) * r, ny + (dy / d) * r];
  }
  // centre is inside the box: escape through the nearest face
  const left = cx - box.x;
  const right = box.x + box.w - cx;
  const top = cy - box.y;
  const bottom = box.y + box.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return [box.x - r, cy];
  if (m === right) return [box.x + box.w + r, cy];
  if (m === top) return [cx, box.y - r];
  return [cx, box.y + box.h + r];
}
