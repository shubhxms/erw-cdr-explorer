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
  const speed = useStore((s) => s.speed);
  const startRun = useStore((s) => s.startRun);
  const cancelRun = useStore((s) => s.cancelRun);
  const setSpeed = useStore((s) => s.setSpeed);
  const computedSet = useStore((s) => s.computedSet);

  const total = useStore((s) => s.computedSet.size);
  // total node count is fixed; we compute progress when running
  const progress = runStatus === "running" ? computedSet.size : null;

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
        speed
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          disabled={runStatus === "running"}
          style={{
            fontSize: 11,
            padding: "1px 4px",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 3,
          }}
        >
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={5}>5×</option>
        </select>
      </label>
      {runStatus !== "running" ? (
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
          {runStatus === "done" ? "run again" : "run chain"}
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
      {progress !== null && (
        <span
          style={{
            fontSize: 11,
            color: "#666",
            fontVariantNumeric: "tabular-nums",
            minWidth: 60,
          }}
        >
          {progress} / {total}
        </span>
      )}
    </div>
  );
}

function P16Readout() {
  const manifest = useManifest();
  const runStatus = useStore((s) => s.runStatus);
  const computedSet = useStore((s) => s.computedSet);
  const p16Computed = computedSet.has("aggregation/p16");
  if (!manifest) return <span style={{ color: "#888" }}>loading…</span>;
  const got = manifest.computed_p16;
  const reg = manifest.registry_p16;
  const ok = got !== null && Math.abs(got - reg) < 5;
  const show = p16Computed && got !== null;
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      p16 ={" "}
      <strong>
        {show ? got!.toFixed(2) : runStatus === "running" ? "…" : "—"}
      </strong>
      <span style={{ color: "#888" }}> / registry {reg}</span>
      {show && (
        <span
          style={{
            marginLeft: 6,
            color: ok ? "#0a0" : "#a00",
            fontWeight: 700,
          }}
        >
          {ok ? "✓" : "✗"}
        </span>
      )}
    </span>
  );
}
