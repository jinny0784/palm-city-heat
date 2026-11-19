// A small seeded random number generator (mulberry32) plus helpers.
//
// The whole city and every staged scene are built from one seed, so a
// given seed always builds the same Palm City — that is what makes the
// screenshot scenes and the smoke test deterministic.

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max]. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** One element of a non-empty array. */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** True with probability p. */
    chance: (p) => next() < p,
  };
}
