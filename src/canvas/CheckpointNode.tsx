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

  const headline = (() => {
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
        background: "#fff",
        border: isSelected ? "2px solid #111" : "1px solid #ccc",
        borderLeft: `4px solid ${STAGE_COLOR[d.stage]}`,
        borderRadius: 4,
        padding: "6px 8px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "system-ui, sans-serif",
        fontSize: 11,
        boxSizing: "border-box",
        cursor: "pointer",
        transition: "opacity 120ms ease",
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
          }}
        >
          {d.label}
        </span>
        <span style={{ color: "#888", fontVariantNumeric: "tabular-nums" }}>{headline}</span>
      </div>
      <div style={{ height: 24, display: "flex", alignItems: "center" }}>
        {entry?.histogram ? <Sparkline bins={entry.histogram.bins} /> : null}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "#888",
          fontSize: 10,
        }}
      >
        <span>{d.stage}</span>
        <span>{entry?.kind ?? ""}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
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
