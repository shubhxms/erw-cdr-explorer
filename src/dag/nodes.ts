/**
 * Canonical DAG node definitions, mirroring run_chain.py step order.
 *
 * Node IDs match manifest.json entry IDs (path-derived, e.g. "bootstrap/fs_ti").
 * Stage is used for column layout and styling.
 */

export type Stage =
  | "inputs"
  | "cleaning"
  | "bootstrap"
  | "chain_deployment"
  | "chain_treatment"
  | "diagnostics"
  | "aggregation";

export interface DagNode {
  id: string;
  label: string;
  stage: Stage;
  step: number; // execution order within run_chain.py
  description?: string;
}

export const NODES: DagNode[] = [
  // -- S1 inputs --
  { id: "inputs/raw_samples", label: "raw_samples", stage: "inputs", step: 0, description: "Soil samples after spatial assignment." },
  { id: "inputs/feedstock_samples", label: "feedstock_samples", stage: "inputs", step: 0, description: "Feedstock composition (Ca, Mg, Ti) – n=25." },
  { id: "inputs/bulk_density_samples", label: "bulk_density_samples", stage: "inputs", step: 0, description: "Bulk density measurements – 151 non-null of 11,246." },
  { id: "inputs/area_hectares", label: "area_hectares", stage: "inputs", step: 0, description: "Plot areas: deployment 2549.87 ha, treatment 67.06 ha, control 67.06 ha." },

  // -- Cleaning --
  { id: "cleaning/cleaning_report", label: "cleaning_report", stage: "cleaning", step: 1, description: "Zero-filter + winsorise summary." },
  { id: "cleaning/deployment_baseline", label: "deployment_baseline", stage: "cleaning", step: 1 },
  { id: "cleaning/deployment_reporting_period", label: "deployment_reporting_period", stage: "cleaning", step: 1 },
  { id: "cleaning/treatment_baseline", label: "treatment_baseline", stage: "cleaning", step: 1 },
  { id: "cleaning/treatment_reporting_period", label: "treatment_reporting_period", stage: "cleaning", step: 1 },
  { id: "cleaning/control_baseline", label: "control_baseline", stage: "cleaning", step: 1 },
  { id: "cleaning/control_reporting_period", label: "control_reporting_period", stage: "cleaning", step: 1 },

  // -- S2 bootstrap: bulk density --
  { id: "bootstrap/bd_boot", label: "bd_boot [N]", stage: "bootstrap", step: 2, description: "Bootstrap means of bulk density." },
  { id: "bootstrap/bd_mean", label: "bd_mean", stage: "bootstrap", step: 3, description: "Empirical mean of 151 bulk density values." },
  { id: "bootstrap/soil_mass_kg_ha", label: "soil_mass_kg_ha", stage: "bootstrap", step: 3, description: "bd_mean × depth × 100." },

  // -- S2 bootstrap: feedstock (three independent calls; uncorrelated) --
  { id: "bootstrap/fs_ti", label: "fs_ti [N]", stage: "bootstrap", step: 5, description: "Bootstrap mean feedstock Ti." },
  { id: "bootstrap/fs_ca", label: "fs_ca [N]", stage: "bootstrap", step: 5, description: "Bootstrap mean feedstock Ca." },
  { id: "bootstrap/fs_mg", label: "fs_mg [N]", stage: "bootstrap", step: 5, description: "Bootstrap mean feedstock Mg." },

  // -- S2 control --
  { id: "bootstrap/control_paired", label: "control_paired", stage: "bootstrap", step: 6, description: "Paired control bl/rp rows (~894)." },
  { id: "bootstrap/ctl_bl_mass_fraction_ca", label: "ctl_bl_ca [N]", stage: "bootstrap", step: 7 },
  { id: "bootstrap/ctl_rp_mass_fraction_ca", label: "ctl_rp_ca [N]", stage: "bootstrap", step: 7 },
  { id: "bootstrap/ctl_corr_boot_mass_fraction_ca", label: "ctl_corr_boot_ca [N]", stage: "bootstrap", step: 7, description: "Bootstrap of rp_ca / bl_ca ratios." },
  { id: "bootstrap/ctrl_corr_p50_mass_fraction_ca", label: "ctrl_corr_p50_ca", stage: "bootstrap", step: 7, description: "Median of control-correction bootstrap." },
  { id: "bootstrap/ctl_bl_mass_fraction_mg", label: "ctl_bl_mg [N]", stage: "bootstrap", step: 7 },
  { id: "bootstrap/ctl_rp_mass_fraction_mg", label: "ctl_rp_mg [N]", stage: "bootstrap", step: 7 },
  { id: "bootstrap/ctl_corr_boot_mass_fraction_mg", label: "ctl_corr_boot_mg [N]", stage: "bootstrap", step: 7 },
  { id: "bootstrap/ctrl_corr_p50_mass_fraction_mg", label: "ctrl_corr_p50_mg", stage: "bootstrap", step: 7 },

  // -- S3 deployment chain --
  { id: "chain_deployment/paired", label: "dep_paired", stage: "chain_deployment", step: 8, description: "Paired deployment bl/rp (~894)." },
  { id: "chain_deployment/bl_ti", label: "dep_bl_ti [N]", stage: "chain_deployment", step: 9 },
  { id: "chain_deployment/rp_ti", label: "dep_rp_ti [N]", stage: "chain_deployment", step: 9 },
  { id: "chain_deployment/mass_ratio", label: "dep_mass_ratio [N]", stage: "chain_deployment", step: 10, description: "(rp_ti − bl_ti) / (fs_ti − rp_ti)." },
  { id: "chain_deployment/app_rate_kg_ha", label: "dep_app_rate_kg_ha [N]", stage: "chain_deployment", step: 11, description: "Tracer-derived application rate (diagnostic)." },
  { id: "chain_deployment/bl_mass_fraction_ca", label: "dep_bl_ca [N]", stage: "chain_deployment", step: 12 },
  { id: "chain_deployment/rp_mass_fraction_ca", label: "dep_rp_ca [N]", stage: "chain_deployment", step: 12 },
  { id: "chain_deployment/post_app_mass_fraction_ca", label: "dep_post_app_ca [N]", stage: "chain_deployment", step: 13 },
  { id: "chain_deployment/frac_diss_mass_fraction_ca", label: "dep_frac_diss_ca [N]", stage: "chain_deployment", step: 14 },
  { id: "chain_deployment/cdr_mass_fraction_ca_kg_ha", label: "dep_cdr_ca [N]", stage: "chain_deployment", step: 15 },
  { id: "chain_deployment/co2_mass_fraction_ca_kg_ha", label: "dep_co2_ca [N]", stage: "chain_deployment", step: 16 },
  { id: "chain_deployment/bl_mass_fraction_mg", label: "dep_bl_mg [N]", stage: "chain_deployment", step: 12 },
  { id: "chain_deployment/rp_mass_fraction_mg", label: "dep_rp_mg [N]", stage: "chain_deployment", step: 12 },
  { id: "chain_deployment/post_app_mass_fraction_mg", label: "dep_post_app_mg [N]", stage: "chain_deployment", step: 13 },
  { id: "chain_deployment/frac_diss_mass_fraction_mg", label: "dep_frac_diss_mg [N]", stage: "chain_deployment", step: 14 },
  { id: "chain_deployment/cdr_mass_fraction_mg_kg_ha", label: "dep_cdr_mg [N]", stage: "chain_deployment", step: 15 },
  { id: "chain_deployment/co2_mass_fraction_mg_kg_ha", label: "dep_co2_mg [N]", stage: "chain_deployment", step: 16 },
  { id: "chain_deployment/co2_combined_kg_ha", label: "dep_co2_combined [N]", stage: "chain_deployment", step: 17 },

  // -- S3 treatment chain (identical shape) --
  { id: "chain_treatment/paired", label: "tre_paired", stage: "chain_treatment", step: 8 },
  { id: "chain_treatment/bl_ti", label: "tre_bl_ti [N]", stage: "chain_treatment", step: 9 },
  { id: "chain_treatment/rp_ti", label: "tre_rp_ti [N]", stage: "chain_treatment", step: 9 },
  { id: "chain_treatment/mass_ratio", label: "tre_mass_ratio [N]", stage: "chain_treatment", step: 10 },
  { id: "chain_treatment/app_rate_kg_ha", label: "tre_app_rate_kg_ha [N]", stage: "chain_treatment", step: 11 },
  { id: "chain_treatment/bl_mass_fraction_ca", label: "tre_bl_ca [N]", stage: "chain_treatment", step: 12 },
  { id: "chain_treatment/rp_mass_fraction_ca", label: "tre_rp_ca [N]", stage: "chain_treatment", step: 12 },
  { id: "chain_treatment/post_app_mass_fraction_ca", label: "tre_post_app_ca [N]", stage: "chain_treatment", step: 13 },
  { id: "chain_treatment/frac_diss_mass_fraction_ca", label: "tre_frac_diss_ca [N]", stage: "chain_treatment", step: 14 },
  { id: "chain_treatment/cdr_mass_fraction_ca_kg_ha", label: "tre_cdr_ca [N]", stage: "chain_treatment", step: 15 },
  { id: "chain_treatment/co2_mass_fraction_ca_kg_ha", label: "tre_co2_ca [N]", stage: "chain_treatment", step: 16 },
  { id: "chain_treatment/bl_mass_fraction_mg", label: "tre_bl_mg [N]", stage: "chain_treatment", step: 12 },
  { id: "chain_treatment/rp_mass_fraction_mg", label: "tre_rp_mg [N]", stage: "chain_treatment", step: 12 },
  { id: "chain_treatment/post_app_mass_fraction_mg", label: "tre_post_app_mg [N]", stage: "chain_treatment", step: 13 },
  { id: "chain_treatment/frac_diss_mass_fraction_mg", label: "tre_frac_diss_mg [N]", stage: "chain_treatment", step: 14 },
  { id: "chain_treatment/cdr_mass_fraction_mg_kg_ha", label: "tre_cdr_mg [N]", stage: "chain_treatment", step: 15 },
  { id: "chain_treatment/co2_mass_fraction_mg_kg_ha", label: "tre_co2_mg [N]", stage: "chain_treatment", step: 16 },
  { id: "chain_treatment/co2_combined_kg_ha", label: "tre_co2_combined [N]", stage: "chain_treatment", step: 17 },

  // -- Diagnostics --
  { id: "diagnostics/tracer_resolvability", label: "tracer_resolvability", stage: "diagnostics", step: 4 },
  { id: "diagnostics/application_rate_check", label: "application_rate_check", stage: "diagnostics", step: 11 },
  { id: "diagnostics/significance_test", label: "significance_test", stage: "diagnostics", step: 18 },
  { id: "diagnostics/representativeness_test", label: "representativeness_test", stage: "diagnostics", step: 19 },
  { id: "diagnostics/pairing_report", label: "pairing_report", stage: "diagnostics", step: 8 },

  // -- S5 aggregation --
  { id: "aggregation/deployment_co2_tonnes", label: "deployment_co2_tonnes [N]", stage: "aggregation", step: 20 },
  { id: "aggregation/treatment_co2_tonnes", label: "treatment_co2_tonnes [N]", stage: "aggregation", step: 20 },
  { id: "aggregation/total_co2_tonnes", label: "total_co2_tonnes [N]", stage: "aggregation", step: 20 },
  { id: "aggregation/p16", label: "p16  ≈ 4,704 tonnes", stage: "aggregation", step: 21, description: "Final reported CDR at 16th percentile." },
];

export const NODE_BY_ID: Record<string, DagNode> = Object.fromEntries(
  NODES.map((n) => [n.id, n]),
);
