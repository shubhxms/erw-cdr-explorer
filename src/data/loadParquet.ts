import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";

const arrayCache = new Map<string, Float64Array>();

export async function loadArrayColumn(
  path: string,
  column: string,
): Promise<Float64Array> {
  const key = `${path}::${column}`;
  const hit = arrayCache.get(key);
  if (hit) return hit;

  const file = await asyncBufferFromUrl({ url: path });
  const rows = await parquetReadObjects({ file, columns: [column] });
  const out = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const v = (rows[i] as Record<string, unknown>)[column];
    out[i] = typeof v === "number" ? v : Number(v);
  }
  arrayCache.set(key, out);
  return out;
}
