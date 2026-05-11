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

function P16Readout() {
  const manifest = useManifest();
  if (!manifest) return <span style={{ color: "#888" }}>loading…</span>;
  const got = manifest.computed_p16;
  const reg = manifest.registry_p16;
  const ok = got !== null && Math.abs(got - reg) < 5;
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      p16 ={" "}
      <strong>{got !== null ? got.toFixed(2) : "—"}</strong>
      <span style={{ color: "#888" }}> / registry {reg}</span>
      <span
        style={{
          marginLeft: 6,
          color: ok ? "#0a0" : "#a00",
          fontWeight: 700,
        }}
      >
        {ok ? "✓" : "✗"}
      </span>
    </span>
  );
}

