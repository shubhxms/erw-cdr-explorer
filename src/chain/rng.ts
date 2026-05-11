/**
 * Mulberry32 PRNG — seeded, deterministic, fast in JS.
 *
 * NOT bit-equivalent to numpy's PCG64; results will differ slightly from
 * `code.py` runs, but the seed determines the stream so the JS chain is
 * itself reproducible.
 */
export function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
