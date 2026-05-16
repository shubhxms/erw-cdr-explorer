import { useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Graph } from "../canvas/Graph";
import { Sidebar } from "../components/Sidebar";
import { ConstantsButton } from "../components/ConstantsPanel";
import { RemovalSwitcher } from "../components/RemovalSwitcher";
import { SeedChangeModal } from "../components/SeedChangeModal";
import { useStore } from "../store";
import { useManifest } from "../data/manifest";
import { REMOVAL_BY_ID } from "../data/removals";
import { useState } from "react";

const DEFAULT_SEED = 42;

export function ExplorerPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = useStore((s) => s.selectedId);
  const setSelected = useStore((s) => s.setSelected);
  const removalId = useStore((s) => s.removalId);
  const setRemovalId = useStore((s) => s.setRemovalId);

  // URL → store on mount and when params change
  useEffect(() => {
    const removalFromUrl = params.get("removal");
    if (removalFromUrl && REMOVAL_BY_ID[removalFromUrl] && removalFromUrl !== removalId) {
      setRemovalId(removalFromUrl);
    }
    const fromUrl = params.get("node");
    if (fromUrl !== selectedId) setSelected(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // store → URL when user clicks
  useEffect(() => {
    const cur = params.get("node");
    const curRemoval = params.get("removal");
    const next = new URLSearchParams(params);
    let changed = false;
    if (cur !== selectedId) {
      if (selectedId) next.set("node", selectedId);
      else next.delete("node");
      changed = true;
    }
    // Always keep ?removal=<id> in the URL — makes shared links explicit
    // about which removal they're pointing at, even for the default.
    if (curRemoval !== removalId) {
      next.set("removal", removalId);
      changed = true;
    }
    if (changed) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, removalId]);

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
          <strong style={{ fontSize: 14 }}>EW CDR Explorer</strong>
          <RemovalSwitcher />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ConstantsButton />
          <RunControls />
          <P16Readout />
          <Link to="/about" style={{ color: "#666" }}>
            about
          </Link>
        </div>
      </header>
      <ManifestBanner />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Graph />
        </div>
        <Sidebar />
      </div>
    </div>
  );
}

function ManifestBanner() {
  const removalId = useStore((s) => s.removalId);
  const { error } = useManifest(removalId);
  if (!error) return null;
  return (
    <div
      style={{
        padding: "8px 16px",
        background: "#fff5e6",
        borderBottom: "1px solid #f0d8a0",
        color: "#7a4a0e",
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
      }}
    >
      <strong>{removalId}</strong> — checkpoint data not yet wired up. Switch to an
      available removal in the dropdown above, or wait for this one to be staged.
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
  const editCount = useStore((s) => s.edits.size);
  const overrideCount = useStore((s) => s.overrides.size);
  const seed = useStore((s) => s.seed);
  const appliedSeed = useStore((s) => s.appliedSeed);
  // Seed has "changed" iff it differs from what the chain is about to use.
  // Falls back to the registry-baseline default (42) when no run has been
  // applied yet — so changing 42 → 17 fires the modal even on the first click.
  const seedChanged = seed !== (appliedSeed ?? DEFAULT_SEED);
  const [seedModalOpen, setSeedModalOpen] = useState(false);

  function onRunClick() {
    if (seedChanged) {
      setSeedModalOpen(true);
      return;
    }
    startRun();
  }
  function confirmSeedRun() {
    setSeedModalOpen(false);
    startRun();
  }

  const isBusy = runStatus === "running" || runStatus === "loading";
  const progress = runStatus === "running" ? computedSet.size : null;
  const totalEdits = editCount + overrideCount;
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
          onClick={onRunClick}
          style={{
            fontSize: 12,
            padding: "3px 10px",
            background: totalEdits > 0 || seedChanged ? "#a4570e" : "#1850c8",
            color: "#fff",
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
            fontWeight: totalEdits > 0 || seedChanged ? 600 : 400,
          }}
        >
          {totalEdits > 0
            ? `recompute (${totalEdits} change${totalEdits === 1 ? "" : "s"})`
            : seedChanged
              ? `recompute (seed → ${seed})`
              : runStatus === "done"
                ? "recompute"
                : "run chain"}
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
      <SeedChangeModal
        open={seedModalOpen}
        prevSeed={appliedSeed}
        newSeed={seed}
        onConfirm={confirmSeedRun}
        onCancel={() => setSeedModalOpen(false)}
      />
    </div>
  );
}

function P16Readout() {
  const removalId = useStore((s) => s.removalId);
  const { manifest, error } = useManifest(removalId);
  const runStatus = useStore((s) => s.runStatus);
  const computedP16 = useStore((s) => s.computedP16);
  const computedSet = useStore((s) => s.computedSet);
  const p16Computed = computedSet.has("aggregation/p16");

  if (error) return <span style={{ color: "#a4570e", fontSize: 12 }}>data not wired</span>;
  if (!manifest) return <span style={{ color: "#888" }}>loading…</span>;
  const reg = manifest.registry_p16;
  // Prefer the freshly-computed p16 if a run has finished; otherwise show
  // the precomputed registry-matching value from the manifest.
  const showRecomputed = computedP16 !== null;
  const showPrecomputed = !showRecomputed && p16Computed && manifest.computed_p16 !== null;
  const display = showRecomputed
    ? computedP16!.toFixed(3)
    : showPrecomputed
      ? manifest.computed_p16!.toFixed(3)
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
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      p16 = <strong>{display}</strong>
      <span style={{ color: "#666", marginLeft: 2 }}>tCO₂e</span>
      <span style={{ color: "#888" }}> / registry {reg.toFixed(3)} tCO₂e</span>
      {compared !== null && (
        <span style={{ marginLeft: 6, color: "#666" }}>
          Δ {delta! >= 0 ? "+" : ""}
          {delta!.toFixed(3)} ({tolPct!.toFixed(3)}%)
        </span>
      )}
    </span>
  );
}
