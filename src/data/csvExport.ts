/**
 * Browser-side CSV export helpers. No deps — string concat + Blob download.
 */

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Quote when needed; double up embedded quotes.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(
  rows: Record<string, unknown>[],
  columns?: string[],
): string {
  if (rows.length === 0) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map(escapeCell).join(",");
  const body = rows
    .map((r) => cols.map((c) => escapeCell(r[c])).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

export function arrayToCsv(arr: ArrayLike<number>, columnName = "value"): string {
  const lines = new Array<string>(arr.length + 1);
  lines[0] = columnName;
  for (let i = 0; i < arr.length; i++) lines[i + 1] = String(arr[i]);
  return lines.join("\n") + "\n";
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the click has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeName(s: string): string {
  return s.replace(/[^a-z0-9_\-.]/gi, "_");
}
