/**
 * Floating summary of all active edits + overrides. Pinned to the top-right
 * of the canvas. Click a row to select that node. Clear-all clears every edit.
 */

import { useStore } from "../store";
import { NODE_BY_ID } from "../dag/nodes";
import { CONSTANTS, type EditSpec, type OverrideSpec } from "../types/edits";

function formatEdit(e: EditSpec): { label: string; summary: string; group: string } {
  switch (e.kind) {
    case "scalar":
    case "toggle": {
      const meta = CONSTANTS.find((c) => c.id === e.nodeId);
      return {
        group: "constants",
        label: meta?.label ?? e.nodeId,
        summary: typeof e.value === "boolean" ? (e.value ? "on" : "off") : String(e.value),
      };
    }
    case "area":
      return {
        group: "areas",
        label: `${e.plotType} area`,
        summary: `${e.value.toLocaleString()} ha`,
      };
    case "column_transform": {
      const op = e.op === "replace_mean" ? "mean →" : e.op === "shift_mean" ? "+ " : "× ";
      return {
        group: "columns",
        label: e.nodeId === "inputs/feedstock_samples"
          ? `feedstock ${e.column.replace("mass_fraction_", "").toUpperCase()}`
          : `bulk density`,
        summary: `${op}${e.value}`,
      };
    }
  }
}

function formatOverride(o: OverrideSpec): { label: string; summary: string } {
  const node = NODE_BY_ID[o.nodeId];
  const label = node?.label ?? o.nodeId;
  if (o.kind === "collapse") {
    return { label, summary: `collapsed to ${o.value}` };
  }
  return { label, summary: `mean shifted to ${o.target_mean}` };
}

const DEFAULT_SEED = 42;

export function EditsPanel() {
  const edits = useStore((s) => s.edits);
  const overrides = useStore((s) => s.overrides);
  const appliedEdits = useStore((s) => s.appliedEdits);
  const appliedOverrides = useStore((s) => s.appliedOverrides);
  const runStatus = useStore((s) => s.runStatus);
  const setSelected = useStore((s) => s.setSelected);
  const clearAllEdits = useStore((s) => s.clearAllEdits);
  const clearEdit = useStore((s) => s.clearEdit);
  const clearOverride = useStore((s) => s.clearOverride);
  const seed = useStore((s) => s.seed);
  const appliedSeed = useStore((s) => s.appliedSeed);
  const setSeed = useStore((s) => s.setSeed);

  // Seed counts as a tracked edit when it differs from the canonical default
  // (42) that the registry-baseline manifest was generated under.
  const seedEdited = seed !== DEFAULT_SEED;

  if (edits.size === 0 && overrides.size === 0 && !seedEdited) return null;

  const total = edits.size + overrides.size + (seedEdited ? 1 : 0);

  const seedUnapplied = seedEdited && appliedSeed !== seed;
  const hasUnapplied =
    runStatus !== "running" && runStatus !== "loading" &&
    (seedUnapplied ||
      edits.size !== appliedEdits.size ||
      overrides.size !== appliedOverrides.size ||
      ![...edits.entries()].every(([k, v]) => {
        const prev = appliedEdits.get(k);
        return prev && JSON.stringify(prev) === JSON.stringify(v);
      }) ||
      ![...overrides.entries()].every(([k, v]) => {
        const prev = appliedOverrides.get(k);
        return prev && JSON.stringify(prev) === JSON.stringify(v);
      }));

  // Group edits by type
  const editGroups = new Map<string, [string, EditSpec][]>();
  for (const [key, edit] of edits.entries()) {
    const f = formatEdit(edit);
    const arr = editGroups.get(f.group) ?? [];
    arr.push([key, edit]);
    editGroups.set(f.group, arr);
  }
  const groupLabels: Record<string, string> = {
    constants: "Chain Constants",
    areas: "Plot Areas",
    columns: "Column Transforms",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 320,
        maxHeight: "calc(100% - 24px)",
        overflowY: "auto",
        background: "rgba(255,255,255,0.96)",
        border: "1px solid #d9b878",
        borderLeft: "4px solid #a4570e",
        borderRadius: 6,
        padding: "10px 12px",
        fontFamily: "system-ui, sans-serif",
        fontSize: 11,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        zIndex: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: "1px solid #e8d9be",
        }}
      >
        <span style={{ color: "#8a5e1e", fontWeight: 600, fontSize: 12 }}>
          {hasUnapplied
            ? `${total} unapplied change${total === 1 ? "" : "s"}`
            : `${total} active edit${total === 1 ? "" : "s"}`}
        </span>
        <button
          type="button"
          onClick={clearAllEdits}
          style={{
            fontSize: 10,
            background: "#fff",
            color: "#a00",
            border: "1px solid #daa",
            borderRadius: 3,
            padding: "2px 8px",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          revert all
        </button>
      </div>
      {hasUnapplied && (
        <div style={{ fontSize: 10, color: "#a4570e", marginBottom: 6, fontStyle: "italic" }}>
          Values changed since last run — click Recompute to apply.
        </div>
      )}

      {seedEdited && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3, fontWeight: 600 }}>
            RNG
          </div>
          <div style={rowStyle}>
            <span
              style={{ flex: 1, color: "#222", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title="numpy.default_rng seed drives every bootstrap resample; baseline manifest uses seed=42"
            >
              PRNG seed
            </span>
            <span style={{ color: "#a4570e", fontVariantNumeric: "tabular-nums", flexShrink: 0, fontWeight: 500 }}>
              {appliedSeed !== null && appliedSeed !== seed
                ? `${appliedSeed} → ${seed}`
                : seed}
            </span>
            <button
              type="button"
              onClick={() => setSeed(DEFAULT_SEED)}
              style={revertBtn}
              title="revert to 42"
            >
              revert
            </button>
          </div>
        </div>
      )}

      {[...editGroups.entries()].map(([group, items]) => (
        <div key={group} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3, fontWeight: 600 }}>
            {groupLabels[group] ?? group}
          </div>
          {items.map(([key, edit]) => {
            const f = formatEdit(edit);
            return (
              <div
                key={key}
                style={rowStyle}
                onClick={() => {
                  const nodeId =
                    edit.kind === "scalar" || edit.kind === "toggle"
                      ? null
                      : edit.nodeId;
                  if (nodeId) setSelected(nodeId);
                }}
              >
                <span style={{ flex: 1, color: "#222", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
                <span style={{ color: "#a4570e", fontVariantNumeric: "tabular-nums", flexShrink: 0, fontWeight: 500 }}>{f.summary}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearEdit(key);
                  }}
                  style={revertBtn}
                  title="revert"
                >
                  revert
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {overrides.size > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 9, color: "#7a4fb1", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3, fontWeight: 600 }}>
            Counterfactual Overrides
          </div>
          {[...overrides.entries()].map(([id, o]) => {
            const f = formatOverride(o);
            return (
              <div
                key={id}
                style={rowStyle}
                onClick={() => setSelected(id)}
              >
                <span style={{ flex: 1, color: "#222", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
                <span style={{ color: "#7a4fb1", fontVariantNumeric: "tabular-nums", flexShrink: 0, fontWeight: 500 }}>{f.summary}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearOverride(id);
                  }}
                  style={revertBtn}
                  title="revert"
                >
                  revert
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 0",
  cursor: "pointer",
  borderBottom: "1px solid #f4ecd6",
  minHeight: 24,
};

const revertBtn: React.CSSProperties = {
  fontSize: 9,
  color: "#a00",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "0 4px",
  flexShrink: 0,
  textDecoration: "underline",
};
