/**
 * Fixed bottom-of-viewport progress bar shown while the Pyodide worker is
 * doing something the user is waiting on: cold-starting (loading WASM +
 * packages + library) or running the chain. Mounts once at the app root —
 * cheap to render, hidden when idle.
 */

import { useStore } from "../store";
import { NODES } from "../dag/nodes";

const TOTAL_NODES = NODES.length;

export function BottomLoader() {
  const runStatus = useStore((s) => s.runStatus);
  const runPhase = useStore((s) => s.runPhase);
  const computedCount = useStore((s) => s.computedSet.size);
  const currentlyComputing = useStore((s) => s.currentlyComputing);

  const visible = runStatus === "loading" || runStatus === "running";
  if (!visible) return null;

  // Indeterminate during cold-start; determinate (progress %) once the chain
  // is actually running and posting per-node messages.
  const isRunning = runStatus === "running" && runPhase === "running";
  const pct = isRunning ? Math.min(100, (computedCount / TOTAL_NODES) * 100) : 0;

  const phaseLabel = (() => {
    if (runPhase === "loading-pyodide") return "loading Pyodide runtime";
    if (runPhase === "loading-packages") return "loading numpy / pandas / scipy / pyarrow";
    if (runPhase === "installing-library") return "installing isometric_calculation_library";
    if (runPhase === "fetching-inputs") return "fetching input parquet files";
    if (runPhase === "running") {
      return currentlyComputing
        ? `computing ${currentlyComputing} (${computedCount}/${TOTAL_NODES})`
        : `running chain (${computedCount}/${TOTAL_NODES})`;
    }
    return "working…";
  })();

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 200,
        pointerEvents: "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "4px 12px",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "#444",
            background: "rgba(255,255,255,0.92)",
            padding: "2px 8px",
            borderRadius: 3,
            border: "1px solid #ddd",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          {phaseLabel}
        </span>
      </div>
      <div
        style={{
          height: 7,
          width: "100%",
          background: "#eaeaea",
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 -1px 4px rgba(24,80,200,0.18)",
        }}
      >
        {isRunning ? (
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background:
                "linear-gradient(90deg, #1850c8 0%, #3d7df0 50%, #1850c8 100%)",
              transition: "width 200ms ease-out",
              boxShadow: "0 0 6px rgba(24,80,200,0.6)",
            }}
          />
        ) : (
          // Indeterminate: a 30% wide bar that slides L→R repeatedly.
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: "30%",
              background:
                "linear-gradient(90deg, rgba(24,80,200,0) 0%, #1850c8 50%, rgba(24,80,200,0) 100%)",
              animation: "ew-bottom-loader 1.4s ease-in-out infinite",
              boxShadow: "0 0 8px rgba(24,80,200,0.55)",
            }}
          />
        )}
      </div>
    </div>
  );
}
