/**
 * Floating popover that exposes the four "constants" — chain parameters
 * that aren't currently DAG nodes (application_rate, sampling_depth_cm,
 * winsorise_n_std, zero_filter_enabled). Edits batch in the store and
 * apply on the next "Run".
 */

import { useEffect, useRef, useState } from "react";
import { CONSTANTS, type ConstantMeta, type EditSpec } from "../types/edits";
import { useStore } from "../store";

export function ConstantsButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const edits = useStore((s) => s.edits);

  // count constant edits only (scalars or toggles whose nodeId is in CONSTANTS)
  const constantEditCount = [...edits.values()].filter(
    (e) => (e.kind === "scalar" || e.kind === "toggle") &&
      CONSTANTS.some((c) => c.id === e.nodeId),
  ).length;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: 11,
          padding: "3px 10px",
          background: open ? "#1850c8" : "#fff",
          color: open ? "#fff" : "#222",
          border: "1px solid #ccc",
          borderRadius: 3,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        constants{constantEditCount > 0 ? ` · ${constantEditCount} edited` : ""}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            width: 320,
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 4,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            padding: 12,
            zIndex: 50,
            fontFamily: "system-ui, sans-serif",
            fontSize: 12,
          }}
        >
          <div style={{ marginBottom: 8, color: "#666", fontSize: 11 }}>
            edits apply on next Run
          </div>
          {CONSTANTS.map((c) => (
            <ConstantRow key={c.id} meta={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConstantRow({ meta }: { meta: ConstantMeta }) {
  const edits = useStore((s) => s.edits);
  const setEdit = useStore((s) => s.setEdit);
  const clearEdit = useStore((s) => s.clearEdit);
  const current = edits.get(meta.id);
  const value =
    current && (current.kind === "scalar" || current.kind === "toggle")
      ? current.value
      : meta.defaultValue;
  const edited = !!current;

  return (
    <div
      style={{
        padding: "6px 0",
        borderBottom: "1px solid #f0f0f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: edited ? 600 : 400 }}>
          {meta.label}
          {edited && <span style={{ marginLeft: 4, color: "#1850c8" }}>✎</span>}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "#888",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {meta.description}
        </div>
      </div>
      {meta.kind === "scalar" ? (
        <input
          type="number"
          value={Number(value)}
          step={meta.range ? (meta.range[1] - meta.range[0]) / 200 : 1}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isFinite(v)) return;
            const edit: EditSpec = {
              kind: "scalar",
              nodeId: meta.id,
              value: v,
            };
            setEdit(meta.id, edit);
          }}
          style={{
            width: 90,
            fontSize: 12,
            padding: "2px 4px",
            border: "1px solid #ccc",
            borderRadius: 3,
            fontVariantNumeric: "tabular-nums",
          }}
        />
      ) : (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => {
            setEdit(meta.id, {
              kind: "toggle",
              nodeId: meta.id,
              value: e.target.checked,
            });
          }}
        />
      )}
      {edited && (
        <button
          type="button"
          onClick={() => clearEdit(meta.id)}
          title="revert to default"
          style={{
            fontSize: 10,
            color: "#a00",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
