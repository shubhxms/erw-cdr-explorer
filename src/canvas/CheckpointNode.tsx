/**
 * Custom react-flow node: label, stage badge, sparkline thumbnail (if array).
 * Reads precomputed histogram + stats from manifest; no network on mount.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useManifest } from "../data/manifest";
import { useStore } from "../store";
import type { Stage } from "../dag/nodes";
import { STAGE_COLOR } from "./stageColor";

export interface CheckpointNodeData extends Record<string, unknown> {
  id: string;
  label: string;
  stage: Stage;
  description?: string;
  unit?: string;
}

/**
 * Number of invisible handles per side. Multiple handles spread the
 * source/target points of edges along the node's vertical edge so that
 * fan-out from one node (or fan-in to one node) does not stack on a
 * single point — the routing in canvas/layout.ts assigns each edge to a
 * specific slot.
 */
export const HANDLE_COUNT = 9;
export const HANDLE_YS = Array.from(
  { length: HANDLE_COUNT },
  (_, i) => (i + 1) / (HANDLE_COUNT + 1),
);

/**
 * Mini histogram preview for the node card. Bars are positioned by their
 * actual bin edges (data values), not by index — so two sparklines sharing
 * the same `xRange` will visually shift relative to each other when the
 * underlying distribution shifts (e.g. an edit that shifts p16 up). The
 * old index-based version laid out 64 bins across a fixed 200px regardless
 * of where in data space the bins actually sat, which masked any
 * shift-the-mean edit.
 */
