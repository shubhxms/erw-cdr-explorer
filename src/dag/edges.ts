/**
 * DAG edges following the dependency structure of the calculation chain.
 *
 * `kind: "diagnostic"` means the edge does not contribute to p16; rendered dashed.
 */

export interface DagEdge {
  from: string;
  to: string;
  kind?: "main" | "diagnostic";
}

const main = (from: string, to: string): DagEdge => ({ from, to, kind: "main" });
const diag = (from: string, to: string): DagEdge => ({ from, to, kind: "diagnostic" });

// Per-plot chain edges (factored to avoid duplication)
function plotChain(plot: "deployment" | "treatment"): DagEdge[] {
  const p = `chain_${plot}`;
  return [
    main(`cleaning/${plot}_baseline`, `${p}/paired`),
    main(`cleaning/${plot}_reporting_period`, `${p}/paired`),

    main(`${p}/paired`, `${p}/bl_ti`),
    main(`${p}/paired`, `${p}/rp_ti`),
    main(`${p}/paired`, `${p}/bl_mass_fraction_ca`),
    main(`${p}/paired`, `${p}/rp_mass_fraction_ca`),
    main(`${p}/paired`, `${p}/bl_mass_fraction_mg`),
    main(`${p}/paired`, `${p}/rp_mass_fraction_mg`),

    // mass_ratio = f(fs_ti, bl_ti, rp_ti)
    main("bootstrap/fs_ti", `${p}/mass_ratio`),
    main(`${p}/bl_ti`, `${p}/mass_ratio`),
    main(`${p}/rp_ti`, `${p}/mass_ratio`),

    // diagnostic: app_rate from mass_ratio + bd_boot
    diag(`${p}/mass_ratio`, `${p}/app_rate_kg_ha`),
    diag("bootstrap/bd_boot", `${p}/app_rate_kg_ha`),
    diag(`${p}/app_rate_kg_ha`, "diagnostics/application_rate_check"),

    // post_app per cation
    main(`${p}/mass_ratio`, `${p}/post_app_mass_fraction_ca`),
    main(`${p}/bl_mass_fraction_ca`, `${p}/post_app_mass_fraction_ca`),
    main("bootstrap/fs_ca", `${p}/post_app_mass_fraction_ca`),
    main(`${p}/mass_ratio`, `${p}/post_app_mass_fraction_mg`),
    main(`${p}/bl_mass_fraction_mg`, `${p}/post_app_mass_fraction_mg`),
    main("bootstrap/fs_mg", `${p}/post_app_mass_fraction_mg`),

    // frac_diss per cation
    main(`${p}/mass_ratio`, `${p}/frac_diss_mass_fraction_ca`),
    main(`${p}/post_app_mass_fraction_ca`, `${p}/frac_diss_mass_fraction_ca`),
    main(`${p}/rp_mass_fraction_ca`, `${p}/frac_diss_mass_fraction_ca`),
    main("bootstrap/fs_ca", `${p}/frac_diss_mass_fraction_ca`),
    main("bootstrap/ctrl_corr_p50_mass_fraction_ca", `${p}/frac_diss_mass_fraction_ca`),
    main(`${p}/mass_ratio`, `${p}/frac_diss_mass_fraction_mg`),
    main(`${p}/post_app_mass_fraction_mg`, `${p}/frac_diss_mass_fraction_mg`),
    main(`${p}/rp_mass_fraction_mg`, `${p}/frac_diss_mass_fraction_mg`),
    main("bootstrap/fs_mg", `${p}/frac_diss_mass_fraction_mg`),
    main("bootstrap/ctrl_corr_p50_mass_fraction_mg", `${p}/frac_diss_mass_fraction_mg`),

    // cdr per cation
    main(`${p}/frac_diss_mass_fraction_ca`, `${p}/cdr_mass_fraction_ca_kg_ha`),
    main("bootstrap/fs_ca", `${p}/cdr_mass_fraction_ca_kg_ha`),
    main(`${p}/frac_diss_mass_fraction_mg`, `${p}/cdr_mass_fraction_mg_kg_ha`),
    main("bootstrap/fs_mg", `${p}/cdr_mass_fraction_mg_kg_ha`),

    // co2 per cation
    main(`${p}/cdr_mass_fraction_ca_kg_ha`, `${p}/co2_mass_fraction_ca_kg_ha`),
    main(`${p}/cdr_mass_fraction_mg_kg_ha`, `${p}/co2_mass_fraction_mg_kg_ha`),

    // co2 combined
    main(`${p}/co2_mass_fraction_ca_kg_ha`, `${p}/co2_combined_kg_ha`),
    main(`${p}/co2_mass_fraction_mg_kg_ha`, `${p}/co2_combined_kg_ha`),

    // diagnostics fed by paired
    diag(`${p}/paired`, "diagnostics/significance_test"),
    diag(`${p}/paired`, "diagnostics/representativeness_test"),
    diag(`${p}/paired`, "diagnostics/pairing_report"),
    // tracer_resolvability uses the per-plot raw baseline tracer values (not bootstrap)
    diag(`cleaning/${plot}_baseline`, "diagnostics/tracer_resolvability"),
  ];
}

