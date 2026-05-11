/**
 * Run the TypeScript chain offline (Node), with the same input files the
 * browser worker will see. Print p16 and compare to the registry value.
 *
 * This is the validation step requested by the user. We don't expect
 * bit-equality (mulberry32 ≠ numpy PCG64) but we should be within a few %.
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";

import { mulberry32 } from "../src/chain/rng";
import { zeroFilter, winsorise, type RawSample } from "../src/chain/cleaning";
import { pairLocations } from "../src/chain/pairing";
import {
  resampleMean,
  pairedBootstrap6,
  controlBootstrap4,
} from "../src/chain/bootstrap";
import {
  massRatio,
  postApp,
  fracDissolved,
  cdrKgHa,
  co2KgHa,
  add,
  scale,
  controlCorrectionRatio,
} from "../src/chain/chainMath";
import { nanPercentile, summarise } from "../src/chain/stats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHK = join(__dirname, "..", "public", "checkpoints");

async function loadTable<T>(path: string): Promise<T[]> {
  const file = await asyncBufferFromFile(path);
  return (await parquetReadObjects({ file })) as T[];
}

async function main() {
  const N = Number(process.env.N ?? 200000);
  const SEED = 42;

  console.log(`N=${N}  seed=${SEED}\n`);
  const t0 = performance.now();

  const rng = mulberry32(SEED);

  const raw = await loadTable<RawSample>(join(CHK, "inputs/raw_samples.parquet"));
  const fs = await loadTable<{
    mass_fraction_ca: number;
    mass_fraction_mg: number;
    mass_fraction_ti: number;
  }>(join(CHK, "inputs/feedstock_samples.parquet"));
  const bdRows = await loadTable<{ bulk_density: number | null }>(
    join(CHK, "inputs/bulk_density_samples.parquet"),
  );
  const areaRows = await loadTable<{ plot_type: string; area_hectares: number }>(
    join(CHK, "inputs/area_hectares.parquet"),
  );
  const area: Record<string, number> = {};
  for (const r of areaRows) area[r.plot_type] = r.area_hectares;
  const bd = bdRows
    .map((r) => r.bulk_density)
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));

  console.log(`inputs loaded: raw=${raw.length}, feedstock=${fs.length}, bulk_density=${bd.length}, area=${Object.entries(area).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(", ")}`);

  const zr = zeroFilter(raw);
  const wr = winsorise(zr.samples, 3);
  console.log(`cleaning: dropped ${zr.dropped}, clipped ${wr.clipped}; remain ${wr.samples.length}`);

  const cleaned = wr.samples;
  const sub = (plot: string, period: string) =>
    cleaned.filter((s) => s.plot_type === plot && s.sampling_event === period);

  const dep_bl = sub("deployment", "baseline");
  const dep_rp = sub("deployment", "reporting_period");
  const tre_bl = sub("treatment", "baseline");
  const tre_rp = sub("treatment", "reporting_period");
  const ctl_bl = sub("control", "baseline");
  const ctl_rp = sub("control", "reporting_period");
  console.log(`groups: dep=${dep_bl.length}/${dep_rp.length}  tre=${tre_bl.length}/${tre_rp.length}  ctl=${ctl_bl.length}/${ctl_rp.length}`);

  // bulk density bootstrap (not on p16 path but advances rng like Python)
  resampleMean(rng, bd, N);

  // feedstock bootstraps (three independent)
  const fs_ti = resampleMean(rng, fs.map((r) => r.mass_fraction_ti), N);
  const fs_ca = resampleMean(rng, fs.map((r) => r.mass_fraction_ca), N);
  const fs_mg = resampleMean(rng, fs.map((r) => r.mass_fraction_mg), N);
  console.log(`feedstock means: ti=${summarise(fs_ti).mean.toFixed(0)}  ca=${summarise(fs_ca).mean.toFixed(0)}  mg=${summarise(fs_mg).mean.toFixed(0)}`);

  // control bootstrap + correction
  const ctlPaired = pairLocations(ctl_bl, ctl_rp);
  const ctlBoot = controlBootstrap4(
    rng,
    ctlPaired.bl_ca,
    ctlPaired.rp_ca,
    ctlPaired.bl_mg,
    ctlPaired.rp_mg,
    N,
  );
  const ccCa = nanPercentile(controlCorrectionRatio(ctlBoot.bl_ca, ctlBoot.rp_ca), 50);
  const ccMg = nanPercentile(controlCorrectionRatio(ctlBoot.bl_mg, ctlBoot.rp_mg), 50);
  console.log(`ctrl_corr_p50: ca=${ccCa.toFixed(5)}  mg=${ccMg.toFixed(5)}`);

  // per-plot chain
  const plotResult = (
    name: "deployment" | "treatment",
    blRaw: RawSample[],
    rpRaw: RawSample[],
  ) => {
    const paired = pairLocations(blRaw, rpRaw);
    const boot = pairedBootstrap6(
      rng,
      paired.bl_ti,
      paired.rp_ti,
      paired.bl_ca,
      paired.rp_ca,
      paired.bl_mg,
      paired.rp_mg,
      N,
    );
    const mr = massRatio(fs_ti, boot.bl_ti, boot.rp_ti);
    const postCa = postApp(mr, boot.bl_ca, fs_ca);
    const fdCa = fracDissolved(mr, postCa, boot.rp_ca, fs_ca, ccCa);
    const cdrCa = cdrKgHa(fdCa, fs_ca);
    const co2Ca = co2KgHa(cdrCa, "Ca");
    const postMg = postApp(mr, boot.bl_mg, fs_mg);
    const fdMg = fracDissolved(mr, postMg, boot.rp_mg, fs_mg, ccMg);
    const cdrMg = cdrKgHa(fdMg, fs_mg);
    const co2Mg = co2KgHa(cdrMg, "Mg");
    const co2 = add(co2Ca, co2Mg);
    const sMr = summarise(mr);
    const sFdCa = summarise(fdCa);
    const sFdMg = summarise(fdMg);
    const sCo2 = summarise(co2);
    console.log(
      `  ${name}: mr=${sMr.mean.toFixed(5)}  fd_ca=${sFdCa.mean.toFixed(4)}  fd_mg=${sFdMg.mean.toFixed(4)}  co2_kg_ha=${sCo2.mean.toFixed(0)}`,
    );
    return co2;
  };

  console.log("per-plot:");
  const depCo2 = plotResult("deployment", dep_bl, dep_rp);
  const treCo2 = plotResult("treatment", tre_bl, tre_rp);

  const depT = scale(depCo2, area.deployment / 1000);
  const treT = scale(treCo2, area.treatment / 1000);
  const total = add(depT, treT);
  const p16 = nanPercentile(total, 16);
  const sTot = summarise(total);

  const totalMs = performance.now() - t0;
  const registry = 4704;
  const delta = p16 - registry;
  const pct = (delta / registry) * 100;
  console.log(
    `\np16 = ${p16.toFixed(2)} tonnes  (registry ${registry}, Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} / ${pct.toFixed(2)}%)`,
  );
  console.log(`mean total = ${sTot.mean.toFixed(2)}, p84 = ${sTot.p84.toFixed(2)}`);
  console.log(`wall time: ${(totalMs / 1000).toFixed(2)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
