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
}

function Sparkline({ bins }: { bins: number[] }) {
  const w = 200;
  const h = 22;
  const max = Math.max(1, ...bins);
  const bw = w / bins.length;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      {bins.map((b, i) => {
        const bh = (b / max) * h;
        return (
          <rect
            key={i}
            x={i * bw}
            y={h - bh}
            width={bw - 0.5}
            height={bh}
            fill="#555"
          />
        );
      })}
    </svg>
  );
}

function CheckpointNodeImpl({ data, selected }: NodeProps) {
  const d = data as CheckpointNodeData;
  const manifest = useManifest();
  const entry = manifest?.entries[d.id];
  const selectedId = useStore((s) => s.selectedId);
  const isSelected = selected || selectedId === d.id;
  const runStatus = useStore((s) => s.runStatus);
  const computedSet = useStore((s) => s.computedSet);
  const currentlyComputing = useStore((s) => s.currentlyComputing);

  const isComputed = computedSet.has(d.id);
  const isRunning = runStatus === "running";
  const isComputingNow = currentlyComputing === d.id;
  const showData = isComputed;

  const headline = (() => {
    if (!showData) {
      if (isComputingNow) return "computing…";
      if (isRunning) return "queued";
      return "—";
    }
    if (!entry) return "—";
    if (entry.kind === "scalar" && typeof entry.value === "number") {
      return formatNumber(entry.value);
    }
    if (entry.kind === "array" && entry.stats) {
      return `μ=${formatNumber(entry.stats.mean)}`;
    }
    if (entry.kind === "dataframe" && typeof entry.row_count === "number") {
      return `${entry.row_count} rows`;
    }
    return "—";
  })();

  return (
    <div
      style={{
        width: 220,
        height: 84,
        background: showData ? "#fff" : "#eee",
        border: isSelected
          ? "2px solid #111"
          : isComputingNow
            ? `2px solid ${STAGE_COLOR[d.stage]}`
            : "1px solid #ccc",
        borderLeft: `4px solid ${showData ? STAGE_COLOR[d.stage] : "#bbb"}`,
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
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
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
      <div style={{ height: 24, display: "flex", alignItems: "center" }}>
        {showData && entry?.histogram ? (
          <Sparkline bins={entry.histogram.bins} />
        ) : isComputingNow ? (
          <ProgressBar color={STAGE_COLOR[d.stage]} />
        ) : null}
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
        <span>{showData ? entry?.kind ?? "" : isRunning ? "—" : ""}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
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
