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

function deltaFmt(cur: number, prev: number | undefined): string | null {
  if (prev === undefined || !Number.isFinite(prev) || !Number.isFinite(cur)) return null;
  const d = cur - prev;
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

// Matches the chart bar colors so the table reads "this column is the
// same series as that chart". current = brand blue accent; original = muted.
const CURRENT_COLOR = "#1850c8";
const ORIGINAL_COLOR = "#888";

export function StatsTable({ stats, previous }: { stats: ArrayStats; previous?: ArrayStats }) {
  const rows: [string, number, number | undefined][] = [
    ["n", stats.n, previous?.n],
    ["mean", stats.mean, previous?.mean],
    ["std", stats.std, previous?.std],
    ["min", stats.min, previous?.min],
    ["p5", stats.p5, previous?.p5],
    ["p16", stats.p16, previous?.p16],
    ["p50 (median)", stats.p50, previous?.p50],
    ["p84", stats.p84, previous?.p84],
    ["p95", stats.p95, previous?.p95],
    ["max", stats.max, previous?.max],
    ["NaN count", stats.nan_count, previous?.nan_count],
    ["inf count", stats.inf_count, previous?.inf_count],
  ];
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
      <thead>
        <tr>
          <th style={thStyle}>stat</th>
          <th
            style={{
              ...thStyle,
              textAlign: "right",
              color: CURRENT_COLOR,
              letterSpacing: 0.3,
            }}
          >
            CURRENT
          </th>
          {previous && (
            <th
              style={{
                ...thStyle,
                textAlign: "right",
                color: ORIGINAL_COLOR,
                letterSpacing: 0.3,
              }}
            >
              ORIGINAL
            </th>
          )}
          {previous && <th style={{ ...thStyle, textAlign: "right" }}>Δ</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, v, prev]) => {
          const delta = previous ? deltaFmt(v, prev) : null;
          return (
            <tr key={k} style={{ borderBottom: "1px solid #eee" }}>
              <td style={tdLabel}>{k}</td>
              <td style={{ ...tdNum, color: CURRENT_COLOR, fontWeight: 600 }}>{fmt(v)}</td>
              {previous && (
                <td style={{ ...tdNum, color: ORIGINAL_COLOR }}>{fmt(prev)}</td>
              )}
              {previous && (
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
