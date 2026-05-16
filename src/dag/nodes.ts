/**
 * Canonical DAG node definitions, mirroring the calculation chain step order.
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
  step: number;
  description?: string;
  unit?: string;
}

export const NODES: DagNode[] = [
  // -- inputs --
  { id: "inputs/raw_samples", label: "Raw Samples", stage: "inputs", step: 0, description: "Soil samples after spatial assignment." },
  { id: "inputs/feedstock_samples", label: "Feedstock Composition", stage: "inputs", step: 0, description: "Feedstock composition (Ca, Mg, Ti) – n=25." },
  { id: "inputs/bulk_density_samples", label: "Bulk Density Samples", stage: "inputs", step: 0, description: "Bulk density measurements – 151 non-null of 11,246." },
  { id: "inputs/area_hectares", label: "Plot Areas", stage: "inputs", step: 0, description: "Plot areas: deployment 2549.87 ha, treatment 67.06 ha, control 67.06 ha." },

  // -- Cleaning --
  { id: "cleaning/cleaning_report", label: "Cleaning Report", stage: "cleaning", step: 1, description: "Zero-filter + winsorise summary." },
  { id: "cleaning/deployment_baseline", label: "Deployment Baseline", stage: "cleaning", step: 1 },
  { id: "cleaning/deployment_reporting_period", label: "Deployment Reporting Period", stage: "cleaning", step: 1 },
  { id: "cleaning/treatment_baseline", label: "Treatment Baseline", stage: "cleaning", step: 1 },
  { id: "cleaning/treatment_reporting_period", label: "Treatment Reporting Period", stage: "cleaning", step: 1 },
  { id: "cleaning/control_baseline", label: "Control Baseline", stage: "cleaning", step: 1 },
  { id: "cleaning/control_reporting_period", label: "Control Reporting Period", stage: "cleaning", step: 1 },

  // -- bootstrap: bulk density --
  { id: "bootstrap/bd_boot", label: "Bulk Density Bootstrap", stage: "bootstrap", step: 2, description: "Bootstrap means of bulk density (kg/m³).", unit: "kg/m³" },
  { id: "bootstrap/bd_mean", label: "Bulk Density Mean", stage: "bootstrap", step: 3, description: "Empirical mean of 151 bulk density values (kg/m³).", unit: "kg/m³" },
  { id: "bootstrap/soil_mass_kg_ha", label: "Soil Mass", stage: "bootstrap", step: 3, description: "bd_mean × depth × 100 (kg/ha).", unit: "kg/ha" },

  // -- bootstrap: feedstock (three independent calls; uncorrelated) --
  { id: "bootstrap/fs_ti", label: "Feedstock Ti Bootstrap", stage: "bootstrap", step: 5, description: "Bootstrap mean feedstock Ti (mg/kg).", unit: "mg/kg" },
  { id: "bootstrap/fs_ca", label: "Feedstock Ca Bootstrap", stage: "bootstrap", step: 5, description: "Bootstrap mean feedstock Ca (mg/kg).", unit: "mg/kg" },
  { id: "bootstrap/fs_mg", label: "Feedstock Mg Bootstrap", stage: "bootstrap", step: 5, description: "Bootstrap mean feedstock Mg (mg/kg).", unit: "mg/kg" },

  // -- bootstrap: control correction --
  { id: "bootstrap/control_paired", label: "Control Paired", stage: "bootstrap", step: 6, description: "Paired control bl/rp rows (~894)." },
  { id: "bootstrap/ctl_bl_mass_fraction_ca", label: "Control BL Ca", stage: "bootstrap", step: 7 },
  { id: "bootstrap/ctl_rp_mass_fraction_ca", label: "Control RP Ca", stage: "bootstrap", step: 7 },
  { id: "bootstrap/ctl_corr_boot_mass_fraction_ca", label: "Control Correction Ca", stage: "bootstrap", step: 7, description: "Bootstrap of rp_ca / bl_ca ratios." },
  { id: "bootstrap/ctrl_corr_p50_mass_fraction_ca", label: "Control Correction p50 Ca", stage: "bootstrap", step: 7, description: "Median of control-correction bootstrap." },
  { id: "bootstrap/ctl_bl_mass_fraction_mg", label: "Control BL Mg", stage: "bootstrap", step: 7 },
  { id: "bootstrap/ctl_rp_mass_fraction_mg", label: "Control RP Mg", stage: "bootstrap", step: 7 },
  { id: "bootstrap/ctl_corr_boot_mass_fraction_mg", label: "Control Correction Mg", stage: "bootstrap", step: 7 },
  { id: "bootstrap/ctrl_corr_p50_mass_fraction_mg", label: "Control Correction p50 Mg", stage: "bootstrap", step: 7 },

  // -- deployment chain --
  { id: "chain_deployment/paired", label: "Deployment Paired", stage: "chain_deployment", step: 8, description: "Paired deployment bl/rp (~894)." },
  { id: "chain_deployment/bl_ti", label: "Deployment BL Ti", stage: "chain_deployment", step: 9 },
  { id: "chain_deployment/rp_ti", label: "Deployment RP Ti", stage: "chain_deployment", step: 9 },
  { id: "chain_deployment/mass_ratio", label: "Deployment Mass Ratio", stage: "chain_deployment", step: 10, description: "(rp_ti − bl_ti) / (fs_ti − rp_ti)." },
  { id: "chain_deployment/app_rate_kg_ha", label: "Deployment App Rate", stage: "chain_deployment", step: 11, description: "Tracer-derived application rate (kg/ha, validation).", unit: "kg/ha" },
  { id: "chain_deployment/bl_mass_fraction_ca", label: "Deployment BL Ca", stage: "chain_deployment", step: 12 },
  { id: "chain_deployment/rp_mass_fraction_ca", label: "Deployment RP Ca", stage: "chain_deployment", step: 12 },
  { id: "chain_deployment/post_app_mass_fraction_ca", label: "Deployment Post-App Ca", stage: "chain_deployment", step: 13 },
  { id: "chain_deployment/frac_diss_mass_fraction_ca", label: "Deployment Frac Dissolved Ca", stage: "chain_deployment", step: 14 },
  { id: "chain_deployment/cdr_mass_fraction_ca_kg_ha", label: "Deployment CDR Ca", stage: "chain_deployment", step: 15, description: "CDR from Ca dissolution (kg CO₂/ha).", unit: "kg CO₂/ha" },
  { id: "chain_deployment/co2_mass_fraction_ca_kg_ha", label: "Deployment CO₂ Ca", stage: "chain_deployment", step: 16, description: "CO₂ equivalent from Ca (kg CO₂/ha).", unit: "kg CO₂/ha" },
  { id: "chain_deployment/bl_mass_fraction_mg", label: "Deployment BL Mg", stage: "chain_deployment", step: 12 },
  { id: "chain_deployment/rp_mass_fraction_mg", label: "Deployment RP Mg", stage: "chain_deployment", step: 12 },
  { id: "chain_deployment/post_app_mass_fraction_mg", label: "Deployment Post-App Mg", stage: "chain_deployment", step: 13 },
  { id: "chain_deployment/frac_diss_mass_fraction_mg", label: "Deployment Frac Dissolved Mg", stage: "chain_deployment", step: 14 },
  { id: "chain_deployment/cdr_mass_fraction_mg_kg_ha", label: "Deployment CDR Mg", stage: "chain_deployment", step: 15, description: "CDR from Mg dissolution (kg CO₂/ha).", unit: "kg CO₂/ha" },
  { id: "chain_deployment/co2_mass_fraction_mg_kg_ha", label: "Deployment CO₂ Mg", stage: "chain_deployment", step: 16, description: "CO₂ equivalent from Mg (kg CO₂/ha).", unit: "kg CO₂/ha" },
  { id: "chain_deployment/co2_combined_kg_ha", label: "Deployment CO₂ Combined", stage: "chain_deployment", step: 17, description: "Total CO₂ per hectare for deployment plot (kg CO₂/ha).", unit: "kg CO₂/ha" },

  // -- treatment chain (identical shape) --
  { id: "chain_treatment/paired", label: "Treatment Paired", stage: "chain_treatment", step: 8 },
  { id: "chain_treatment/bl_ti", label: "Treatment BL Ti", stage: "chain_treatment", step: 9 },
  { id: "chain_treatment/rp_ti", label: "Treatment RP Ti", stage: "chain_treatment", step: 9 },
  { id: "chain_treatment/mass_ratio", label: "Treatment Mass Ratio", stage: "chain_treatment", step: 10 },
  { id: "chain_treatment/app_rate_kg_ha", label: "Treatment App Rate", stage: "chain_treatment", step: 11, description: "Tracer-derived application rate (kg/ha, validation).", unit: "kg/ha" },
  { id: "chain_treatment/bl_mass_fraction_ca", label: "Treatment BL Ca", stage: "chain_treatment", step: 12 },
  { id: "chain_treatment/rp_mass_fraction_ca", label: "Treatment RP Ca", stage: "chain_treatment", step: 12 },
  { id: "chain_treatment/post_app_mass_fraction_ca", label: "Treatment Post-App Ca", stage: "chain_treatment", step: 13 },
  { id: "chain_treatment/frac_diss_mass_fraction_ca", label: "Treatment Frac Dissolved Ca", stage: "chain_treatment", step: 14 },
  { id: "chain_treatment/cdr_mass_fraction_ca_kg_ha", label: "Treatment CDR Ca", stage: "chain_treatment", step: 15, description: "CDR from Ca dissolution (kg CO₂/ha).", unit: "kg CO₂/ha" },
  { id: "chain_treatment/co2_mass_fraction_ca_kg_ha", label: "Treatment CO₂ Ca", stage: "chain_treatment", step: 16, description: "CO₂ equivalent from Ca (kg CO₂/ha).", unit: "kg CO₂/ha" },
  { id: "chain_treatment/bl_mass_fraction_mg", label: "Treatment BL Mg", stage: "chain_treatment", step: 12 },
  { id: "chain_treatment/rp_mass_fraction_mg", label: "Treatment RP Mg", stage: "chain_treatment", step: 12 },
  { id: "chain_treatment/post_app_mass_fraction_mg", label: "Treatment Post-App Mg", stage: "chain_treatment", step: 13 },
  { id: "chain_treatment/frac_diss_mass_fraction_mg", label: "Treatment Frac Dissolved Mg", stage: "chain_treatment", step: 14 },
  { id: "chain_treatment/cdr_mass_fraction_mg_kg_ha", label: "Treatment CDR Mg", stage: "chain_treatment", step: 15, description: "CDR from Mg dissolution (kg CO₂/ha).", unit: "kg CO₂/ha" },
  { id: "chain_treatment/co2_mass_fraction_mg_kg_ha", label: "Treatment CO₂ Mg", stage: "chain_treatment", step: 16, description: "CO₂ equivalent from Mg (kg CO₂/ha).", unit: "kg CO₂/ha" },
  { id: "chain_treatment/co2_combined_kg_ha", label: "Treatment CO₂ Combined", stage: "chain_treatment", step: 17, description: "Total CO₂ per hectare for treatment plot (kg CO₂/ha).", unit: "kg CO₂/ha" },

  // -- validation --
  { id: "diagnostics/tracer_resolvability", label: "Tracer Resolvability", stage: "diagnostics", step: 4 },
  { id: "diagnostics/application_rate_check", label: "Application Rate Check", stage: "diagnostics", step: 11 },
  { id: "diagnostics/significance_test", label: "Significance Test", stage: "diagnostics", step: 18 },
  { id: "diagnostics/representativeness_test", label: "Representativeness Test", stage: "diagnostics", step: 19 },
  { id: "diagnostics/pairing_report", label: "Pairing Report", stage: "diagnostics", step: 8 },

  // -- aggregation --
  { id: "aggregation/deployment_co2_tonnes", label: "Deployment CO₂", stage: "aggregation", step: 20, description: "Deployment plot CO₂ scaled by area (tonnes).", unit: "t CO₂" },
  { id: "aggregation/treatment_co2_tonnes", label: "Treatment CO₂", stage: "aggregation", step: 20, description: "Treatment plot CO₂ scaled by area (tonnes).", unit: "t CO₂" },
  { id: "aggregation/total_co2_tonnes", label: "Total CO₂", stage: "aggregation", step: 20, description: "Sum of deployment + treatment CO₂ (tonnes).", unit: "t CO₂" },
  { id: "aggregation/p16", label: "p16 ≈ 4,703.71 tCO₂e", stage: "aggregation", step: 21, description: "Final reported CDR at 16th percentile (tCO₂e).", unit: "t CO₂" },
];

export const NODE_BY_ID: Record<string, DagNode> = Object.fromEntries(
  NODES.map((n) => [n.id, n]),
);
