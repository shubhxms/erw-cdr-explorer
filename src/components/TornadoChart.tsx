/**
 * Horizontal tornado chart. One row per swept input; left bar = Δ−10%,
 * right bar = Δ+10% (in tCO₂e of p16). Sorted by |Δ+| + |Δ−|.
 *
 * Hand-rolled SVG — uPlot is awkward for symmetric horizontal bars with
 * negative values, and a tornado has stable layout that doesn't need
 * uPlot's panning/zooming.
 */

import type { SweepResultRow } from "../data/sensitivity";

interface Props {
  rows: SweepResultRow[];
  baselineP16: number;
  width?: number;
  rowHeight?: number;
}

const PLUS_COLOR = "#1850c8";
const MINUS_COLOR = "#a4570e";

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function fmtSigned(v: number): string {
  return `${v >= 0 ? "+" : ""}${fmt(v)}`;
}

export function TornadoChart({
  rows,
  baselineP16,
  width = 760,
  rowHeight = 38,
}: Props) {
  if (rows.length === 0) {
    return (
      <div style={{ color: "#888", padding: 16, fontSize: 13 }}>
        No sweep results yet. Click <em>Run sweep</em> to compute.
      </div>
    );
  }

  // Layout: label column (left) + bar area (center) + numeric column (right).
  const labelW = 240;
  const numW = 80;
  const barAreaW = width - labelW - numW - 24;
  const centerX = labelW + barAreaW / 2;
  const height = rows.length * rowHeight + 56;

  // Symmetric range: take the max absolute delta and pad ~10%.
  const maxAbs = Math.max(
    ...rows.flatMap((r) => [Math.abs(r.deltaPlus), Math.abs(r.deltaMinus)]),
    1,
  );
  const pad = maxAbs * 1.1;
  const scale = (v: number) => (v / pad) * (barAreaW / 2);

  // Gridlines at ±0.25·max, ±0.5·max, ±0.75·max, ±max.
  const ticks = [-1, -0.5, 0, 0.5, 1].map((f) => f * pad);

  const xAxisY = 24;

  return (
    <svg
      width={width}
      height={height}
      style={{ fontFamily: "system-ui, sans-serif", display: "block" }}
    >
      {/* axis label + color key. Color encodes the direction of the input
       *  perturbation (+10% vs −10%), not the sign of the resulting p16
       *  delta — so all +10% bars share one color regardless of whether
       *  they raised or lowered p16. */}
      <text x={centerX} y={14} fontSize={10} fill="#666" textAnchor="middle">
        Δ p16 (tCO₂e) — baseline {baselineP16.toFixed(2)}
      </text>
      <g transform={`translate(${labelW + barAreaW + 8}, 8)`}>
        <rect x={0} y={0} width={10} height={8} fill={PLUS_COLOR} opacity={0.85} rx={1.5} />
        <text x={14} y={7} fontSize={9} fill="#444">input +10%</text>
        <rect x={0} y={11} width={10} height={8} fill={MINUS_COLOR} opacity={0.85} rx={1.5} />
        <text x={14} y={18} fontSize={9} fill="#444">input −10%</text>
      </g>

      {/* gridlines + tick labels */}
      {ticks.map((t, i) => {
        const x = centerX + scale(t);
        return (
          <g key={i}>
            <line
              x1={x}
              x2={x}
              y1={xAxisY}
              y2={height - 8}
              stroke={t === 0 ? "#888" : "#eee"}
              strokeWidth={t === 0 ? 1 : 1}
              strokeDasharray={t === 0 ? undefined : "2 3"}
            />
            <text
              x={x}
              y={height - 2}
              fontSize={10}
              fill="#888"
              textAnchor="middle"
            >
              {fmtSigned(t)}
            </text>
          </g>
        );
      })}

      {/* rows */}
      {rows.map((row, i) => {
        const y = xAxisY + 10 + i * rowHeight;
        const barY = y + rowHeight / 2 - 12;
        const barH = 24;
        const xPlus = scale(row.deltaPlus);
        const xMinus = scale(row.deltaMinus);
        // Bar starts at center, extends in direction of sign.
        const plusX = row.deltaPlus >= 0 ? centerX : centerX + xPlus;
        const plusW = Math.abs(xPlus);
        const minusX = row.deltaMinus >= 0 ? centerX : centerX + xMinus;
        const minusW = Math.abs(xMinus);
        return (
          <g key={row.id}>
            <text
              x={labelW - 8}
              y={y + rowHeight / 2 + 4}
              fontSize={12}
              fill="#222"
              textAnchor="end"
            >
              {row.label}
            </text>
            {/* +10% bar */}
            <rect
              x={plusX}
              y={barY}
              width={plusW}
              height={barH}
              fill={PLUS_COLOR}
              opacity={0.85}
              rx={1.5}
            />
            {/* -10% bar */}
            <rect
              x={minusX}
              y={barY}
              width={minusW}
              height={barH}
              fill={MINUS_COLOR}
              opacity={0.85}
              rx={1.5}
            />
            <text
              x={labelW + barAreaW + 8}
              y={y + rowHeight / 2 - 1}
              fontSize={10}
              fill={PLUS_COLOR}
              textAnchor="start"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              +10%: {fmtSigned(row.deltaPlus)}
            </text>
            <text
              x={labelW + barAreaW + 8}
              y={y + rowHeight / 2 + 12}
              fontSize={10}
              fill={MINUS_COLOR}
              textAnchor="start"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              −10%: {fmtSigned(row.deltaMinus)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
