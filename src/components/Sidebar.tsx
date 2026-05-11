import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useManifest, type ManifestEntry } from "../data/manifest";
import { NODE_BY_ID } from "../dag/nodes";
import { loadArrayColumn } from "../data/loadParquet";
import { Histogram } from "./Histogram";
import { StatsTable } from "./StatsTable";

export function Sidebar() {
  const selectedId = useStore((s) => s.selectedId);
  const manifest = useManifest();
  const node = selectedId ? NODE_BY_ID[selectedId] : undefined;
  const entry = selectedId && manifest ? manifest.entries[selectedId] : undefined;

  return (
    <aside
      style={{
        width: 360,
        borderLeft: "1px solid #ddd",
        background: "#fafafa",
        padding: 16,
        overflowY: "auto",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        boxSizing: "border-box",
      }}
    >
      {!selectedId && <EmptyState />}
      {selectedId && !entry && (
        <div style={{ color: "#888" }}>No manifest entry for {selectedId}</div>
      )}
      {selectedId && entry && (
        <NodeView id={selectedId} label={node?.label ?? selectedId} description={node?.description} entry={entry} />
      )}
    </aside>
  );
}

function EmptyState() {
  return (
    <div style={{ color: "#888" }}>
      <p style={{ marginTop: 0 }}>Click any node to inspect.</p>
      <p>
        Each node corresponds to a named variable in <code>run_chain.py</code>.
        Arrays of length N=200,000 are bootstrap distributions.
      </p>
    </div>
  );
}

function NodeView({
  id,
  label,
  description,
  entry,
}: {
  id: string;
  label: string;
  description?: string;
  entry: ManifestEntry;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {entry.stage} · {entry.kind}
      </div>
      <h2 style={{ margin: "4px 0 8px", fontSize: 16 }}>{label}</h2>
      {description && <p style={{ marginTop: 0, color: "#444" }}>{description}</p>}
      <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
        <code>{id}</code>
        <br />
        <code>{entry.path}</code>
      </div>

      {entry.kind === "scalar" && <ScalarView entry={entry} />}
      {entry.kind === "array" && <ArrayView entry={entry} />}
      {entry.kind === "dataframe" && <DataframeView entry={entry} />}
    </div>
  );
}

function ScalarView({ entry }: { entry: ManifestEntry }) {
  return (
    <div style={{ fontSize: 24, fontVariantNumeric: "tabular-nums", padding: "8px 0" }}>
      {entry.value !== undefined ? entry.value.toLocaleString() : "—"}
    </div>
  );
}

function ArrayView({ entry }: { entry: ManifestEntry }) {
  const [loaded, setLoaded] = useState(false);
  const [chartEdges, setChartEdges] = useState<number[] | null>(null);
  const [chartBins, setChartBins] = useState<number[] | null>(null);

  // Use the manifest's precomputed 32-bin histogram by default; lazy-rebuild a
  // 64-bin one from the actual array when user expands.
  useEffect(() => {
    if (!loaded || !entry.column) return;
    let cancelled = false;
    (async () => {
      const arr = await loadArrayColumn(entry.path, entry.column!);
      if (cancelled) return;
      const { bins, edges } = makeHist(arr, 64);
      setChartBins(bins);
      setChartEdges(edges);
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, entry.path, entry.column]);

  const bins = chartBins ?? entry.histogram?.bins ?? [];
  const edges = chartEdges ?? entry.histogram?.edges ?? [0, 1];

  return (
    <div>
      <Histogram bins={bins} edges={edges} width={320} height={180} />
      <div style={{ fontSize: 10, color: "#888", margin: "4px 0 12px" }}>
        {loaded ? "64-bin histogram (loaded from parquet)" : "32-bin preview (from manifest)"}
        {!loaded && (
          <button
            type="button"
            onClick={() => setLoaded(true)}
            style={{
              marginLeft: 8,
              fontSize: 10,
              padding: "2px 6px",
              background: "#fff",
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          >
            load full
          </button>
        )}
      </div>
      {entry.stats && <StatsTable stats={entry.stats} />}
    </div>
  );
}

function DataframeView({ entry }: { entry: ManifestEntry }) {
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 8 }}>
        <strong>{entry.row_count?.toLocaleString() ?? "?"}</strong> rows
      </div>
      <div style={{ color: "#666" }}>Columns:</div>
      <ul style={{ paddingLeft: 18, margin: "4px 0" }}>
        {(entry.columns ?? []).map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function makeHist(values: Float64Array, nbins: number) {
  let mn = Infinity,
    mx = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (!Number.isFinite(mn) || mn === mx)
    return { bins: new Array(nbins).fill(0), edges: [mn, mx + 1] };
  const step = (mx - mn) / nbins;
  const bins = new Array(nbins).fill(0);
  const edges: number[] = new Array(nbins + 1);
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
