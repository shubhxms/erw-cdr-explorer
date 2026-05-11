import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useManifest, type ManifestEntry } from "../data/manifest";
import { NODE_BY_ID } from "../dag/nodes";
import { loadArrayColumn } from "../data/loadParquet";
import { Histogram } from "./Histogram";
import { StatsTable } from "./StatsTable";
import { ResizeHandle } from "./ResizeHandle";

const SIDEBAR_MIN = 320;
const SIDEBAR_MAX = 900;
const SIDEBAR_DEFAULT = 480;
const SIDEBAR_LS_KEY = "ew-cdr.sidebar.width";

function loadInitialWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT;
  const v = Number(window.localStorage.getItem(SIDEBAR_LS_KEY));
  if (!Number.isFinite(v) || v < SIDEBAR_MIN || v > SIDEBAR_MAX) return SIDEBAR_DEFAULT;
  return v;
}

export function Sidebar() {
  const selectedId = useStore((s) => s.selectedId);
  const manifest = useManifest();
  const node = selectedId ? NODE_BY_ID[selectedId] : undefined;
  const entry = selectedId && manifest ? manifest.entries[selectedId] : undefined;
  const [width, setWidth] = useState<number>(() => loadInitialWidth());

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_LS_KEY, String(width));
    } catch {}
  }, [width]);

  // Histogram width tracks the sidebar; cap the chart so it leaves room for padding.
  const chartWidth = Math.max(280, width - 56);

  return (
    <aside
      style={{
        position: "relative",
        width,
        flex: "0 0 auto",
        borderLeft: "1px solid #ddd",
        background: "#fafafa",
        padding: 16,
        overflowY: "auto",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        boxSizing: "border-box",
      }}
    >
      <ResizeHandle width={width} setWidth={setWidth} min={SIDEBAR_MIN} max={SIDEBAR_MAX} />
      {!selectedId && <EmptyState />}
      {selectedId && !entry && (
        <div style={{ color: "#888" }}>No manifest entry for {selectedId}</div>
      )}
      {selectedId && entry && (
        <NodeViewWrapper
          id={selectedId}
          label={node?.label ?? selectedId}
          description={node?.description}
          entry={entry}
          chartWidth={chartWidth}
        />
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

function NodeViewWrapper(props: {
  id: string;
  label: string;
  description?: string;
  entry: ManifestEntry;
  chartWidth: number;
}) {
  const { id, label, description, entry, chartWidth } = props;
  const runStatus = useStore((s) => s.runStatus);
  const computedSet = useStore((s) => s.computedSet);
  const currentlyComputing = useStore((s) => s.currentlyComputing);
  const isComputed = computedSet.has(id);
  const isComputingNow = currentlyComputing === id;

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

      {!isComputed ? (
        <UnderComputationView isComputingNow={isComputingNow} runStatus={runStatus} />
      ) : (
        <>
          {entry.kind === "scalar" && <ScalarView entry={entry} />}
          {entry.kind === "array" && (
            <ArrayView entry={entry} label={label} chartWidth={chartWidth} />
          )}
          {entry.kind === "dataframe" && <DataframeView entry={entry} />}
        </>
      )}
    </div>
  );
}

function UnderComputationView({
  isComputingNow,
  runStatus,
}: {
  isComputingNow: boolean;
  runStatus: "idle" | "running" | "done";
}) {
  const label = isComputingNow
    ? "under computation…"
    : runStatus === "running"
      ? "queued"
      : "no data";
  return (
    <div
      style={{
        padding: "20px 0",
        color: "#888",
        textAlign: "center",
        fontSize: 13,
        fontStyle: "italic",
      }}
    >
      {label}
      {isComputingNow && (
        <div
          style={{
            marginTop: 8,
            height: 4,
            background: "#e8e8e8",
            borderRadius: 2,
            overflow: "hidden",
            maxWidth: 200,
            marginInline: "auto",
          }}
        >
          <div
            style={{
              width: "40%",
              height: "100%",
              background: "#1850c8",
              borderRadius: 2,
              animation: "ew-progress 1.1s ease-in-out infinite",
            }}
          />
        </div>
      )}
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

function ArrayView({
  entry,
  label,
  chartWidth,
}: {
  entry: ManifestEntry;
  label: string;
  chartWidth: number;
}) {
  const [chartEdges, setChartEdges] = useState<number[] | null>(null);
  const [chartBins, setChartBins] = useState<number[] | null>(null);
  const [loadingMs, setLoadingMs] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Always load the full array on selection; build a 64-bin histogram from it.
  useEffect(() => {
    if (!entry.column) return;
    let cancelled = false;
    setLoaded(false);
    setChartBins(null);
    setChartEdges(null);
    setLoadingMs(null);
    const t0 = performance.now();
    (async () => {
      const arr = await loadArrayColumn(entry.path, entry.column!);
      if (cancelled) return;
      const { bins, edges } = makeHist(arr, 64);
      setChartBins(bins);
      setChartEdges(edges);
      setLoadingMs(Math.round(performance.now() - t0));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.path, entry.column]);

  // While loading, show the 32-bin manifest preview so the panel isn't blank.
  const bins = chartBins ?? entry.histogram?.bins ?? [];
  const edges = chartEdges ?? entry.histogram?.edges ?? [0, 1];

  return (
    <div>
      <Histogram
        bins={bins}
        edges={edges}
        width={chartWidth}
        height={Math.round(chartWidth * 0.55)}
        label={label}
      />
      <div style={{ fontSize: 10, color: "#888", margin: "4px 0 12px" }}>
        {loaded
          ? `64-bin · ${entry.stats?.n.toLocaleString() ?? "?"} samples · loaded in ${loadingMs} ms`
          : "loading full array…"}
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
