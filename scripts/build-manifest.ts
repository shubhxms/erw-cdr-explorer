/**
 * Build manifest.json from public/checkpoints/<removalId>/.
 *
 * Usage: tsx scripts/build-manifest.ts <removalId>
 *   e.g. tsx scripts/build-manifest.ts rmv_1KH3W7FMH1S0J5R9
 *
 * For each parquet [N] array: load, compute summary stats + 32-bin histogram.
 * For each scalar JSON: pass through value.
 * For each dataframe parquet: record row count.
 *
 * Output: public/checkpoints/<removalId>/manifest.json (consumed by the app).
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { asyncBufferFromFile, parquetReadObjects, parquetMetadataAsync } from "hyparquet";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const REMOVAL_ID = process.argv[2];
if (!REMOVAL_ID) {
  console.error("usage: tsx scripts/build-manifest.ts <removalId>");
  process.exit(2);
}
const CHECKPOINT_DIR = join(ROOT, "public", "checkpoints", REMOVAL_ID);
const PUBLIC_PREFIX = `/checkpoints/${REMOVAL_ID}`;

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

type Stage =
  | "inputs"
  | "cleaning"
  | "bootstrap"
  | "chain_deployment"
  | "chain_treatment"
  | "diagnostics"
  | "aggregation";

type NodeKind = "array" | "scalar" | "dataframe";

interface ArrayStats {
  n: number;
  mean: number;
  std: number;
  p5: number;
  p16: number;
  p50: number;
  p84: number;
  p95: number;
  min: number;
  max: number;
  nan_count: number;
  inf_count: number;
}

interface Histogram {
  bins: number[];
  edges: number[]; // length = bins.length + 1
}

interface ManifestEntry {
  id: string;
  kind: NodeKind;
  stage: Stage;
  path: string;
  column?: string;
  stats?: ArrayStats;
  histogram?: Histogram;
  value?: number;
  row_count?: number;
  columns?: string[];
}

interface Manifest {
  generated_at: string;
  registry_p16: number;
  computed_p16: number | null;
  total_duration_s: number | null;
  entries: Record<string, ManifestEntry>;
}

// ---------------------------------------------------------------------------
// numeric helpers
// ---------------------------------------------------------------------------

function summarise(values: Float64Array): ArrayStats {
  const n = values.length;
  const clean: number[] = [];
  let nan_count = 0;
  let inf_count = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (Number.isNaN(v)) nan_count++;
    else if (!Number.isFinite(v)) inf_count++;
    else clean.push(v);
  }
  const m = clean.length;
  if (m === 0) {
    return {
      n,
      mean: NaN,
      std: NaN,
      p5: NaN,
      p16: NaN,
      p50: NaN,
      p84: NaN,
      p95: NaN,
      min: NaN,
      max: NaN,
      nan_count,
      inf_count,
    };
  }
  clean.sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < m; i++) sum += clean[i];
  const mean = sum / m;
  let ss = 0;
  for (let i = 0; i < m; i++) {
    const d = clean[i] - mean;
    ss += d * d;
  }
  const std = Math.sqrt(ss / m);
  const pct = (p: number) => {
    const idx = (p / 100) * (m - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return clean[lo];
    return clean[lo] + (clean[hi] - clean[lo]) * (idx - lo);
  };
  return {
    n,
    mean,
    std,
    p5: pct(5),
    p16: pct(16),
    p50: pct(50),
    p84: pct(84),
    p95: pct(95),
    min: clean[0],
    max: clean[m - 1],
    nan_count,
    inf_count,
  };
}

function histogram(values: Float64Array, nbins = 32): Histogram {
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
    return { bins: new Array(nbins).fill(0), edges: [0, 1] };
  }
  if (mn === mx) {
    const bins = new Array(nbins).fill(0);
    bins[Math.floor(nbins / 2)] = values.length;
    return { bins, edges: [mn - 0.5, mx + 0.5] };
  }
  const bins = new Array(nbins).fill(0);
  const edges = new Array(nbins + 1);
  const step = (mx - mn) / nbins;
  for (let i = 0; i <= nbins; i++) edges[i] = mn + step * i;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    let idx = Math.floor((v - mn) / step);
    if (idx === nbins) idx = nbins - 1;
    if (idx < 0) idx = 0;
    bins[idx]++;
  }
  return { bins, edges };
}

// ---------------------------------------------------------------------------
// parquet helpers
// ---------------------------------------------------------------------------

async function readParquetColumn(absPath: string, column: string): Promise<Float64Array> {
  const file = await asyncBufferFromFile(absPath);
  const rows = await parquetReadObjects({ file, columns: [column] });
  const out = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const v = (rows[i] as Record<string, unknown>)[column];
    out[i] = typeof v === "number" ? v : Number(v);
  }
  return out;
}

async function readParquetMeta(absPath: string): Promise<{ rowCount: number; columns: string[] }> {
  const file = await asyncBufferFromFile(absPath);
  const meta = await parquetMetadataAsync(file);
  const rowCount = Number(meta.num_rows);
  const columns = meta.schema.filter((s) => s.name !== meta.schema[0].name).map((s) => s.name);
  return { rowCount, columns };
}

// ---------------------------------------------------------------------------
// scan
// ---------------------------------------------------------------------------

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function stageFromPath(rel: string): Stage {
  const top = rel.split("/")[0] as Stage;
  return top;
}

// ID is "<stage>/<basename-without-ext>" except for chain dirs where we keep the dir.
function idFromRel(rel: string): string {
  return rel.replace(/\.(parquet|json)$/, "");
}

// Identify which checkpoints are [N] arrays (single-column parquet with N=200_000)
const ARRAY_LIKE_COLUMNS = new Set<string>([
  "fs_ti",
  "fs_ca",
  "fs_mg",
  "bd_boot",
  "mass_ratio",
  "app_rate_kg_ha",
  "co2_combined_kg_ha",
  "deployment_co2_tonnes",
  "treatment_co2_tonnes",
  "total_co2_tonnes",
]);

const DATAFRAME_FILES = new Set<string>([
  "inputs/raw_samples",
  "inputs/feedstock_samples",
  "inputs/bulk_density_samples",
  "inputs/area_hectares",
  "cleaning/cleaning_report",
  "cleaning/deployment_baseline",
  "cleaning/deployment_reporting_period",
  "cleaning/treatment_baseline",
  "cleaning/treatment_reporting_period",
  "cleaning/control_baseline",
  "cleaning/control_reporting_period",
  "bootstrap/control_paired",
  "chain_deployment/paired",
  "chain_treatment/paired",
  "diagnostics/application_rate_check",
  "diagnostics/pairing_report",
  "diagnostics/representativeness_test",
  "diagnostics/significance_test",
  "diagnostics/tracer_resolvability",
  "aggregation/distributions_summary",
]);

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const files = walk(CHECKPOINT_DIR);
  const entries: Record<string, ManifestEntry> = {};

  let computed_p16: number | null = null;

  for (const abs of files) {
    const rel = relative(CHECKPOINT_DIR, abs).split("/").join("/");
    const id = idFromRel(rel);
    const stage = stageFromPath(rel);
    const publicPath = `${PUBLIC_PREFIX}/${rel}`;

    if (rel.endsWith(".json")) {
      const obj = JSON.parse(readFileSync(abs, "utf8"));
      if (id === "aggregation/p16") computed_p16 = obj.value;
      if (id === "aggregation/summary" || id === "run_log") continue;
      entries[id] = {
        id,
        kind: "scalar",
        stage,
        path: publicPath,
        value: typeof obj.value === "number" ? obj.value : undefined,
      };
      continue;
    }

    if (!rel.endsWith(".parquet")) continue;

    if (DATAFRAME_FILES.has(id)) {
      const meta = await readParquetMeta(abs);
      entries[id] = {
        id,
        kind: "dataframe",
        stage,
        path: publicPath,
        row_count: meta.rowCount,
        columns: meta.columns,
      };
      continue;
    }

    // [N] array — detect column name from the parquet schema (one data column).
    const meta = await readParquetMeta(abs);
    const valueCol =
      meta.columns.find((c) => ARRAY_LIKE_COLUMNS.has(c)) ?? meta.columns[0];
    const arr = await readParquetColumn(abs, valueCol);
    const stats = summarise(arr);
    const hist = histogram(arr, 32);
    entries[id] = {
      id,
      kind: "array",
      stage,
      path: publicPath,
      column: valueCol,
      stats,
      histogram: hist,
    };
    process.stdout.write(`  ${id} (${valueCol}, n=${arr.length})\n`);
  }

  // Read run_log for total duration
  let total_duration_s: number | null = null;
  try {
    const log = JSON.parse(readFileSync(join(CHECKPOINT_DIR, "run_log.json"), "utf8"));
    total_duration_s = log.total_duration_s;
  } catch {}

  const manifest: Manifest = {
    generated_at: new Date().toISOString(),
    registry_p16: 4703.709,
    computed_p16,
    total_duration_s,
    entries,
  };

  const outPath = join(CHECKPOINT_DIR, "manifest.json");
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));

  const sizeKb = Math.round(statSync(outPath).size / 1024);
  console.log(`\nwrote ${outPath} (${sizeKb} KB, ${Object.keys(entries).length} entries)`);
  console.log(`computed_p16 = ${computed_p16}, registry = 4703.709`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