export const EDGES: DagEdge[] = [
  // -- inputs → cleaning (cleaning_report is a sidecar, not a parent) --
  main("inputs/raw_samples", "cleaning/deployment_baseline"),
  main("inputs/raw_samples", "cleaning/deployment_reporting_period"),
  main("inputs/raw_samples", "cleaning/treatment_baseline"),
  main("inputs/raw_samples", "cleaning/treatment_reporting_period"),
  main("inputs/raw_samples", "cleaning/control_baseline"),
  main("inputs/raw_samples", "cleaning/control_reporting_period"),
  diag("inputs/raw_samples", "cleaning/cleaning_report"),

  // -- bulk density bootstrap --
  main("inputs/bulk_density_samples", "bootstrap/bd_boot"),
  main("inputs/bulk_density_samples", "bootstrap/bd_mean"),
  main("bootstrap/bd_mean", "bootstrap/soil_mass_kg_ha"),
  diag("bootstrap/soil_mass_kg_ha", "diagnostics/tracer_resolvability"),
  diag("bootstrap/soil_mass_kg_ha", "diagnostics/significance_test"),

  // -- feedstock bootstraps (three independent) --
  main("inputs/feedstock_samples", "bootstrap/fs_ti"),
  main("inputs/feedstock_samples", "bootstrap/fs_ca"),
  main("inputs/feedstock_samples", "bootstrap/fs_mg"),
  diag("inputs/feedstock_samples", "diagnostics/tracer_resolvability"),
  // significance test uses feedstock cation means directly
  diag("inputs/feedstock_samples", "diagnostics/significance_test"),

  // -- control bootstrap chain --
  main("cleaning/control_baseline", "bootstrap/control_paired"),
  main("cleaning/control_reporting_period", "bootstrap/control_paired"),
  main("bootstrap/control_paired", "bootstrap/ctl_bl_mass_fraction_ca"),
  main("bootstrap/control_paired", "bootstrap/ctl_rp_mass_fraction_ca"),
  main("bootstrap/control_paired", "bootstrap/ctl_bl_mass_fraction_mg"),
  main("bootstrap/control_paired", "bootstrap/ctl_rp_mass_fraction_mg"),
  main("bootstrap/ctl_bl_mass_fraction_ca", "bootstrap/ctl_corr_boot_mass_fraction_ca"),
  main("bootstrap/ctl_rp_mass_fraction_ca", "bootstrap/ctl_corr_boot_mass_fraction_ca"),
  main("bootstrap/ctl_corr_boot_mass_fraction_ca", "bootstrap/ctrl_corr_p50_mass_fraction_ca"),
  main("bootstrap/ctl_bl_mass_fraction_mg", "bootstrap/ctl_corr_boot_mass_fraction_mg"),
  main("bootstrap/ctl_rp_mass_fraction_mg", "bootstrap/ctl_corr_boot_mass_fraction_mg"),
  main("bootstrap/ctl_corr_boot_mass_fraction_mg", "bootstrap/ctrl_corr_p50_mass_fraction_mg"),
  // pairing_report aggregates all three plots
  diag("bootstrap/control_paired", "diagnostics/pairing_report"),

  // -- per-plot chains --
  ...plotChain("deployment"),
  ...plotChain("treatment"),

  // -- aggregation --
  main("chain_deployment/co2_combined_kg_ha", "aggregation/deployment_co2_tonnes"),
  main("inputs/area_hectares", "aggregation/deployment_co2_tonnes"),
  main("chain_treatment/co2_combined_kg_ha", "aggregation/treatment_co2_tonnes"),
  main("inputs/area_hectares", "aggregation/treatment_co2_tonnes"),
  main("aggregation/deployment_co2_tonnes", "aggregation/total_co2_tonnes"),
  main("aggregation/treatment_co2_tonnes", "aggregation/total_co2_tonnes"),
  main("aggregation/total_co2_tonnes", "aggregation/p16"),
];
