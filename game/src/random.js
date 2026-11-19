// random.js — deterministic randomness and small math helpers.
//
// The whole simulation runs off one seeded generator (mulberry32) so a
// given seed always produces the same city, the same traffic and the same
// staged screenshot scenes. Nothing in the simulation uses Math.random.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function randInt(rng, lo, hi) {
  return Math.floor(randRange(rng, lo, hi + 1));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(a) {
  while (a >= Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Turn `angle` toward `target` by at most `maxDelta` radians. */
export function turnToward(angle, target, maxDelta) {
  const d = wrapAngle(target - angle);
  if (d > maxDelta) return angle + maxDelta;
  if (d < -maxDelta) return angle - maxDelta;
  return target;
}
