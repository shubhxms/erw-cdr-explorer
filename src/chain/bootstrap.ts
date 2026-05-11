/**
 * Bootstrap helpers — all stream-style: never materialise the full
 * (N_runs × M) indices array.
 *
 * For a paired plot, all six (bl/rp × Ti/Ca/Mg) means share the same
 * indices within an iteration. We exploit that by drawing M indices per
 * iteration and updating six accumulators in one pass.
 */

export function resampleMean(
  rng: () => number,
  values: Float64Array | number[],
  nRuns: number,
): Float64Array {
  const m = values.length;
  const out = new Float64Array(nRuns);
  for (let i = 0; i < nRuns; i++) {
    let sum = 0;
    for (let j = 0; j < m; j++) {
      sum += values[(rng() * m) | 0];
    }
    out[i] = sum / m;
  }
  return out;
}

export interface PairedBoot6 {
  bl_ti: Float64Array;
  rp_ti: Float64Array;
  bl_ca: Float64Array;
  rp_ca: Float64Array;
  bl_mg: Float64Array;
  rp_mg: Float64Array;
}

export function pairedBootstrap6(
  rng: () => number,
  bl_ti: Float64Array,
  rp_ti: Float64Array,
  bl_ca: Float64Array,
  rp_ca: Float64Array,
  bl_mg: Float64Array,
  rp_mg: Float64Array,
  nRuns: number,
): PairedBoot6 {
  const m = bl_ti.length;
  const out_bl_ti = new Float64Array(nRuns);
  const out_rp_ti = new Float64Array(nRuns);
  const out_bl_ca = new Float64Array(nRuns);
  const out_rp_ca = new Float64Array(nRuns);
  const out_bl_mg = new Float64Array(nRuns);
  const out_rp_mg = new Float64Array(nRuns);
  for (let i = 0; i < nRuns; i++) {
    let s1 = 0,
      s2 = 0,
      s3 = 0,
      s4 = 0,
      s5 = 0,
      s6 = 0;
    for (let j = 0; j < m; j++) {
      const k = (rng() * m) | 0;
      s1 += bl_ti[k];
      s2 += rp_ti[k];
      s3 += bl_ca[k];
      s4 += rp_ca[k];
      s5 += bl_mg[k];
      s6 += rp_mg[k];
    }
    out_bl_ti[i] = s1 / m;
    out_rp_ti[i] = s2 / m;
    out_bl_ca[i] = s3 / m;
    out_rp_ca[i] = s4 / m;
    out_bl_mg[i] = s5 / m;
    out_rp_mg[i] = s6 / m;
  }
  return {
    bl_ti: out_bl_ti,
    rp_ti: out_rp_ti,
    bl_ca: out_bl_ca,
    rp_ca: out_rp_ca,
    bl_mg: out_bl_mg,
    rp_mg: out_rp_mg,
  };
}

/**
 * Control bootstrap — only cation columns (Ti not needed for the correction).
 */
export interface ControlBoot4 {
  bl_ca: Float64Array;
  rp_ca: Float64Array;
  bl_mg: Float64Array;
  rp_mg: Float64Array;
}

export function controlBootstrap4(
  rng: () => number,
  bl_ca: Float64Array,
  rp_ca: Float64Array,
  bl_mg: Float64Array,
  rp_mg: Float64Array,
  nRuns: number,
): ControlBoot4 {
  const m = bl_ca.length;
  const o_bl_ca = new Float64Array(nRuns);
  const o_rp_ca = new Float64Array(nRuns);
  const o_bl_mg = new Float64Array(nRuns);
  const o_rp_mg = new Float64Array(nRuns);
  for (let i = 0; i < nRuns; i++) {
    let s1 = 0,
      s2 = 0,
      s3 = 0,
      s4 = 0;
    for (let j = 0; j < m; j++) {
      const k = (rng() * m) | 0;
      s1 += bl_ca[k];
      s2 += rp_ca[k];
      s3 += bl_mg[k];
      s4 += rp_mg[k];
    }
    o_bl_ca[i] = s1 / m;
    o_rp_ca[i] = s2 / m;
    o_bl_mg[i] = s3 / m;
    o_rp_mg[i] = s4 / m;
  }
  return { bl_ca: o_bl_ca, rp_ca: o_rp_ca, bl_mg: o_bl_mg, rp_mg: o_rp_mg };
}
