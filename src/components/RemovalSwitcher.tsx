/**
 * Topbar dropdown for switching between Alt Carbon's published removals.
 * Each issuance is rendered as a group header; removals appear as clickable
 * rows underneath. Unavailable removals (no data wired yet) are shown
 * disabled with a "soon" badge.
 */

import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import {
  ISSUANCES,
  REMOVAL_BY_ID,
  issuanceForRemoval,
  type Removal,
} from "../data/removals";

function fmtCredits(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function RemovalSwitcher() {
  const removalId = useStore((s) => s.removalId);
  const setRemovalId = useStore((s) => s.setRemovalId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = REMOVAL_BY_ID[removalId];
  const activeIssuance = issuanceForRemoval(removalId);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pick(r: Removal) {
    if (!r.available) return;
    setRemovalId(r.id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: "relative", fontSize: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          whiteSpace: "nowrap",
          background: open ? "#f3f3f3" : "transparent",
          border: "1px solid #ddd",
          borderRadius: 4,
          padding: "4px 8px",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          color: "#222",
          maxWidth: 520,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <span style={{ color: "#222", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
          {activeIssuance?.title ?? active?.id ?? "—"}
        </span>
        <span style={{ color: "#666", fontVariantNumeric: "tabular-nums" }}>
          {active ? `${fmtCredits(active.credits)} tCO₂e` : ""}
        </span>
        <span style={{ color: "#888" }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 4,
            boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
            minWidth: 460,
            maxHeight: 480,
            overflowY: "auto",
            zIndex: 100,
            padding: 6,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {ISSUANCES.flatMap((iss, idx) => {
            // Hide removals whose checkpoint data isn't wired up yet — and
            // hide their parent issuance entirely if it has zero available
            // tranches. Keeps the dropdown to a clean list of clickable
            // items only.
            const visible = iss.removals.filter((r) => r.available);
            if (visible.length === 0) return [];
            return [
              <div key={idx} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "6px 8px 4px",
                    borderBottom: "1px solid #eee",
                    marginBottom: 2,
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#222", fontSize: 12 }}>
                    {iss.title}
                  </span>
                  <span style={{ color: "#888", fontSize: 10 }}>
                    {fmtDate(iss.issueDate)} · {fmtCredits(iss.issued)} tCO₂e issued
                  </span>
                </div>
                {visible.map((r) => {
                  const isActive = r.id === removalId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => pick(r)}
                      style={{
                        display: "flex",
                        width: "100%",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        background: isActive ? "#eef3ff" : "transparent",
                        border: "none",
                        borderLeft: isActive ? "3px solid #1850c8" : "3px solid transparent",
                        borderRadius: 2,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: 12,
                        color: "#222",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <code style={{ fontSize: 11, color: "#444" }}>{r.id}</code>
                        <span style={{ fontSize: 10, color: "#888" }}>
                          {fmtCredits(r.credits)} tCO₂e supplier allocation
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>,
            ];
          })}
        </div>
      )}
    </div>
  );
}
