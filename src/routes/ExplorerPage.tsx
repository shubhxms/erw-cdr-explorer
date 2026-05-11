import { useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Graph } from "../canvas/Graph";
import { Sidebar } from "../components/Sidebar";
import { useStore } from "../store";
import { useManifest } from "../data/manifest";

export function ExplorerPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = useStore((s) => s.selectedId);
  const setSelected = useStore((s) => s.setSelected);

  // URL → store on mount and when params change
  useEffect(() => {
    const fromUrl = params.get("node");
    if (fromUrl !== selectedId) setSelected(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // store → URL when user clicks
  useEffect(() => {
    const cur = params.get("node");
    if (cur !== selectedId) {
      const next = new URLSearchParams(params);
      if (selectedId) next.set("node", selectedId);
      else next.delete("node");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          height: 44,
          borderBottom: "1px solid #ddd",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          background: "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <strong>EW CDR Checkpoint Explorer</strong>
          <span style={{ color: "#888" }}>
            Alt Carbon · Darjeeling · Isometric registry
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <RunControls />
          <P16Readout />
          <Link to="/about" style={{ color: "#666" }}>
            about
          </Link>
        </div>
      </header>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Graph />
        </div>
        <Sidebar />
      </div>
    </div>
  );
}

function RunControls() {
  const runStatus = useStore((s) => s.runStatus);
  const runPhase = useStore((s) => s.runPhase);
  const nRuns = useStore((s) => s.nRuns);
  const setNRuns = useStore((s) => s.setNRuns);
  const startRun = useStore((s) => s.startRun);
  const cancelRun = useStore((s) => s.cancelRun);
  const computedSet = useStore((s) => s.computedSet);
  const runDurationMs = useStore((s) => s.runDurationMs);
  const runError = useStore((s) => s.runError);

  const isBusy = runStatus === "running" || runStatus === "loading";
  const progress = runStatus === "running" ? computedSet.size : null;
  const phaseLabel = runPhase
    ? {
        "loading-pyodide": "loading pyodide…",
        "loading-packages": "loading numpy/pandas/scipy…",
        "installing-library": "installing isometric lib…",
        "fetching-inputs": "fetching inputs…",
        running: "running chain",
      }[runPhase]
    : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <label
        style={{
          fontSize: 11,
          color: "#666",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        N
        <select
          value={nRuns}
          onChange={(e) => setNRuns(Number(e.target.value))}
          disabled={isBusy}
          style={{
            fontSize: 11,
            padding: "1px 4px",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 3,
          }}
        >
          <option value={1000}>1,000</option>
          <option value={10000}>10,000</option>
          <option value={50000}>50,000</option>
          <option value={200000}>200,000</option>
        </select>
      </label>
      {!isBusy ? (
        <button
          type="button"
          onClick={startRun}
          style={{
            fontSize: 12,
            padding: "3px 10px",
            background: "#1850c8",
            color: "#fff",
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          {runStatus === "done" ? "run again" : "recompute chain"}
        </button>
      ) : (
        <button
          type="button"
          onClick={cancelRun}
          style={{
            fontSize: 12,
            padding: "3px 10px",
            background: "#fff",
            color: "#a00",
            border: "1px solid #a00",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          stop
        </button>
      )}
      {phaseLabel && runStatus !== "running" && (
        <span style={{ fontSize: 11, color: "#1850c8" }}>{phaseLabel}</span>
      )}
      {progress !== null && (
        <span
          style={{
            fontSize: 11,
            color: "#666",
            fontVariantNumeric: "tabular-nums",
            minWidth: 60,
          }}
        >
          {progress} nodes
        </span>
      )}
      {runStatus === "done" && runDurationMs !== null && (
        <span
          style={{
            fontSize: 11,
            color: "#666",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {(runDurationMs / 1000).toFixed(2)}s
        </span>
      )}
      {runStatus === "error" && runError && (
        <span style={{ fontSize: 11, color: "#a00", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={runError}>
          error: {runError}
        </span>
      )}
    </div>
  );
}

function P16Readout() {
  const manifest = useManifest();
  const runStatus = useStore((s) => s.runStatus);
  const computedP16 = useStore((s) => s.computedP16);
  const computedSet = useStore((s) => s.computedSet);
  const p16Computed = computedSet.has("aggregation/p16");

  if (!manifest) return <span style={{ color: "#888" }}>loading…</span>;
  const reg = manifest.registry_p16;
  // Prefer the freshly-computed p16 if a run has finished; otherwise show
  // the precomputed registry-matching value from the manifest.
  const showRecomputed = computedP16 !== null;
  const showPrecomputed = !showRecomputed && p16Computed && manifest.computed_p16 !== null;
  const display = showRecomputed
    ? computedP16!.toFixed(2)
    : showPrecomputed
      ? manifest.computed_p16!.toFixed(2)
      : runStatus === "running"
        ? "…"
        : "—";
  const compared = showRecomputed
    ? computedP16!
    : showPrecomputed
      ? manifest.computed_p16!
      : null;
  const delta = compared !== null ? (compared - reg) : null;
  const tolPct = compared !== null && reg !== 0 ? Math.abs(delta! / reg) * 100 : null;
  const ok = tolPct !== null && tolPct < 2; // 2% tolerance for in-browser runs
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      p16 = <strong>{display}</strong>
      <span style={{ color: "#888" }}> / registry {reg}</span>
      {compared !== null && (
        <>
          <span style={{ marginLeft: 6, color: "#666" }}>
            Δ {delta! >= 0 ? "+" : ""}
            {delta!.toFixed(1)} ({tolPct!.toFixed(2)}%)
          </span>
          <span
            style={{
              marginLeft: 6,
              color: ok ? "#0a0" : "#a00",
              fontWeight: 700,
            }}
          >
            {ok ? "✓" : "✗"}
          </span>
        </>
      )}
      {showRecomputed && (
        <span
          style={{
            marginLeft: 6,
            fontSize: 10,
            color: "#1850c8",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          recomputed
        </span>
      )}
    </span>
  );
}
