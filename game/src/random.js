// Seeded randomness for Palm City Heat.
//
// The whole simulation runs off one mulberry32 generator so a given seed
// always builds the same city and plays the same way. Nothing in the world
// code touches Math.random: if it did, the staged screenshot scenes and
// the Node smoke test could not reproduce a run.

/** Create a mulberry32 generator from a 32-bit seed. */
export function createRandom(seed) {
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
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** Integer in [min, max], both ends included. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
    /** One element of an array. */
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
  };
}

/** Small stable hash of two integers, for per-building decoration. */
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
