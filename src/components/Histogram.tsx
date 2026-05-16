import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

interface Props {
  bins: number[];
  edges: number[];
  width?: number;
  height?: number;
  label?: string;
  barColor?: string;
  /**
   * Force the x-axis scale to this [min, max] range. Used by callers that
   * render two histograms side-by-side (e.g. CURRENT vs REGISTRY BASELINE)
   * so the bars line up at the same data values across both charts. If
   * unset uPlot auto-fits from the bin edges.
   */
  xRange?: [number, number];
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
  barColor,
  xRange,
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
      // [top, right, bottom, left] — give the left side some room so y-axis
      // tick labels don't get clipped by the chart container.
      padding: [10, 14, 0, 6],
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
          // Widened from 40 → 60 so long y-axis labels (e.g. "200,000")
          // fit fully in the gutter rather than getting clipped.
          size: 60,
        },
      ],
      scales: {
        // Static [min, max] tuple is uPlot's most direct way to force a
        // fixed x-axis scale. Using `range: () => xRange` (a callback)
        // appeared to confuse the bars-paths builder when the data
        // sub-spanned the visible range — two histograms with different
        // bin edges ended up rendering identical-looking bars.
        x: xRange
          ? { time: false, range: [xRange[0], xRange[1]] as [number, number] }
          : { time: false },
      },
      series: [
        {},
        {
          stroke: barColor ? barColor.replace(/[\d.]+\)$/, "1)") : "#333",
          fill: barColor ?? "rgba(80,80,80,0.6)",
          // Compute bar width in DATA UNITS rather than the default 0.95×
          // point-spacing fraction. The fraction-based default measures
          // point-spacing in PIXELS within the visible range — when xRange
          // forces the axis wider than the data, the per-point pixel
          // spacing drops and bars get squashed; if both charts share the
          // same wider xRange but plot at different bin centers, the bars
          // can degenerate visually. Using a fixed data-unit width
          // (≈ 0.95 × actual bin width) makes each chart's bars sized
          // from its own bin edges, independent of the shared visible
          // window.
          paths: uPlot.paths!.bars!({
            size: [0.95, Infinity],
            align: 0,
          }),
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
  }, [bins, edges, width, height, xRange?.[0], xRange?.[1]]);

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
