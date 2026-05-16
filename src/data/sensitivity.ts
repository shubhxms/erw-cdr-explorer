/**
 * Sensitivity sweep — one-at-a-time (OAT) perturbation of selected chain
 * inputs, producing a tornado chart of p16 deltas.
 *
 * Each input is scaled to baseline*(1±scale), the chain is re-run, and the
 * resulting p16 is recorded. Bars are sorted by |Δ+| + |Δ−| descending so
 * the dominant inputs surface at the top.
 *
 * Caveat (documented in the UI): OAT does not capture interaction effects.
 * Sobol variance decomposition is the natural next step.
 */

import type { EditSpec } from "../types/edits";

export interface SweepInputDef {
  /** Stable id used as the JSON key + React list key. */
  id: string;
  label: string;
  unit?: string;
  /** Build the perturbation EditSpec for sign ∈ {+1, −1} at the given scale. */
  buildEdit: (sign: 1 | -1, scale: number) => EditSpec;
}

const APP_RATE_BASELINE = 14_800;

export const SWEEP_INPUTS: SweepInputDef[] = [
  {
    id: "application_rate_kg_ha",
    label: "Application rate",
    unit: "kg/ha",
    buildEdit: (sign, scale) => ({
      kind: "scalar",
      nodeId: "constants/application_rate_kg_ha",
      value: APP_RATE_BASELINE * (1 + sign * scale),
    }),
  },
  {
    id: "feedstock_ca",
    label: "Feedstock Ca (mass fraction)",
    buildEdit: (sign, scale) => ({
      kind: "column_transform",
      nodeId: "inputs/feedstock_samples",
      column: "mass_fraction_ca",
      op: "scale",
      value: 1 + sign * scale,
    }),
  },
  {
    id: "feedstock_mg",
    label: "Feedstock Mg (mass fraction)",
    buildEdit: (sign, scale) => ({
      kind: "column_transform",
      nodeId: "inputs/feedstock_samples",
      column: "mass_fraction_mg",
      op: "scale",
      value: 1 + sign * scale,
    }),
  },
  {
    id: "feedstock_ti",
    label: "Feedstock Ti (tracer mass fraction)",
    buildEdit: (sign, scale) => ({
      kind: "column_transform",
      nodeId: "inputs/feedstock_samples",
      column: "mass_fraction_ti",
      op: "scale",
      value: 1 + sign * scale,
    }),
  },
];

/** On-disk format. Shipped at `/checkpoints/<removalId>/sensitivity.json`. */
export interface SensitivityFile {
  computed_at: string;
  removal_id: string;
  n_runs: number;
  seed: number;
  scale: number;
  baseline_p16: number;
  results: {
    id: string;
    plus_p16: number;
    minus_p16: number;
  }[];
}

/** In-memory representation used by the chart. */
export interface SweepResultRow {
  id: string;
  label: string;
  unit?: string;
  baselineP16: number;
  plusP16: number;
  minusP16: number;
  deltaPlus: number;
  deltaMinus: number;
  /** |Δ+| + |Δ−|, used for sorting bars by dominance. */
  magnitude: number;
}

export interface SweepSummary {
  baselineP16: number;
  scale: number;
  nRuns: number;
  seed: number;
  computedAt: string;
  removalId: string;
  precomputed: boolean;
  rows: SweepResultRow[];
}

export function rowsFromFile(file: SensitivityFile): SweepSummary {
  const baseline = file.baseline_p16;
  const rows: SweepResultRow[] = file.results.map((r) => {
    const def = SWEEP_INPUTS.find((d) => d.id === r.id);
    const dp = r.plus_p16 - baseline;
    const dm = r.minus_p16 - baseline;
    return {
      id: r.id,
      label: def?.label ?? r.id,
      unit: def?.unit,
      baselineP16: baseline,
      plusP16: r.plus_p16,
      minusP16: r.minus_p16,
      deltaPlus: dp,
      deltaMinus: dm,
      magnitude: Math.abs(dp) + Math.abs(dm),
    };
  });
  rows.sort((a, b) => b.magnitude - a.magnitude);
  return {
    baselineP16: file.baseline_p16,
    scale: file.scale,
    nRuns: file.n_runs,
    seed: file.seed,
    computedAt: file.computed_at,
    removalId: file.removal_id,
    precomputed: true,
    rows,
  };
}

export async function loadPrecomputedSensitivity(
  removalId: string,
): Promise<SweepSummary | null> {
  try {
    const r = await fetch(`/checkpoints/${removalId}/sensitivity.json`);
    if (!r.ok) return null;
    const file = (await r.json()) as SensitivityFile;
    return rowsFromFile(file);
  } catch {
    return null;
  }
}

/** Build a deterministic ordering of (input, sign) steps for orchestration. */
export interface SweepStep {
  inputId: string; // or "baseline"
  inputLabel: string;
  sign: 0 | 1 | -1; // 0 = baseline
  edits: EditSpec[]; // edits to apply for this step (empty for baseline)
}

export function buildSweepPlan(scale: number): SweepStep[] {
  const steps: SweepStep[] = [
    { inputId: "baseline", inputLabel: "Baseline", sign: 0, edits: [] },
  ];
  for (const def of SWEEP_INPUTS) {
    steps.push({
      inputId: def.id,
      inputLabel: `${def.label} +${(scale * 100).toFixed(0)}%`,
      sign: 1,
      edits: [def.buildEdit(1, scale)],
    });
    steps.push({
      inputId: def.id,
      inputLabel: `${def.label} −${(scale * 100).toFixed(0)}%`,
      sign: -1,
      edits: [def.buildEdit(-1, scale)],
    });
  }
  return steps;
}
