/**
 * Pair locations between baseline and reporting-period samples for one plot.
 *
 * Output: SoA paired columns (Float64Array per element/period). Locations that
 * don't appear in both periods are dropped (the dataset reports 0 unpaired
 * after cleaning so this rarely matters in practice).
 */

import type { RawSample } from "./cleaning";

export interface Paired {
  /** number of paired locations */
  n: number;
  bl_ti: Float64Array;
  rp_ti: Float64Array;
  bl_ca: Float64Array;
  rp_ca: Float64Array;
  bl_mg: Float64Array;
  rp_mg: Float64Array;
}

export function pairLocations(
  baseline: RawSample[],
  reportingPeriod: RawSample[],
): Paired {
  const blMap = new Map<string, RawSample>();
  for (const s of baseline) blMap.set(s.measurement_location_reference_id, s);
  const matched: Array<[RawSample, RawSample]> = [];
  for (const s of reportingPeriod) {
    const bl = blMap.get(s.measurement_location_reference_id);
    if (bl) matched.push([bl, s]);
  }
  const n = matched.length;
  const bl_ti = new Float64Array(n);
  const rp_ti = new Float64Array(n);
  const bl_ca = new Float64Array(n);
  const rp_ca = new Float64Array(n);
  const bl_mg = new Float64Array(n);
  const rp_mg = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [bl, rp] = matched[i];
    bl_ti[i] = bl.mass_fraction_ti;
    rp_ti[i] = rp.mass_fraction_ti;
    bl_ca[i] = bl.mass_fraction_ca;
    rp_ca[i] = rp.mass_fraction_ca;
    bl_mg[i] = bl.mass_fraction_mg;
    rp_mg[i] = rp.mass_fraction_mg;
  }
  return { n, bl_ti, rp_ti, bl_ca, rp_ca, bl_mg, rp_mg };
}
