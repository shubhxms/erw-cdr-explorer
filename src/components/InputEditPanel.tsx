/**
 * Sidebar-embedded edit panel for the input nodes:
 *   - inputs/area_hectares          → three plot-level scalar inputs
 *   - inputs/feedstock_samples      → per-column transform UI (Ca/Mg/Ti)
 *   - inputs/bulk_density_samples   → per-column transform UI (bulk_density)
 *
 * Edits write into the store's `edits` Map; they're batched until the next
 * Run. The Python chain reads them at the start of run() and re-runs forward
 * naturally.
 */

import { useState } from "react";
import { editKey, useStore } from "../store";
import type { EditSpec } from "../types/edits";

interface Props {
  nodeId: string;
}

const FEEDSTOCK_COLUMNS = [
  { key: "mass_fraction_ca", label: "Ca (mg/kg)" },
  { key: "mass_fraction_mg", label: "Mg (mg/kg)" },
  { key: "mass_fraction_ti", label: "Ti (mg/kg)" },
] as const;

const BD_COLUMNS = [{ key: "bulk_density", label: "bulk density (kg/m³)" }] as const;

const PLOT_TYPES = ["deployment", "treatment", "control"] as const;

const DEFAULT_AREAS: Record<string, number> = {
  deployment: 2549.87,
  treatment: 67.06,
  control: 67.06,
};

export function InputEditPanel({ nodeId }: Props) {
  if (nodeId === "inputs/area_hectares") return <AreaEdits />;
  if (nodeId === "inputs/feedstock_samples")
    return <ColumnTransformPanel nodeId="inputs/feedstock_samples" columns={FEEDSTOCK_COLUMNS} />;
  if (nodeId === "inputs/bulk_density_samples")
    return <ColumnTransformPanel nodeId="inputs/bulk_density_samples" columns={BD_COLUMNS} />;
  return null;
}

function PanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: "10px 12px",
        background: "#fff8eb",
        border: "1px solid #e0c179",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#8a5e1e",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function AreaEdits() {
  const edits = useStore((s) => s.edits);
  const setEdit = useStore((s) => s.setEdit);
  const clearEdit = useStore((s) => s.clearEdit);
  return (
    <PanelShell title="Edit Plot Areas">
      <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>
        Area scales CO₂ tonnes linearly. Control area does not affect the final p16.
      </div>
      {PLOT_TYPES.map((plot) => {
        const k = `inputs/area_hectares|${plot}`;
        const current = edits.get(k);
        const value =
          current && current.kind === "area" ? current.value : DEFAULT_AREAS[plot];
        const edited = !!current;
        return (
          <div key={plot} style={rowStyle}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: edited ? 600 : 400 }}>{plot}</span>
              {edited && <span style={{ marginLeft: 4, color: "#a4570e" }}>✎</span>}
            </div>
            <input
              type="number"
              step={value / 50}
              value={value}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isFinite(v)) return;
                const edit: EditSpec = {
                  kind: "area",
                  nodeId: "inputs/area_hectares",
                  plotType: plot,
                  value: v,
                };
                setEdit(editKey(edit), edit);
              }}
              style={inputStyle}
            />
            {edited && (
              <button type="button" onClick={() => clearEdit(k)} style={revertBtn} title="revert">
                ✕
              </button>
            )}
          </div>
        );
      })}
    </PanelShell>
  );
}

function ColumnTransformPanel({
  nodeId,
  columns,
}: {
  nodeId: "inputs/feedstock_samples" | "inputs/bulk_density_samples";
  columns: readonly { key: string; label: string }[];
}) {
  return (
    <PanelShell title="Edit Columns">
      <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>
        Transform a column before re-bootstrapping. Changes propagate to all downstream nodes.
      </div>
      {columns.map((c) => (
        <ColumnTransformRow key={c.key} nodeId={nodeId} columnKey={c.key} label={c.label} />
      ))}
    </PanelShell>
  );
}

function ColumnTransformRow({
  nodeId,
  columnKey,
  label,
}: {
  nodeId: "inputs/feedstock_samples" | "inputs/bulk_density_samples";
  columnKey: string;
  label: string;
}) {
  const edits = useStore((s) => s.edits);
  const setEdit = useStore((s) => s.setEdit);
  const clearEdit = useStore((s) => s.clearEdit);
  const key = `${nodeId}|${columnKey}`;
  const current = edits.get(key);
  const isEdit = current && current.kind === "column_transform";

  const [op, setOp] = useState<"replace_mean" | "shift_mean" | "scale">(
    isEdit ? (current as { op: "replace_mean" | "shift_mean" | "scale" }).op : "shift_mean",
  );
  const [value, setValue] = useState<string>(
    isEdit ? String((current as { value: number }).value) : "0",
  );

  function commit() {
    const v = parseFloat(value);
    if (!Number.isFinite(v)) return;
    const edit: EditSpec = {
      kind: "column_transform",
      nodeId,
      column: columnKey,
      op,
      value: v,
    };
    setEdit(editKey(edit), edit);
  }

  return (
    <div style={{ ...rowStyle, flexWrap: "wrap" }}>
      <div style={{ flex: "1 0 100%", marginBottom: 4 }}>
        <span style={{ fontWeight: isEdit ? 600 : 400 }}>{label}</span>
        {isEdit && <span style={{ marginLeft: 4, color: "#a4570e" }}>✎</span>}
      </div>
      <select
        value={op}
        onChange={(e) => setOp(e.target.value as typeof op)}
        style={{
          fontSize: 11,
          padding: "2px 4px",
          border: "1px solid #ccc",
          borderRadius: 3,
          background: "#fff",
        }}
      >
        <option value="replace_mean">replace mean = </option>
        <option value="shift_mean">shift by Δ = </option>
        <option value="scale">scale by ×</option>
      </select>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        style={inputStyle}
      />
      <button
        type="button"
        onClick={commit}
        style={{
          fontSize: 10,
          padding: "2px 6px",
          background: "#1850c8",
          color: "#fff",
          border: "none",
          borderRadius: 3,
          cursor: "pointer",
        }}
      >
        apply
      </button>
      {isEdit && (
        <button type="button" onClick={() => clearEdit(key)} style={revertBtn} title="revert">
          ✕
        </button>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  padding: "6px 0",
  borderBottom: "1px solid #f4ecd6",
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  width: 90,
  fontSize: 12,
  padding: "2px 4px",
  border: "1px solid #ccc",
  borderRadius: 3,
  fontVariantNumeric: "tabular-nums",
};

const revertBtn: React.CSSProperties = {
  fontSize: 10,
  color: "#a00",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "2px 4px",
};
