/**
 * Sidebar-embedded counterfactual override panel for [N] array nodes.
 * Two modes: point-collapse (replace array with constant) and mean-shift
 * (recenter array on target mean, preserving dispersion).
 *
 * Honest framing: applies forward-only. Upstream and sibling consumers of
 * upstream nodes deliberately stay on their original values — the panel
 * lists how many direct downstream nodes will see the override.
 */

import { useState } from "react";
import { useStore } from "../store";
import { descendantsOf } from "../dag/graph";
import { NODE_BY_ID } from "../dag/nodes";
import type { OverrideSpec } from "../types/edits";

interface Props {
  nodeId: string;
  /** Current mean computed for this node — used to seed the inputs. */
  meanHint?: number;
}

export function OverridePanel({ nodeId, meanHint }: Props) {
  const overrides = useStore((s) => s.overrides);
  const setOverride = useStore((s) => s.setOverride);
  const clearOverride = useStore((s) => s.clearOverride);
  const current = overrides.get(nodeId);

  const [mode, setMode] = useState<"collapse" | "shift">(
    current ? current.kind : "shift",
  );
  const seedValue =
    current?.kind === "collapse"
      ? current.value
      : current?.kind === "shift"
        ? current.target_mean
        : (meanHint ?? 0);
  const [value, setValue] = useState<string>(String(seedValue));

  function apply() {
    const v = parseFloat(value);
    if (!Number.isFinite(v)) return;
    const spec: OverrideSpec =
      mode === "collapse"
        ? { kind: "collapse", nodeId, value: v }
        : { kind: "shift", nodeId, target_mean: v };
    setOverride(nodeId, spec);
  }

  const descendants = [...descendantsOf(nodeId)]
    .map((id) => NODE_BY_ID[id])
    .filter(Boolean);

  return (
    <div
      style={{
        marginTop: 16,
        padding: "10px 12px",
        background: "#f3eefa",
        border: "1px solid #c1a8db",
        borderLeft: "4px solid #7a4fb1",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#5d2f8e",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        override (counterfactual)
      </div>
      <p
        style={{
          fontSize: 11,
          color: "#555",
          margin: "0 0 8px",
          lineHeight: 1.4,
        }}
      >
        Pin this node's value. Forward-only: only the {descendants.length}{" "}
        downstream nodes will see this override. Upstream and sibling
        consumers of upstream nodes will <strong>not</strong> change.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="radio"
            name={`mode-${nodeId}`}
            checked={mode === "collapse"}
            onChange={() => setMode("collapse")}
          />
          point-collapse →
        </label>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="radio"
            name={`mode-${nodeId}`}
            checked={mode === "shift"}
            onChange={() => setMode("shift")}
          />
          mean-shift to
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          style={{
            flex: 1,
            fontSize: 12,
            padding: "3px 6px",
            border: "1px solid #c1a8db",
            borderRadius: 3,
            fontVariantNumeric: "tabular-nums",
          }}
        />
        <button
          type="button"
          onClick={apply}
          style={{
            fontSize: 11,
            padding: "3px 10px",
            background: "#7a4fb1",
            color: "#fff",
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          {current ? "update" : "apply"}
        </button>
        {current && (
          <button
            type="button"
            onClick={() => clearOverride(nodeId)}
            style={{
              fontSize: 10,
              padding: "3px 8px",
              background: "#fff",
              color: "#a00",
              border: "1px solid #a00",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            clear
          </button>
        )}
      </div>

      {current && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 8px",
            background: "#fff",
            border: "1px dashed #c1a8db",
            borderRadius: 3,
            fontSize: 11,
            color: "#444",
          }}
        >
          active:{" "}
          <strong>
            {current.kind === "collapse"
              ? `collapse(${current.value})`
              : `mean-shift(${current.target_mean})`}
          </strong>
          <br />
          downstream cone: {descendants.length} nodes. Click ✎/📌 in
          EditsPanel to inspect.
        </div>
      )}
    </div>
  );
}
