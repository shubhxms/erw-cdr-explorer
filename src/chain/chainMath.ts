/**
 * Per-iteration chain math, elementwise on Float64Array.
 *
 * Formulas mirror code.py / PROCEDURE.md:
 *  - mass_ratio = (rp_ti − bl_ti) / (fs_ti − rp_ti)
 *  - post_app   = bl + mass_ratio · (fs − bl)
 *  - frac_diss  = (post_app − rp / ctrl_corr) / (mass_ratio · fs)
 *  - cdr_kg_ha  = frac_diss · 14,800 · fs / 1e6
 *  - co2_kg_ha  = cdr_kg_ha · stoich[cation]
 */

export const STOICH = { Ca: 2.196, Mg: 3.621 } as const;
export const APPLICATION_RATE_KG_HA = 14800;

export function massRatio(
  fs_ti: Float64Array,
  bl_ti: Float64Array,
  rp_ti: Float64Array,
): Float64Array {
  const n = fs_ti.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (rp_ti[i] - bl_ti[i]) / (fs_ti[i] - rp_ti[i]);
  }
  return out;
}

export function postApp(
  mass_ratio: Float64Array,
  bl: Float64Array,
  fs: Float64Array,
): Float64Array {
  const n = mass_ratio.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = bl[i] + mass_ratio[i] * (fs[i] - bl[i]);
  }
  return out;
}

export function fracDissolved(
  mass_ratio: Float64Array,
  post_app: Float64Array,
  rp: Float64Array,
  fs: Float64Array,
  ctrl_corr: number,
): Float64Array {
  const n = mass_ratio.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] =
      (post_app[i] - rp[i] / ctrl_corr) / (mass_ratio[i] * fs[i]);
  }
  return out;
}

export function cdrKgHa(
  frac_diss: Float64Array,
  fs: Float64Array,
): Float64Array {
  const n = frac_diss.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (frac_diss[i] * APPLICATION_RATE_KG_HA * fs[i]) / 1e6;
  }
  return out;
}

export function co2KgHa(
  cdr_kg_ha: Float64Array,
  cation: "Ca" | "Mg",
): Float64Array {
  const n = cdr_kg_ha.length;
  const k = STOICH[cation];
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = cdr_kg_ha[i] * k;
  return out;
}

export function add(a: Float64Array, b: Float64Array): Float64Array {
  const n = a.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i] + b[i];
  return out;
}

export function scale(a: Float64Array, k: number): Float64Array {
  const n = a.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i] * k;
  return out;
}

/**
 * Application rate from tracer: mass_ratio · bulk_density · depth_cm · 100,
 * giving kg/ha. Diagnostic only.
 */
export function appRateKgHa(
  mass_ratio: Float64Array,
  bulk_density: Float64Array,
  depthCm: number,
): Float64Array {
  const n = mass_ratio.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = mass_ratio[i] * bulk_density[i] * depthCm * 100;
  }
  return out;
}

/**
 * Control correction ratio bootstrap = rp / bl, elementwise.
 */
export function controlCorrectionRatio(
  bl: Float64Array,
  rp: Float64Array,
): Float64Array {
  const n = bl.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = rp[i] / bl[i];
  return out;
}
