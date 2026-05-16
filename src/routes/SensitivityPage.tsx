/**
 * /sensitivity — one-at-a-time tornado chart for application_rate +
 * feedstock {Ca, Mg, Ti}. Loads precomputed sweep results from
 * /checkpoints/<removalId>/sensitivity.json on mount; user can re-run live
 * via the chain worker (4 inputs × ±10% + baseline = 9 worker runs).
 */

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import {
  loadPrecomputedSensitivity,
  type SensitivityFile,
} from "../data/sensitivity";
import { REMOVAL_BY_ID, DEFAULT_REMOVAL_ID } from "../data/removals";
import { TornadoChart } from "../components/TornadoChart";
import { downloadCsv } from "../data/csvExport";

export function SensitivityPage() {
  const [params] = useSearchParams();
  const removalId = useStore((s) => s.removalId);
  const setRemovalId = useStore((s) => s.setRemovalId);
  const sweep = useStore((s) => s.sweep);
  const loadPrecomputed = useStore((s) => s.loadPrecomputedSweep);
  const startSweep = useStore((s) => s.startSweep);
  const cancelSweep = useStore((s) => s.cancelSweep);
  const nRuns = useStore((s) => s.nRuns);
  const setNRuns = useStore((s) => s.setNRuns);
  const seed = useStore((s) => s.seed);
  const [scale, setScale] = useState(0.1);
  const [loadAttempted, setLoadAttempted] = useState(false);

  // Sync removal from URL on mount.
  useEffect(() => {
    const fromUrl = params.get("removal");
    if (fromUrl && REMOVAL_BY_ID[fromUrl] && fromUrl !== removalId) {
      setRemovalId(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch precomputed sweep when removal changes.
  useEffect(() => {
    let cancelled = false;
    setLoadAttempted(false);
    loadPrecomputedSensitivity(removalId).then((s) => {
      if (cancelled) return;
      if (s) loadPrecomputed(s);
      setLoadAttempted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [removalId, loadPrecomputed]);

  const summary = sweep.summary;
  const isRunning = sweep.status === "running";
  const stepLabel = isRunning
    ? `step ${sweep.currentStep + 1} / ${sweep.totalSteps} — ${sweep.currentLabel}`
    : "";

  function exportJson() {
    if (!summary) return;
    const file: SensitivityFile = {
      computed_at: summary.computedAt,
      removal_id: summary.removalId,
      n_runs: summary.nRuns,
      seed: summary.seed,
      scale: summary.scale,
      baseline_p16: summary.baselineP16,
      results: summary.rows.map((r) => ({
        id: r.id,
        plus_p16: r.plusP16,
        minus_p16: r.minusP16,
      })),
    };
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${summary.removalId}__sensitivity.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    if (!summary) return;
    const lines = ["input,baseline_p16,plus_p16,minus_p16,delta_plus,delta_minus"];
    for (const r of summary.rows) {
      lines.push(
        [
          r.id,
          summary.baselineP16,
          r.plusP16,
          r.minusP16,
          r.deltaPlus,
          r.deltaMinus,
        ].join(","),
      );
    }
    downloadCsv(`${summary.removalId}__sensitivity.csv`, lines.join("\n") + "\n");
  }

  const removalLabel = REMOVAL_BY_ID[removalId]?.id ?? removalId;

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 980,
        margin: "32px auto",
        padding: "0 24px",
        color: "#222",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <Link to={`/?removal=${removalId}`} style={{ color: "#666", fontSize: 12 }}>
          ← back to canvas
        </Link>
      </div>
      <h1 style={{ marginBottom: 4, fontSize: 22 }}>Sensitivity (tornado)</h1>
      <p style={{ color: "#666", marginTop: 0, fontSize: 13, lineHeight: 1.55 }}>
        One-at-a-time perturbation: each of 4 inputs is scaled to{" "}
        <code>baseline × (1 ± {(scale * 100).toFixed(0)}%)</code>, the chain re-runs,
        and the resulting <code>p16</code> delta is recorded. Bars are sorted by{" "}
        |Δ<sub>+</sub>| + |Δ<sub>−</sub>|. <strong>Caveat:</strong> OAT does not
        capture interaction effects; Sobol variance decomposition is the
        natural next step.
      </p>

      <div
        style={{
          marginTop: 16,
          padding: "12px 14px",
          background: "#fafafa",
          border: "1px solid #e4e4e4",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          fontSize: 12,
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          scale
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            disabled={isRunning}
            style={{ padding: "2px 4px", fontSize: 11 }}
          >
            <option value={0.05}>±5%</option>
            <option value={0.1}>±10%</option>
            <option value={0.2}>±20%</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          N per run
          <select
            value={nRuns}
            onChange={(e) => setNRuns(Number(e.target.value))}
            disabled={isRunning}
            style={{ padding: "2px 4px", fontSize: 11 }}
          >
            <option value={1000}>1,000</option>
            <option value={10000}>10,000</option>
            <option value={50000}>50,000</option>
            <option value={200000}>200,000</option>
          </select>
        </label>
        <span style={{ color: "#888", fontSize: 11 }}>seed {seed}</span>
        {!isRunning ? (
          <button
            type="button"
            onClick={() => startSweep(scale)}
            style={{
              fontSize: 12,
              padding: "4px 12px",
              background: "#1850c8",
              color: "#fff",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {summary ? "Re-run sweep" : "Run sweep"}
          </button>
        ) : (
          <button
            type="button"
            onClick={cancelSweep}
            style={{
              fontSize: 12,
              padding: "4px 12px",
              background: "#fff",
              color: "#a00",
              border: "1px solid #a00",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            cancel
          </button>
        )}
        {isRunning && (
          <span style={{ color: "#1850c8", fontSize: 11 }}>{stepLabel}</span>
        )}
        {summary && !isRunning && (
          <span style={{ color: "#888", fontSize: 11 }}>
            {summary.precomputed
              ? `precomputed N=${summary.nRuns.toLocaleString()} seed=${summary.seed} · ${new Date(summary.computedAt).toLocaleString()}`
              : `live · N=${summary.nRuns.toLocaleString()} seed=${summary.seed} · ${((sweep.finishedAt! - sweep.startedAt!) / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>

      {sweep.error && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            background: "#fdecec",
            border: "1px solid #f5c2c2",
            color: "#a00",
            fontSize: 12,
            borderRadius: 3,
          }}
        >
          {sweep.error}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        {!summary && loadAttempted && !isRunning && (
          <div style={{ color: "#888", fontSize: 13, padding: 16 }}>
            No precomputed sensitivity values shipped for{" "}
            <code>{removalLabel}</code>. Click <em>Run sweep</em> to compute
            live (≈ {nRuns >= 100000 ? "30–60s" : "5–15s"} at N={nRuns.toLocaleString()}).
          </div>
        )}
        {!summary && !loadAttempted && (
          <div style={{ color: "#888", fontSize: 13, padding: 16 }}>loading…</div>
        )}
        {summary && (
          <TornadoChart
            rows={summary.rows}
            baselineP16={summary.baselineP16}
            width={920}
          />
        )}
      </div>

      {summary && !isRunning && (
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={exportCsv}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              background: "#fff",
              border: "1px solid #ccc",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Download CSV
          </button>
          {!summary.precomputed && (
            <button
              type="button"
              onClick={exportJson}
              title="Save the live sweep result so it can ship as the precomputed default at /checkpoints/<id>/sensitivity.json"
              style={{
                fontSize: 11,
                padding: "4px 10px",
                background: "#fff",
                border: "1px solid #ccc",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              Download as sensitivity.json
            </button>
          )}
        </div>
      )}

      {removalId === DEFAULT_REMOVAL_ID && (
        <div
          style={{
            marginTop: 32,
            paddingTop: 16,
            borderTop: "1px solid #eee",
            color: "#888",
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          <strong>What this tells you:</strong> dominant bars = inputs whose
          uncertainty drives p16 the most. A flat bar near zero means the
          input is statistically inert (e.g. tracer-only validation pathways).
          The chart reads at a glance: long bar = important, short bar =
          robust to that assumption.
        </div>
      )}
    </div>
  );
}
