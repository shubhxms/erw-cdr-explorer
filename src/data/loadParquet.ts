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

/** Load all rows + columns of a parquet file (for dataframe CSV export). */
export async function loadDataframe(
  path: string,
): Promise<Record<string, unknown>[]> {
  const file = await asyncBufferFromUrl({ url: path });
  return (await parquetReadObjects({ file })) as Record<string, unknown>[];
}
