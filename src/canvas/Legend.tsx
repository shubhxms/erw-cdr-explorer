/**
 * Floating canvas legend: stage colours + edge kinds.
 */

import { STAGE_COLOR } from "./stageColor";

const STAGE_LABEL: Record<keyof typeof STAGE_COLOR, string> = {
  inputs: "inputs",
  cleaning: "cleaning",
  bootstrap: "bootstrap",
  chain_deployment: "chain · deployment",
  chain_treatment: "chain · treatment",
  diagnostics: "validation",
  aggregation: "aggregation → p16",
};

export function Legend() {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        background: "rgba(255,255,255,0.96)",
        border: "1px solid #ddd",
        borderRadius: 4,
        padding: "8px 10px",
        fontFamily: "system-ui, sans-serif",
        fontSize: 11,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        zIndex: 5,
        pointerEvents: "none",
        minWidth: 170,
      }}
    >
      <div style={{ color: "#888", marginBottom: 4 }}>stages</div>
      {(Object.keys(STAGE_LABEL) as (keyof typeof STAGE_COLOR)[]).map((s) => (
        <div
          key={s}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: STAGE_COLOR[s],
              borderRadius: 2,
            }}
          />
          <span>{STAGE_LABEL[s]}</span>
        </div>
      ))}
      <div style={{ color: "#888", margin: "8px 0 4px" }}>edges</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <svg width={22} height={6}>
          <line x1="0" y1="3" x2="22" y2="3" stroke="#666" strokeWidth="1.4" />
        </svg>
        <span>feeds p16</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <svg width={22} height={6}>
          <line
            x1="0"
            y1="3"
            x2="22"
            y2="3"
            stroke="#aaa"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
        </svg>
        <span>validation only</span>
      </div>
      <div style={{ color: "#888", margin: "8px 0 4px" }}>when highlighted</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <svg width={22} height={6}>
          <line x1="0" y1="3" x2="22" y2="3" stroke="#1850c8" strokeWidth="1.8" />
        </svg>
        <span>main (animated)</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width={22} height={6}>
          <line
            x1="0"
            y1="3"
            x2="22"
            y2="3"
            stroke="#7a4fb1"
            strokeWidth="1.8"
            strokeDasharray="6 4"
          />
        </svg>
        <span>validation (dashed)</span>
      </div>
    </div>
  );
}