function Sparkline({
  bins,
  edges,
  xRange,
  width = 204,
  height = 22,
  color = "#555",
  opacity = 1,
}: {
  bins: number[];
  edges: number[];
  xRange: [number, number];
  width?: number;
  height?: number;
  color?: string;
  opacity?: number;
}) {
  const [xmin, xmax] = xRange;
  const xspan = xmax - xmin;
  const max = Math.max(1, ...bins);
  if (!Number.isFinite(xspan) || xspan <= 0 || edges.length !== bins.length + 1) {
    // Degenerate: no spread (all-same values) or shape mismatch. Render a
    // single centered marker so the row isn't blank.
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <rect
          x={width / 2 - 2}
          y={2}
          width={4}
          height={height - 4}
          fill={color}
          opacity={opacity}
        />
      </svg>
    );
  }
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {bins.map((b, i) => {
        const lo = edges[i];
        const hi = edges[i + 1];
        const x = ((lo - xmin) / xspan) * width;
        const bw = ((hi - lo) / xspan) * width;
        const bh = (b / max) * height;
        return (
          <rect
            key={i}
            x={x}
            y={height - bh}
            width={Math.max(0.6, bw - 0.3)}
            height={bh}
            fill={color}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

function CheckpointNodeImpl({ data, selected }: NodeProps) {
  const d = data as CheckpointNodeData;
  const removalId = useStore((s) => s.removalId);
  const { manifest } = useManifest(removalId);
  const entry = manifest?.entries[d.id];
  const selectedId = useStore((s) => s.selectedId);
  const isSelected = selected || selectedId === d.id;
  const runStatus = useStore((s) => s.runStatus);
  const computedSet = useStore((s) => s.computedSet);
  const currentlyComputing = useStore((s) => s.currentlyComputing);
  const computedValue = useStore((s) => s.computedValues.get(d.id));
  // Edit/override indicators. We count any edit whose nodeId matches THIS node
  // (areas, column transforms keyed by `${nodeId}|*`).
  const hasEdit = useStore((s) => {
    for (const k of s.edits.keys()) {
      if (k === d.id || k.startsWith(`${d.id}|`)) return true;
    }
    return false;
  });
  const hasOverride = useStore((s) => s.overrides.has(d.id));
  const wasOverridden = useStore((s) => s.overriddenSet.has(d.id));

  // Canvas thumbnail semantics mirror the sidebar exactly:
  //   - registry baseline (manifest) is the faded gray background sparkline,
  //     always present if the manifest has it.
  //   - current (this-browser-run) is the colored foreground sparkline,
  //     only present when a run has actually computed this node.
  //   - headline number prefers current; shows Δ vs baseline if both exist
  //     and they differ.
  const isRunning = runStatus === "running";
  const isComputingNow = currentlyComputing === d.id;
  const hasComputed = computedValue !== undefined;

  const baselineHist = entry?.kind === "array" ? entry.histogram : undefined;
  // Shared x-range across baseline + current sparkline so they align on
  // actual data values (and a shift-the-mean edit visibly moves bars).
  const sparkXRange: [number, number] | undefined = (() => {
    const ranges: [number, number][] = [];
    const bEdges = baselineHist?.edges;
    if (bEdges && bEdges.length >= 2) ranges.push([bEdges[0], bEdges[bEdges.length - 1]]);
    const cEdges =
      computedValue?.kind === "array" ? computedValue.histogram.edges : undefined;
    if (cEdges && cEdges.length >= 2) ranges.push([cEdges[0], cEdges[cEdges.length - 1]]);
    if (!ranges.length) return undefined;
    return [
      Math.min(...ranges.map((r) => r[0])),
      Math.max(...ranges.map((r) => r[1])),
    ];
  })();
  const baselineStats = entry?.kind === "array" ? entry.stats : undefined;
  const baselineScalar = entry?.kind === "scalar" ? entry.value : undefined;
  const baselineRows = entry?.kind === "dataframe" ? entry.row_count : undefined;

  const currentHist =
    computedValue?.kind === "array" ? computedValue.histogram : undefined;
  const currentStats =
    computedValue?.kind === "array" ? computedValue.stats : undefined;
  const currentScalar =
    computedValue?.kind === "scalar" ? computedValue.value : undefined;
  const currentRows =
    computedValue?.kind === "dataframe" ? computedValue.rowCount : undefined;

  // showData decides whether the node card looks "live" or "queued".
  // We have data whenever there's either a fresh computed value or a manifest
  // baseline. Otherwise the run is still in progress for this node.
  const showData =
    hasComputed ||
    (!isRunning && (computedSet.has(d.id) || baselineHist || baselineScalar !== undefined || baselineRows !== undefined));

  const headline = (() => {
    if (!showData) {
      if (isComputingNow) return "computing…";
      if (isRunning) return "queued";
      return "—";
    }
    // scalar
    const scalarVal = currentScalar ?? baselineScalar;
    if (typeof scalarVal === "number") {
      let text = formatNumber(scalarVal);
      if (d.unit) text += ` ${d.unit}`;
      if (
        typeof currentScalar === "number" &&
        typeof baselineScalar === "number" &&
        currentScalar !== baselineScalar
      ) {
        const delta = currentScalar - baselineScalar;
        text += ` (${delta >= 0 ? "+" : ""}${formatNumber(delta)})`;
      }
      return text;
    }
    // array
    const arrStats = currentStats ?? baselineStats;
    if (arrStats) {
      let text = `μ=${formatNumber(arrStats.mean)}`;
      if (d.unit) text += ` ${d.unit}`;
      if (currentStats && baselineStats && currentStats.mean !== baselineStats.mean) {
        const delta = currentStats.mean - baselineStats.mean;
        text += ` (${delta >= 0 ? "+" : ""}${formatNumber(delta)})`;
      }
      return text;
    }
    // dataframe
    const rows = currentRows ?? baselineRows;
    if (typeof rows === "number") return `${rows} rows`;
    return "—";
  })();

  return (
    <div
      style={{
        width: 220,
        height: 84,
        background: showData ? "#fff" : "#eee",
        // Use border longhands rather than the `border` shorthand. Setting
        // the shorthand resets all four sides every render, and React skips
        // re-applying `borderLeft` when its string value hasn't changed —
        // so after a select→deselect cycle the stage color stripe was
        // disappearing. Longhands avoid the cross-property reset.
        borderTopWidth: isSelected ? 2 : isComputingNow ? 2 : 1,
        borderTopStyle: "solid",
        borderTopColor: isSelected ? "#111" : isComputingNow ? STAGE_COLOR[d.stage] : "#ccc",
        borderRightWidth: isSelected ? 2 : isComputingNow ? 2 : 1,
        borderRightStyle: "solid",
        borderRightColor: isSelected ? "#111" : isComputingNow ? STAGE_COLOR[d.stage] : "#ccc",
        borderBottomWidth: isSelected ? 2 : isComputingNow ? 2 : 1,
        borderBottomStyle: "solid",
        borderBottomColor: isSelected ? "#111" : isComputingNow ? STAGE_COLOR[d.stage] : "#ccc",
        borderLeftWidth: 4,
        borderLeftStyle: "solid",
        borderLeftColor: showData ? STAGE_COLOR[d.stage] : "#bbb",
        borderRadius: 4,
        padding: "6px 8px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "system-ui, sans-serif",
        fontSize: 11,
        boxSizing: "border-box",
        cursor: "pointer",
        transition: "background 160ms ease, border-color 160ms ease",
        boxShadow: isComputingNow
          ? `0 0 0 3px ${hexToRgba(STAGE_COLOR[d.stage], 0.2)}`
          : undefined,
      }}
    >
      {/* Multiple invisible target handles, spread vertically so incoming
       *  edges leave the source from distinct y positions instead of all
       *  stacking on the center handle. Slot assignment happens in
       *  canvas/layout.ts based on each edge's fan-in index. */}
      {HANDLE_YS.map((y, i) => (
        <Handle
          key={`t${i}`}
          id={`t${i}`}
          type="target"
          position={Position.Left}
          style={{ top: `${y * 100}%`, opacity: 0, pointerEvents: "none" }}
        />
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
        <span
          style={{
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: showData ? "#222" : "#888",
          }}
        >
          {hasEdit && <span style={{ color: "#a4570e", marginRight: 3 }}>✎</span>}
          {(hasOverride || wasOverridden) && (
            <span style={{ color: "#7a4fb1", marginRight: 3 }}>📌</span>
          )}
          {d.label}
        </span>
        <span
          style={{
            color: isComputingNow ? STAGE_COLOR[d.stage] : "#888",
            fontVariantNumeric: "tabular-nums",
            fontWeight: isComputingNow ? 600 : 400,
          }}
        >
          {headline}
        </span>
      </div>
      <div style={{ height: 24, display: "flex", alignItems: "center", position: "relative" }}>
        {showData && baselineHist && sparkXRange && (
          <div style={{ position: "absolute", inset: 0 }}>
            {/* Faded gray background when a CURRENT is overlaid; full opacity
              * darker gray when standalone (pre-run). Bars positioned by their
              * actual bin edges within the shared sparkXRange. */}
            <Sparkline
              bins={baselineHist.bins}
              edges={baselineHist.edges}
              xRange={sparkXRange}
              color={currentHist ? "#999" : "#555"}
              opacity={currentHist ? 0.35 : 1}
            />
          </div>
        )}
        {showData && currentHist && sparkXRange && (
          <div style={{ position: "absolute", inset: 0 }}>
            <Sparkline
              bins={currentHist.bins}
              edges={currentHist.edges}
              xRange={sparkXRange}
              color="#1850c8"
            />
          </div>
        )}
        {!showData && isComputingNow && <ProgressBar color={STAGE_COLOR[d.stage]} />}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "#aaa",
          fontSize: 10,
        }}
      >
        <span>{d.stage}</span>
        <span>
          {showData
            ? computedValue?.kind ?? entry?.kind ?? ""
            : isRunning
              ? "—"
              : ""}
        </span>
      </div>
      {HANDLE_YS.map((y, i) => (
        <Handle
          key={`s${i}`}
          id={`s${i}`}
          type="source"
          position={Position.Right}
          style={{ top: `${y * 100}%`, opacity: 0, pointerEvents: "none" }}
        />
      ))}
    </div>
  );
}

function ProgressBar({ color }: { color: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: 4,
        background: "#e8e8e8",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "40%",
          height: "100%",
          background: color,
          borderRadius: 2,
          animation: "ew-progress 1.1s ease-in-out infinite",
        }}
      />
    </div>
  );
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 10000 || a < 0.001) return v.toExponential(2);
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

export const CheckpointNode = memo(CheckpointNodeImpl);
