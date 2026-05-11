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

export function StatsTable({ stats }: { stats: ArrayStats }) {
  const rows: [string, number][] = [
    ["n", stats.n],
    ["mean", stats.mean],
    ["std", stats.std],
    ["min", stats.min],
    ["p5", stats.p5],
    ["p16", stats.p16],
    ["p50 (median)", stats.p50],
    ["p84", stats.p84],
    ["p95", stats.p95],
    ["max", stats.max],
    ["NaN count", stats.nan_count],
    ["inf count", stats.inf_count],
  ];
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} style={{ borderBottom: "1px solid #eee" }}>
            <td style={{ padding: "3px 6px", color: "#666" }}>{k}</td>
            <td
              style={{
                padding: "3px 6px",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmt(v)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
