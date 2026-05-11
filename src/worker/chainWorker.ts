/// <reference lib="webworker" />
/**
 * Web Worker that runs the EW CDR chain end-to-end.
 *
 * Inputs: fetched directly from /checkpoints/inputs/*.parquet via hyparquet.
 * Outputs: streamed back to the main thread, one message per checkpoint, with
 * the Float64Array transferred (no copy).
 *
 * Stage order matches run_chain.py and the node IDs match src/dag/nodes.ts.
 */

import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";
import { mulberry32 } from "../chain/rng";
import {
  zeroFilter,
  winsorise,
  type RawSample,
} from "../chain/cleaning";
import { pairLocations } from "../chain/pairing";
import {
  resampleMean,
  pairedBootstrap6,
  controlBootstrap4,
} from "../chain/bootstrap";
import {
  massRatio,
  postApp,
  fracDissolved,
  cdrKgHa,
  co2KgHa,
  add,
  scale,
  appRateKgHa,
  controlCorrectionRatio,
} from "../chain/chainMath";
import { summarise, histogram, nanPercentile } from "../chain/stats";

// ---------------------------------------------------------------------------
// Wire messages — see store.ts on the main side.
// ---------------------------------------------------------------------------

export type WorkerInbound =
  | { type: "run"; nRuns: number; seed: number }
  | { type: "abort" };

export type WorkerOutbound =
  | { type: "started"; nodeId: string }
  | { type: "scalar"; nodeId: string; value: number; durationMs: number }
  | {
      type: "array";
      nodeId: string;
      stats: ReturnType<typeof summarise>;
      histogram: ReturnType<typeof histogram>;
      durationMs: number;
    }
  | {
      type: "dataframe";
      nodeId: string;
      rowCount: number;
      columns: string[];
      durationMs: number;
    }
  | { type: "complete"; p16: number; totalMs: number }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let aborted = false;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLING_DEPTH_CM = 30;

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

async function loadTable<T>(path: string): Promise<T[]> {
  const file = await asyncBufferFromUrl({ url: path });
  return (await parquetReadObjects({ file })) as T[];
}

function post(msg: WorkerOutbound, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer);
}

// Each `track()` emits started+done for a node id, measuring how long the
// produce-fn ran and announcing the result.
async function track<T>(
  nodeId: string,
  kind: "array" | "scalar" | "dataframe",
  fn: () => T | Promise<T>,
  describe: (
    v: T,
    durationMs: number,
  ) =>
    | { ok: WorkerOutbound; transfer?: Transferable[] }
    | { ok: WorkerOutbound; transfer?: Transferable[] }[],
): Promise<T> {
  post({ type: "started", nodeId });
  const t0 = performance.now();
  const out = await fn();
  if (aborted) throw new Error("aborted");
  const dt = performance.now() - t0;
  const desc = describe(out, dt);
  const arr = Array.isArray(desc) ? desc : [desc];
  for (const d of arr) post(d.ok, d.transfer);
  // Yield a microtask so the main thread paints the new state.
  await new Promise<void>((r) => setTimeout(r, 0));
  return out;
}

function arrayMsg(nodeId: string, arr: Float64Array, durationMs: number): {
  ok: WorkerOutbound;
  transfer: Transferable[];
} {
  return {
    ok: {
      type: "array",
      nodeId,
      stats: summarise(arr),
      histogram: histogram(arr, 64),
      durationMs,
    },
    transfer: [],
  };
  // NB: we deliberately don't transfer the full array — the main thread only
  // needs stats + histogram. Keeping the array in the worker saves memory
  // copies and the main thread already shows charts from the histogram.
}

// ---------------------------------------------------------------------------
// Main chain
// ---------------------------------------------------------------------------

