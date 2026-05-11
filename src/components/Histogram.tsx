import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

interface Props {
  bins: number[];
  edges: number[];
  width?: number;
  height?: number;
  /** Human-readable name of the variable being plotted; shown in tooltip. */
  label?: string;
}

interface CursorState {
  visible: boolean;
  x: number;
  y: number;
  binIdx: number;
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e5 || a < 1e-3) return v.toExponential(3);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(3);
  return v.toFixed(5);
}

export function Histogram({
  bins,
  edges,
  width = 320,
  height = 180,
  label = "value",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const [cursor, setCursor] = useState<CursorState>({
    visible: false,
    x: 0,
    y: 0,
    binIdx: -1,
  });

  useEffect(() => {
    if (!ref.current) return;
    const centers = bins.map((_, i) => (edges[i] + edges[i + 1]) / 2);
    const opts: uPlot.Options = {
      width,
      height,
      padding: [10, 14, 0, 0],
      cursor: {
        show: true,
        drag: { setScale: false },
        points: { show: false },
      },
      legend: { show: false },
      axes: [
        {
          stroke: "#666",
          font: "10px system-ui",
          ticks: { stroke: "#ccc" },
          grid: { stroke: "#eee" },
          size: 32,
        },
        {
          stroke: "#666",
          font: "10px system-ui",
          ticks: { stroke: "#ccc" },
          grid: { stroke: "#eee" },
          size: 40,
        },
      ],
      scales: { x: { time: false } },
      series: [
        {},
        {
          stroke: "#333",
          fill: "rgba(80,80,80,0.6)",
          paths: uPlot.paths!.bars!({ size: [0.95, Infinity] }),
          points: { show: false },
        },
      ],
      hooks: {
        setCursor: [
          (u) => {
            const idx = u.cursor.idx;
            if (idx == null || idx < 0) {
              setCursor((c) => (c.visible ? { ...c, visible: false } : c));
              return;
            }
            const left = u.cursor.left ?? 0;
            const top = u.cursor.top ?? 0;
            setCursor({ visible: true, x: left, y: top, binIdx: idx });
          },
        ],
      },
    };
    plotRef.current?.destroy();
    plotRef.current = new uPlot(opts, [centers, bins], ref.current);
    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [bins, edges, width, height]);

  const total = bins.reduce((a, b) => a + b, 0) || 1;
  const tt = cursor.visible && cursor.binIdx >= 0 && cursor.binIdx < bins.length;
  const lo = tt ? edges[cursor.binIdx] : 0;
  const hi = tt ? edges[cursor.binIdx + 1] : 0;
  const count = tt ? bins[cursor.binIdx] : 0;
  const pct = tt ? (100 * count) / total : 0;

  // Position the tooltip near the cursor but keep it inside the chart bounds.
  const ttW = 160;
  const ttH = 56;
  const ttX = Math.min(Math.max(cursor.x + 12, 0), Math.max(width - ttW, 0));
  const ttY = Math.min(Math.max(cursor.y - ttH - 8, 0), Math.max(height - ttH, 0));

  return (
    <div style={{ position: "relative", width, height }}>
      <div ref={ref} />
      {tt && (
        <div
          style={{
            position: "absolute",
            left: ttX,
            top: ttY,
            width: ttW,
            pointerEvents: "none",
            background: "rgba(255,255,255,0.96)",
            border: "1px solid #ccc",
            borderRadius: 3,
            padding: "4px 6px",
            fontSize: 10,
            fontFamily: "system-ui, sans-serif",
            color: "#222",
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.35,
          }}
        >
          <div style={{ color: "#666" }}>
            {label} ∈ [{fmt(lo)}, {fmt(hi)})
          </div>
          <div>
            <strong>{count.toLocaleString()}</strong> samples ({pct.toFixed(2)}%)
          </div>
        </div>
      )}
    </div>
  );
}
