/**
 * Input edits (causal) + node overrides (counterfactual).
 *
 * Edits are batched in the store and serialised into the worker `run` message.
 * The chain.py Python side applies them at the right point: input edits at the
 * top of run(), overrides inside track_array() right before posting the result.
 */

/** Identifies a "virtual" constant scalar parameter not currently a DAG node. */
export type ConstantId =
  | "constants/application_rate_kg_ha"
  | "constants/sampling_depth_cm"
  | "constants/winsorise_n_std"
  | "constants/zero_filter_enabled";

export interface ConstantMeta {
  id: ConstantId;
  label: string;
  description: string;
  defaultValue: number | boolean;
  kind: "scalar" | "toggle";
  range?: [number, number]; // soft hint for UI
}

export const CONSTANTS: ConstantMeta[] = [
  {
    id: "constants/application_rate_kg_ha",
    label: "Application rate",
    description: "Known feedstock application rate (linear multiplier on CDR).",
    defaultValue: 14800,
    kind: "scalar",
    range: [10000, 20000],
  },
  {
    id: "constants/sampling_depth_cm",
    label: "Sampling depth",
    description: "Soil sampling depth (cm). Feeds soil_mass_kg_ha (validation only).",
    defaultValue: 30,
    kind: "scalar",
    range: [15, 60],
  },
  {
    id: "constants/winsorise_n_std",
    label: "Winsorise n_std",
    description: "Clip per-group values beyond mean ± n×std during cleaning.",
    defaultValue: 3,
    kind: "scalar",
    range: [1.5, 6],
  },
  {
    id: "constants/zero_filter_enabled",
    label: "Zero filter",
    description: "Drop locations with any zero in Ca/Mg/Ti before winsorise.",
    defaultValue: true,
    kind: "toggle",
  },
];

export type EditSpec =
  | {
      kind: "scalar";
      nodeId: ConstantId;
      value: number;
    }
  | {
      kind: "toggle";
      nodeId: ConstantId;
      value: boolean;
    }
  | {
      kind: "column_transform";
      nodeId: "inputs/feedstock_samples" | "inputs/bulk_density_samples";
      column: string;
      op: "replace_mean" | "shift_mean" | "scale";
      value: number;
    }
  | {
      kind: "area";
      nodeId: "inputs/area_hectares";
      plotType: "deployment" | "treatment" | "control";
      value: number;
    };

export type OverrideSpec =
  | { kind: "collapse"; nodeId: string; value: number }
  | { kind: "shift"; nodeId: string; target_mean: number };