async function run(nRuns: number, seed: number) {
  const t0 = performance.now();
  const rng = mulberry32(seed);

  // === inputs ===========================================================
  await track(
    "inputs/raw_samples",
    "dataframe",
    () =>
      loadTable<RawSample>(
        "/checkpoints/inputs/raw_samples.parquet",
      ),
    (v, dt) => ({
      ok: {
        type: "dataframe",
        nodeId: "inputs/raw_samples",
        rowCount: v.length,
        columns: Object.keys(v[0] ?? {}),
        durationMs: dt,
      },
    }),
  );
  const rawSamples = await loadTable<RawSample>(
    "/checkpoints/inputs/raw_samples.parquet",
  );

  await track(
    "inputs/feedstock_samples",
    "dataframe",
    () =>
      loadTable<{
        mass_fraction_ca: number;
        mass_fraction_mg: number;
        mass_fraction_ti: number;
      }>("/checkpoints/inputs/feedstock_samples.parquet"),
    (v, dt) => ({
      ok: {
        type: "dataframe",
        nodeId: "inputs/feedstock_samples",
        rowCount: v.length,
        columns: Object.keys(v[0] ?? {}),
        durationMs: dt,
      },
    }),
  );
  const feedstock = await loadTable<{
    mass_fraction_ca: number;
    mass_fraction_mg: number;
    mass_fraction_ti: number;
  }>("/checkpoints/inputs/feedstock_samples.parquet");

  await track(
    "inputs/bulk_density_samples",
    "dataframe",
    () =>
      loadTable<{ bulk_density: number | null }>(
        "/checkpoints/inputs/bulk_density_samples.parquet",
      ),
    (v, dt) => ({
      ok: {
        type: "dataframe",
        nodeId: "inputs/bulk_density_samples",
        rowCount: v.length,
        columns: ["bulk_density"],
        durationMs: dt,
      },
    }),
  );
  const bdRows = await loadTable<{ bulk_density: number | null }>(
    "/checkpoints/inputs/bulk_density_samples.parquet",
  );
  const bulkDensity = bdRows
    .map((r) => r.bulk_density)
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));

  await track(
    "inputs/area_hectares",
    "dataframe",
    () =>
      loadTable<{ plot_type: string; area_hectares: number }>(
        "/checkpoints/inputs/area_hectares.parquet",
      ),
    (v, dt) => ({
      ok: {
        type: "dataframe",
        nodeId: "inputs/area_hectares",
        rowCount: v.length,
        columns: ["plot_type", "area_hectares"],
        durationMs: dt,
      },
    }),
  );
  const areaRows = await loadTable<{
    plot_type: string;
    area_hectares: number;
  }>("/checkpoints/inputs/area_hectares.parquet");
  const area: Record<string, number> = {};
  for (const r of areaRows) area[r.plot_type] = r.area_hectares;

  if (aborted) return;

  // === cleaning =========================================================
  const zr = await track(
    "cleaning/cleaning_report",
    "dataframe",
    () => zeroFilter(rawSamples),
    (zr, dt) => ({
      ok: {
        type: "dataframe",
        nodeId: "cleaning/cleaning_report",
        rowCount: 2,
        columns: ["step", "samples_dropped", "values_clipped"],
        durationMs: dt,
      },
    }),
  );
  const wr = winsorise(zr.samples, 3);
  const cleaned = wr.samples;

  // Split by plot × event and emit one DataFrame per combination.
  for (const plot of ["deployment", "treatment", "control"] as const) {
    for (const period of ["baseline", "reporting_period"] as const) {
      const id = `cleaning/${plot}_${period}`;
      await track(
        id,
        "dataframe",
        () =>
          cleaned.filter(
            (s) => s.plot_type === plot && s.sampling_event === period,
          ),
        (v, dt) => ({
          ok: {
            type: "dataframe",
            nodeId: id,
            rowCount: v.length,
            columns: Object.keys(v[0] ?? {}),
            durationMs: dt,
          },
        }),
      );
    }
  }

  const dep_bl = cleaned.filter(
    (s) => s.plot_type === "deployment" && s.sampling_event === "baseline",
  );
  const dep_rp = cleaned.filter(
    (s) =>
      s.plot_type === "deployment" && s.sampling_event === "reporting_period",
  );
  const tre_bl = cleaned.filter(
    (s) => s.plot_type === "treatment" && s.sampling_event === "baseline",
  );
  const tre_rp = cleaned.filter(
    (s) =>
      s.plot_type === "treatment" && s.sampling_event === "reporting_period",
  );
  const ctl_bl = cleaned.filter(
    (s) => s.plot_type === "control" && s.sampling_event === "baseline",
  );
  const ctl_rp = cleaned.filter(
    (s) =>
      s.plot_type === "control" && s.sampling_event === "reporting_period",
  );

  if (aborted) return;

  // === bulk density bootstrap ===========================================
  const bdBoot = await track(
    "bootstrap/bd_boot",
    "array",
    () => resampleMean(rng, bulkDensity, nRuns),
    (v, dt) => arrayMsg("bootstrap/bd_boot", v, dt),
  );

  const bdMean =
    bulkDensity.reduce((a, b) => a + b, 0) / bulkDensity.length;
  await track(
    "bootstrap/bd_mean",
    "scalar",
    () => bdMean,
    (v, dt) => ({
      ok: { type: "scalar", nodeId: "bootstrap/bd_mean", value: v, durationMs: dt },
    }),
  );
  const soilMass = bdMean * SAMPLING_DEPTH_CM * 100;
  await track(
    "bootstrap/soil_mass_kg_ha",
    "scalar",
    () => soilMass,
    (v, dt) => ({
      ok: {
        type: "scalar",
        nodeId: "bootstrap/soil_mass_kg_ha",
        value: v,
        durationMs: dt,
      },
    }),
  );

  if (aborted) return;

  // === feedstock bootstraps (three independent calls, advancing rng) ====
  const fs_ti_vals = feedstock.map((r) => r.mass_fraction_ti);
  const fs_ca_vals = feedstock.map((r) => r.mass_fraction_ca);
  const fs_mg_vals = feedstock.map((r) => r.mass_fraction_mg);

  const fs_ti = await track(
    "bootstrap/fs_ti",
    "array",
    () => resampleMean(rng, fs_ti_vals, nRuns),
    (v, dt) => arrayMsg("bootstrap/fs_ti", v, dt),
  );
  const fs_ca = await track(
    "bootstrap/fs_ca",
    "array",
    () => resampleMean(rng, fs_ca_vals, nRuns),
    (v, dt) => arrayMsg("bootstrap/fs_ca", v, dt),
  );
  const fs_mg = await track(
    "bootstrap/fs_mg",
    "array",
    () => resampleMean(rng, fs_mg_vals, nRuns),
    (v, dt) => arrayMsg("bootstrap/fs_mg", v, dt),
  );

  if (aborted) return;

  // === diagnostics: tracer resolvability (placeholder; matches structure) =
  await track(
    "diagnostics/tracer_resolvability",
    "dataframe",
    () => ({ rows: 2 }),
    (_v, dt) => ({
      ok: {
        type: "dataframe",
        nodeId: "diagnostics/tracer_resolvability",
        rowCount: 2,
        columns: [
          "plot_type",
          "resolvability_index",
          "soil_mass_kg",
          "feedstock_mass_kg",
          "n_baseline_samples",
        ],
        durationMs: dt,
      },
    }),
  );

  // === control pairing + bootstrap ======================================
  const ctlPaired = pairLocations(ctl_bl, ctl_rp);
  await track(
    "bootstrap/control_paired",
    "dataframe",
    () => ctlPaired,
    (v, dt) => ({
      ok: {
        type: "dataframe",
        nodeId: "bootstrap/control_paired",
        rowCount: v.n,
        columns: ["bl_ca", "rp_ca", "bl_mg", "rp_mg", "bl_ti", "rp_ti"],
        durationMs: dt,
      },
    }),
  );
  const ctlBoot = controlBootstrap4(
    rng,
    ctlPaired.bl_ca,
    ctlPaired.rp_ca,
    ctlPaired.bl_mg,
    ctlPaired.rp_mg,
    nRuns,
  );
  await track(
    "bootstrap/ctl_bl_mass_fraction_ca",
    "array",
    () => ctlBoot.bl_ca,
    (v, dt) => arrayMsg("bootstrap/ctl_bl_mass_fraction_ca", v, dt),
  );
  await track(
    "bootstrap/ctl_rp_mass_fraction_ca",
    "array",
    () => ctlBoot.rp_ca,
    (v, dt) => arrayMsg("bootstrap/ctl_rp_mass_fraction_ca", v, dt),
  );
  await track(
    "bootstrap/ctl_bl_mass_fraction_mg",
    "array",
    () => ctlBoot.bl_mg,
    (v, dt) => arrayMsg("bootstrap/ctl_bl_mass_fraction_mg", v, dt),
  );
  await track(
    "bootstrap/ctl_rp_mass_fraction_mg",
    "array",
    () => ctlBoot.rp_mg,
    (v, dt) => arrayMsg("bootstrap/ctl_rp_mass_fraction_mg", v, dt),
  );

  const ctlCorrBootCa = controlCorrectionRatio(ctlBoot.bl_ca, ctlBoot.rp_ca);
  const ctlCorrBootMg = controlCorrectionRatio(ctlBoot.bl_mg, ctlBoot.rp_mg);
  await track(
    "bootstrap/ctl_corr_boot_mass_fraction_ca",
    "array",
    () => ctlCorrBootCa,
    (v, dt) => arrayMsg("bootstrap/ctl_corr_boot_mass_fraction_ca", v, dt),
  );
  await track(
    "bootstrap/ctl_corr_boot_mass_fraction_mg",
    "array",
    () => ctlCorrBootMg,
    (v, dt) => arrayMsg("bootstrap/ctl_corr_boot_mass_fraction_mg", v, dt),
  );

  const ctlCorrCa = nanPercentile(ctlCorrBootCa, 50);
  const ctlCorrMg = nanPercentile(ctlCorrBootMg, 50);
  await track(
    "bootstrap/ctrl_corr_p50_mass_fraction_ca",
    "scalar",
    () => ctlCorrCa,
    (v, dt) => ({
      ok: {
        type: "scalar",
        nodeId: "bootstrap/ctrl_corr_p50_mass_fraction_ca",
        value: v,
        durationMs: dt,
      },
    }),
  );
  await track(
    "bootstrap/ctrl_corr_p50_mass_fraction_mg",
    "scalar",
    () => ctlCorrMg,
    (v, dt) => ({
      ok: {
        type: "scalar",
        nodeId: "bootstrap/ctrl_corr_p50_mass_fraction_mg",
        value: v,
        durationMs: dt,
      },
    }),
  );

  if (aborted) return;

  // === per-plot chain ===================================================
  const plots = [
    { name: "deployment" as const, bl: dep_bl, rp: dep_rp },
    { name: "treatment" as const, bl: tre_bl, rp: tre_rp },
  ];

  const co2CombinedByPlot: Record<string, Float64Array> = {};

  for (const plot of plots) {
    const prefix = `chain_${plot.name}`;

    const paired = pairLocations(plot.bl, plot.rp);
    await track(
      `${prefix}/paired`,
      "dataframe",
      () => paired,
      (v, dt) => ({
        ok: {
          type: "dataframe",
          nodeId: `${prefix}/paired`,
          rowCount: v.n,
          columns: ["bl_ca", "rp_ca", "bl_mg", "rp_mg", "bl_ti", "rp_ti"],
          durationMs: dt,
        },
      }),
    );

    const boot = pairedBootstrap6(
      rng,
      paired.bl_ti,
      paired.rp_ti,
      paired.bl_ca,
      paired.rp_ca,
      paired.bl_mg,
      paired.rp_mg,
      nRuns,
    );

    await track(`${prefix}/bl_ti`, "array", () => boot.bl_ti, (v, dt) =>
      arrayMsg(`${prefix}/bl_ti`, v, dt),
    );
    await track(`${prefix}/rp_ti`, "array", () => boot.rp_ti, (v, dt) =>
      arrayMsg(`${prefix}/rp_ti`, v, dt),
    );

    const mr = massRatio(fs_ti, boot.bl_ti, boot.rp_ti);
    await track(`${prefix}/mass_ratio`, "array", () => mr, (v, dt) =>
      arrayMsg(`${prefix}/mass_ratio`, v, dt),
    );

    const appRate = appRateKgHa(mr, bdBoot, SAMPLING_DEPTH_CM);
    await track(`${prefix}/app_rate_kg_ha`, "array", () => appRate, (v, dt) =>
      arrayMsg(`${prefix}/app_rate_kg_ha`, v, dt),
    );

    // Per cation
    await track(
      `${prefix}/bl_mass_fraction_ca`,
      "array",
      () => boot.bl_ca,
      (v, dt) => arrayMsg(`${prefix}/bl_mass_fraction_ca`, v, dt),
    );
    await track(
      `${prefix}/rp_mass_fraction_ca`,
      "array",
      () => boot.rp_ca,
      (v, dt) => arrayMsg(`${prefix}/rp_mass_fraction_ca`, v, dt),
    );
    const postCa = postApp(mr, boot.bl_ca, fs_ca);
    await track(
      `${prefix}/post_app_mass_fraction_ca`,
      "array",
      () => postCa,
      (v, dt) => arrayMsg(`${prefix}/post_app_mass_fraction_ca`, v, dt),
    );
    const fdCa = fracDissolved(mr, postCa, boot.rp_ca, fs_ca, ctlCorrCa);
    await track(
      `${prefix}/frac_diss_mass_fraction_ca`,
      "array",
      () => fdCa,
      (v, dt) => arrayMsg(`${prefix}/frac_diss_mass_fraction_ca`, v, dt),
    );
    const cdrCa = cdrKgHa(fdCa, fs_ca);
    await track(
      `${prefix}/cdr_mass_fraction_ca_kg_ha`,
      "array",
      () => cdrCa,
      (v, dt) => arrayMsg(`${prefix}/cdr_mass_fraction_ca_kg_ha`, v, dt),
    );
    const co2Ca = co2KgHa(cdrCa, "Ca");
    await track(
      `${prefix}/co2_mass_fraction_ca_kg_ha`,
      "array",
      () => co2Ca,
      (v, dt) => arrayMsg(`${prefix}/co2_mass_fraction_ca_kg_ha`, v, dt),
    );

    await track(
      `${prefix}/bl_mass_fraction_mg`,
      "array",
      () => boot.bl_mg,
      (v, dt) => arrayMsg(`${prefix}/bl_mass_fraction_mg`, v, dt),
    );
    await track(
      `${prefix}/rp_mass_fraction_mg`,
      "array",
      () => boot.rp_mg,
      (v, dt) => arrayMsg(`${prefix}/rp_mass_fraction_mg`, v, dt),
    );
    const postMg = postApp(mr, boot.bl_mg, fs_mg);
    await track(
      `${prefix}/post_app_mass_fraction_mg`,
      "array",
      () => postMg,
      (v, dt) => arrayMsg(`${prefix}/post_app_mass_fraction_mg`, v, dt),
    );
    const fdMg = fracDissolved(mr, postMg, boot.rp_mg, fs_mg, ctlCorrMg);
    await track(
      `${prefix}/frac_diss_mass_fraction_mg`,
      "array",
      () => fdMg,
      (v, dt) => arrayMsg(`${prefix}/frac_diss_mass_fraction_mg`, v, dt),
    );
    const cdrMg = cdrKgHa(fdMg, fs_mg);
    await track(
      `${prefix}/cdr_mass_fraction_mg_kg_ha`,
      "array",
      () => cdrMg,
      (v, dt) => arrayMsg(`${prefix}/cdr_mass_fraction_mg_kg_ha`, v, dt),
    );
    const co2Mg = co2KgHa(cdrMg, "Mg");
    await track(
      `${prefix}/co2_mass_fraction_mg_kg_ha`,
      "array",
      () => co2Mg,
      (v, dt) => arrayMsg(`${prefix}/co2_mass_fraction_mg_kg_ha`, v, dt),
    );

    const co2Combined = add(co2Ca, co2Mg);
    co2CombinedByPlot[plot.name] = co2Combined;
    await track(
      `${prefix}/co2_combined_kg_ha`,
      "array",
      () => co2Combined,
      (v, dt) => arrayMsg(`${prefix}/co2_combined_kg_ha`, v, dt),
    );

    if (aborted) return;
  }

  // === diagnostics: significance, representativeness, pairing reports ===
  for (const id of [
    "diagnostics/application_rate_check",
    "diagnostics/significance_test",
    "diagnostics/representativeness_test",
    "diagnostics/pairing_report",
  ]) {
    await track(
      id,
      "dataframe",
      () => ({ rows: 4 }),
      (_v, dt) => ({
        ok: {
          type: "dataframe",
          nodeId: id,
          rowCount: 4,
          columns: ["see Python chain for full diagnostic columns"],
          durationMs: dt,
        },
      }),
    );
  }

  // === aggregation ======================================================
  const depTonnes = scale(
    co2CombinedByPlot.deployment,
    area.deployment / 1000,
  );
  await track(
    "aggregation/deployment_co2_tonnes",
    "array",
    () => depTonnes,
    (v, dt) => arrayMsg("aggregation/deployment_co2_tonnes", v, dt),
  );
  const treTonnes = scale(co2CombinedByPlot.treatment, area.treatment / 1000);
  await track(
    "aggregation/treatment_co2_tonnes",
    "array",
    () => treTonnes,
    (v, dt) => arrayMsg("aggregation/treatment_co2_tonnes", v, dt),
  );
  const total = add(depTonnes, treTonnes);
  await track(
    "aggregation/total_co2_tonnes",
    "array",
    () => total,
    (v, dt) => arrayMsg("aggregation/total_co2_tonnes", v, dt),
  );

  const p16 = nanPercentile(total, 16);
  await track(
    "aggregation/p16",
    "scalar",
    () => p16,
    (v, dt) => ({
      ok: { type: "scalar", nodeId: "aggregation/p16", value: v, durationMs: dt },
    }),
  );

  post({
    type: "complete",
    p16,
    totalMs: performance.now() - t0,
  });
}

// ---------------------------------------------------------------------------
// Message dispatch
// ---------------------------------------------------------------------------

ctx.addEventListener("message", (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data;
  if (msg.type === "abort") {
    aborted = true;
    return;
  }
  if (msg.type === "run") {
    aborted = false;
    run(msg.nRuns, msg.seed).catch((err) => {
      if (err?.message !== "aborted") {
        post({
          type: "error",
          message: String(err?.message ?? err),
        });
      }
    });
  }
});
