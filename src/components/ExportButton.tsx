/**
 * Per-node "Export CSV" button.
 *
 * Array node: exports either the freshly-computed bootstrap samples (if a
 * run is in memory) or the precomputed parquet column from the manifest.
 *   File: <nodeId>__samples.csv with a header row + N value rows.
 *
 * Scalar: a one-row CSV with the value (current or manifest baseline).
 *
 * DataFrame: loads the parquet, dumps to CSV.
 */

import { useState } from "react";
import { useStore } from "../store";
import { useManifest, type ManifestEntry } from "../data/manifest";
import { loadArrayColumn, loadDataframe } from "../data/loadParquet";
import {
  arrayToCsv,
  downloadCsv,
  rowsToCsv,
  safeName,
} from "../data/csvExport";

interface Props {
  nodeId: string;
  entry: ManifestEntry;
}

export function ExportButton({ nodeId, entry }: Props) {
  const removalId = useStore((s) => s.removalId);
  const { manifest } = useManifest(removalId);
  const computedValue = useStore((s) => s.computedValues.get(nodeId));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Stats CSV is always available for array nodes once stats exist.
  const canExportStats =
    entry.kind === "array" &&
    (computedValue?.kind === "array" || !!entry.stats);

  async function doExport(kind: "primary" | "stats") {
    setBusy(true);
    setErr(null);
    try {
      const base = safeName(`${removalId}__${nodeId}`);
      if (kind === "stats" && entry.kind === "array") {
        const cur =
          computedValue?.kind === "array" ? computedValue.stats : undefined;
        const base_ = entry.stats;
        const keys = [
          "n",
          "mean",
          "std",
          "min",
          "p5",
          "p16",
          "p50",
          "p84",
          "p95",
          "max",
          "nan_count",
          "inf_count",
        ] as const;
        const rows = keys.map((k) => ({
          stat: k,
          current: cur ? cur[k] : "",
          baseline: base_ ? base_[k] : "",
        }));
        downloadCsv(`${base}__stats.csv`, rowsToCsv(rows, ["stat", "current", "baseline"]));
        return;
      }

      if (entry.kind === "scalar") {
        const cur =
          computedValue?.kind === "scalar" ? computedValue.value : undefined;
        const csv = rowsToCsv(
          [{ source: "current", value: cur ?? "" }, { source: "baseline", value: entry.value ?? "" }],
          ["source", "value"],
        );
        downloadCsv(`${base}.csv`, csv);
        return;
      }

      if (entry.kind === "dataframe") {
        const rows = await loadDataframe(entry.path);
        downloadCsv(`${base}.csv`, rowsToCsv(rows, entry.columns));
        return;
      }

      if (entry.kind === "array") {
        // Always fall back to the parquet column for "primary" export —
        // computed values are histograms+stats only on the wire, not raw
        // samples. The manifest baseline parquet IS the raw bootstrap
        // sample for that node, which is what a user actually wants.
        if (!entry.column) {
          setErr("no parquet column for this node");
          return;
        }
        const arr = await loadArrayColumn(entry.path, entry.column);
        downloadCsv(`${base}__samples.csv`, arrayToCsv(arr, entry.column));
        return;
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!manifest) return null;

  // The "primary" export always pulls from the pre-baked N=200k parquet on
  // disk — the worker only ever ships stats + 64-bin histograms back to JS,
  // never raw arrays, so the live run's samples are not recoverable here.
  // Copy reflects this so the user understands what they're downloading.
  const primaryLabel =
    entry.kind === "array"
      ? "Download baseline samples"
      : entry.kind === "dataframe"
        ? "Download baseline rows"
        : "Download value (current + baseline)";

  const primaryHint =
    entry.kind === "array"
      ? "N=200,000 raw bootstrap samples from the registry-aligned parquet"
      : entry.kind === "dataframe"
        ? "Full rows + columns from the registry-aligned parquet"
        : "Current run value (if any) and the registry baseline";

  const statsHint =
    "Summary statistics for this node — CURRENT (this browser's run) and BASELINE (registry parquet) side-by-side, with Δ implicit";

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => doExport("primary")}
          disabled={busy}
          title={primaryHint}
          style={{
            fontSize: 11,
            padding: "3px 8px",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 3,
            cursor: busy ? "wait" : "pointer",
            color: "#222",
          }}
        >
          {busy ? "preparing…" : primaryLabel}
        </button>
        {canExportStats && (
          <button
            type="button"
            onClick={() => doExport("stats")}
            disabled={busy}
            title={statsHint}
            style={{
              fontSize: 11,
              padding: "3px 8px",
              background: "#fff",
              border: "1px solid #ccc",
              borderRadius: 3,
              cursor: busy ? "wait" : "pointer",
              color: "#222",
            }}
          >
            Download stats (current vs baseline)
          </button>
        )}
        {err && (
          <span style={{ fontSize: 10, color: "#a00", alignSelf: "center" }}>
            {err}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: "#888", marginTop: 4, lineHeight: 1.4 }}>
        {entry.kind === "array" && (
          <>
            Sample CSVs are sourced from the precomputed N=200k parquet (registry
            baseline) — the live in-browser run only retains 64-bin histograms +
            summary stats. Use{" "}
            <em>Download stats</em> to compare current vs baseline.
          </>
        )}
        {entry.kind === "dataframe" && (
          <>Rows come straight from the registry-baseline parquet on disk.</>
        )}
        {entry.kind === "scalar" && (
          <>
            Two rows: this browser's last computed value (if any) and the
            registry baseline.
          </>
        )}
      </div>
    </div>
  );
}
