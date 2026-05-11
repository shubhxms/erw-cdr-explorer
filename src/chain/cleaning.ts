/**
 * Cleaning stage — zero_filter + winsorise.
 *
 * Approximates the Isometric library behaviour:
 *  - zero_filter drops every row for a location whose Ca, Mg, or Ti is 0 in
 *    *any* of its samples (location-based, applied across both periods).
 *  - winsorise per (sampling_event × plot_type) group clips each column to
 *    [μ − n_std·σ, μ + n_std·σ].
 *
 * Bit-exact match to the library is not required; the user has confirmed
 * the recomputed p16 may differ from the precomputed one.
 */

export interface RawSample {
  measurement_location_reference_id: string;
  mass_fraction_ca: number;
  mass_fraction_mg: number;
  mass_fraction_ti: number;
  plot_type: string;
  sampling_event: string;
}

const CLEAN_COLS = [
  "mass_fraction_ca",
  "mass_fraction_mg",
  "mass_fraction_ti",
] as const;

export function zeroFilter(samples: RawSample[]): {
  samples: RawSample[];
  flagged: number;
  dropped: number;
} {
  const bad = new Set<string>();
  for (const s of samples) {
    if (
      s.mass_fraction_ca === 0 ||
      s.mass_fraction_mg === 0 ||
      s.mass_fraction_ti === 0
    ) {
      bad.add(s.measurement_location_reference_id);
    }
  }
  const out: RawSample[] = [];
  for (const s of samples) {
    if (!bad.has(s.measurement_location_reference_id)) out.push(s);
  }
  return {
    samples: out,
    flagged: samples.filter((s) =>
      bad.has(s.measurement_location_reference_id),
    ).length,
    dropped: samples.length - out.length,
  };
}

export function winsorise(
  samples: RawSample[],
  nStd = 3,
): { samples: RawSample[]; clipped: number } {
  const groups = new Map<string, RawSample[]>();
  for (const s of samples) {
    const k = `${s.sampling_event}|${s.plot_type}`;
    let arr = groups.get(k);
    if (!arr) {
      arr = [];
      groups.set(k, arr);
    }
    arr.push(s);
  }

  let clipped = 0;
  // Mutate copies so the inputs aren't disturbed.
  const out = samples.map((s) => ({ ...s }));
  // Re-index out into groups (same order assumed since we used identity above).
  const outGroups = new Map<string, RawSample[]>();
  for (const s of out) {
    const k = `${s.sampling_event}|${s.plot_type}`;
    let arr = outGroups.get(k);
    if (!arr) {
      arr = [];
      outGroups.set(k, arr);
    }
    arr.push(s);
  }
  for (const group of outGroups.values()) {
    for (const col of CLEAN_COLS) {
      const m = group.length;
      let sum = 0;
      for (let i = 0; i < m; i++) sum += group[i][col];
      const mean = sum / m;
      let ss = 0;
      for (let i = 0; i < m; i++) {
        const d = group[i][col] - mean;
        ss += d * d;
      }
      const std = Math.sqrt(ss / m);
      const lo = mean - nStd * std;
      const hi = mean + nStd * std;
      for (const s of group) {
        const v = s[col];
        if (v < lo) {
          s[col] = lo;
          clipped++;
        } else if (v > hi) {
          s[col] = hi;
          clipped++;
        }
      }
    }
  }
  return { samples: out, clipped };
}
