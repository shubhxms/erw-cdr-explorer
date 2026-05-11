/**
 * Floating summary of all active edits + overrides. Pinned to the top-right
 * of the canvas. Click a row to select that node. Clear-all clears every edit.
 */

import { useStore } from "../store";
import { NODE_BY_ID } from "../dag/nodes";
import { CONSTANTS, type EditSpec, type OverrideSpec } from "../types/edits";

function formatEdit(e: EditSpec): { label: string; summary: string } {
  switch (e.kind) {
    case "scalar":
    case "toggle": {
      const meta = CONSTANTS.find((c) => c.id === e.nodeId);
      return {
        label: meta?.label ?? e.nodeId,
        summary: typeof e.value === "boolean" ? (e.value ? "on" : "off") : String(e.value),
      };
    }
    case "area":
      return {
        label: `area · ${e.plotType}`,
        summary: `${e.value} ha`,
      };
    case "column_transform": {
      const op = e.op === "replace_mean" ? "mean →" : e.op === "shift_mean" ? "shift +" : "× ";
      return {
        label: `${e.nodeId.split("/")[1]} · ${e.column.replace("mass_fraction_", "")}`,
        summary: `${op} ${e.value}`,
      };
    }
  }
}

function formatOverride(o: OverrideSpec): { label: string; summary: string } {
  const node = NODE_BY_ID[o.nodeId];
  const label = node?.label ?? o.nodeId;
  if (o.kind === "collapse") {
    return { label, summary: `collapse → ${o.value}` };
  }
  return { label, summary: `mean-shift → ${o.target_mean}` };
}

export function EditsPanel() {
  const edits = useStore((s) => s.edits);
  const overrides = useStore((s) => s.overrides);
  const setSelected = useStore((s) => s.setSelected);
  const clearAllEdits = useStore((s) => s.clearAllEdits);
  const clearEdit = useStore((s) => s.clearEdit);
  const clearOverride = useStore((s) => s.clearOverride);

  if (edits.size === 0 && overrides.size === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 280,
        maxHeight: "calc(100% - 24px)",
        overflowY: "auto",
        background: "rgba(255,255,255,0.96)",
        border: "1px solid #d9b878",
        borderLeft: "4px solid #a4570e",
        borderRadius: 4,
        padding: "8px 10px",
        fontFamily: "system-ui, sans-serif",
        fontSize: 11,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        zIndex: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ color: "#8a5e1e", fontWeight: 600 }}>
          {edits.size + overrides.size} pending edit{edits.size + overrides.size === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={clearAllEdits}
          style={{
            fontSize: 10,
            background: "transparent",
            color: "#a00",
            border: "1px solid #a00",
            borderRadius: 3,
            padding: "1px 6px",
            cursor: "pointer",
          }}
        >
          clear all
        </button>
      </div>

      {[...edits.entries()].map(([key, edit]) => {
        const f = formatEdit(edit);
        return (
          <div
            key={key}
            style={rowStyle}
            onClick={() => {
              const nodeId =
                edit.kind === "scalar" || edit.kind === "toggle"
                  ? null // constants aren't DAG nodes
                  : edit.nodeId;
              if (nodeId) setSelected(nodeId);
            }}
          >
            <span style={{ flex: 1, color: "#222" }}>{f.label}</span>
            <span style={{ color: "#a4570e", fontVariantNumeric: "tabular-nums" }}>{f.summary}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearEdit(key);
              }}
              style={revertBtn}
            >
              ✕
            </button>
          </div>
        );
      })}

      {overrides.size > 0 && (
        <div style={{ color: "#7a4fb1", fontWeight: 600, marginTop: 6, marginBottom: 2 }}>
          counterfactual overrides
        </div>
      )}
      {[...overrides.entries()].map(([id, o]) => {
        const f = formatOverride(o);
        return (
          <div
            key={id}
            style={{ ...rowStyle, borderBottom: "1px solid #ece3f5" }}
            onClick={() => setSelected(id)}
          >
            <span style={{ flex: 1, color: "#222" }}>{f.label}</span>
            <span style={{ color: "#7a4fb1", fontVariantNumeric: "tabular-nums" }}>📌 {f.summary}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearOverride(id);
              }}
              style={revertBtn}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 0",
  cursor: "pointer",
  borderBottom: "1px solid #f4ecd6",
};

const revertBtn: React.CSSProperties = {
  fontSize: 9,
  color: "#a00",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "0 4px",
};
