import type { ArrayStats } from "../data/manifest";

function fmt(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e6 || a < 1e-3) return v.toExponential(3);
  if (a >= 100) return v.toFixed(2);
  if (a >= 1) return v.toFixed(4);
  return v.toFixed(6);
}

function deltaFmt(cur: number | undefined, base: number | undefined): string | null {
  if (cur === undefined || base === undefined) return null;
  if (!Number.isFinite(cur) || !Number.isFinite(base)) return null;
  const d = cur - base;
  if (d === 0) return null;
  return `${d >= 0 ? "+" : ""}${fmt(d)}`;
}

const thStyle: React.CSSProperties = {
  padding: "4px 6px 2px",
  fontSize: 10,
  fontWeight: 600,
  textAlign: "left",
  color: "#888",
  borderBottom: "2px solid #ddd",
  letterSpacing: 0.3,
};

const tdLabel: React.CSSProperties = {
  padding: "3px 6px",
  color: "#666",
  whiteSpace: "nowrap",
};

const tdNum: React.CSSProperties = {
  padding: "3px 6px",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const CURRENT_COLOR = "#1850c8";
const BASELINE_COLOR = "#888";

/**
 * Stat comparison table. `current` = computed-in-this-browser values;
 * `baseline` = registry-aligned manifest values. Either can be omitted —
 * if both are present we render CURRENT, REGISTRY BASELINE, Δ columns.
 */
export function StatsTable({
  current,
  baseline,
}: {
  current?: ArrayStats;
  baseline?: ArrayStats;
}) {
  const stats: (keyof ArrayStats)[] = [
    "n",
    "mean",
    "std",
    "min",
    "p5",
    "p16",
    "p50",
    "p84",
    "p95",
    "max",
    "nan_count",
    "inf_count",
  ];
  const labels: Record<string, string> = {
    p50: "p50 (median)",
    nan_count: "NaN count",
    inf_count: "inf count",
  };
  const showCurrent = !!current;
  const showBaseline = !!baseline;
  const showDelta = showCurrent && showBaseline;

  return (
    <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
      <thead>
        <tr>
          <th style={thStyle}>stat</th>
          {showCurrent && (
            <th style={{ ...thStyle, textAlign: "right", color: CURRENT_COLOR }}>
              CURRENT
            </th>
          )}
          {showBaseline && (
            <th style={{ ...thStyle, textAlign: "right", color: BASELINE_COLOR }}>
              REGISTRY BASELINE
            </th>
          )}
          {showDelta && <th style={{ ...thStyle, textAlign: "right" }}>Δ</th>}
        </tr>
      </thead>
      <tbody>
        {stats.map((k) => {
          const cur = current?.[k];
          const base = baseline?.[k];
          const delta = showDelta ? deltaFmt(cur, base) : null;
          return (
            <tr key={k} style={{ borderBottom: "1px solid #eee" }}>
              <td style={tdLabel}>{labels[k] ?? k}</td>
              {showCurrent && (
                <td style={{ ...tdNum, color: CURRENT_COLOR, fontWeight: 600 }}>
                  {fmt(cur)}
                </td>
              )}
              {showBaseline && (
                <td style={{ ...tdNum, color: BASELINE_COLOR }}>{fmt(base)}</td>
              )}
              {showDelta && (
                <td
                  style={{
                    ...tdNum,
                    color: delta ? "#444" : "#ccc",
                    fontSize: 11,
                  }}
                >
                  {delta ?? "—"}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
