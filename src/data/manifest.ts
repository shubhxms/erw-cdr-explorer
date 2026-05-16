import { useEffect, useState } from "react";

export interface ArrayStats {
  n: number;
  mean: number;
  std: number;
  p5: number;
  p16: number;
  p50: number;
  p84: number;
  p95: number;
  min: number;
  max: number;
  nan_count: number;
  inf_count: number;
}

export interface ManifestEntry {
  id: string;
  kind: "array" | "scalar" | "dataframe";
  stage: string;
  path: string;
  column?: string;
  stats?: ArrayStats;
  histogram?: { bins: number[]; edges: number[] };
  value?: number;
  row_count?: number;
  columns?: string[];
}

export interface Manifest {
  generated_at: string;
  registry_p16: number;
  computed_p16: number | null;
  total_duration_s: number | null;
  entries: Record<string, ManifestEntry>;
}

// Per-removal manifest cache. Each removal lives at
// /checkpoints/<removalId>/manifest.json; we keep one promise per id so
// switching between removals re-uses fetches across components.
const cache = new Map<string, Manifest>();
const pendingMap = new Map<string, Promise<Manifest>>();

export class ManifestUnavailableError extends Error {
  constructor(public removalId: string, public status: number) {
    super(`Manifest for ${removalId} not found (HTTP ${status}). Data not wired up yet.`);
    this.name = "ManifestUnavailableError";
  }
}

export function loadManifest(removalId: string): Promise<Manifest> {
  const cached = cache.get(removalId);
  if (cached) return Promise.resolve(cached);
  const inflight = pendingMap.get(removalId);
  if (inflight) return inflight;
  const p = fetch(`/checkpoints/${removalId}/manifest.json`)
    .then((r) => {
      if (!r.ok) throw new ManifestUnavailableError(removalId, r.status);
      return r.json();
    })
    .then((m: Manifest) => {
      cache.set(removalId, m);
      pendingMap.delete(removalId);
      return m;
    })
    .catch((e) => {
      pendingMap.delete(removalId);
      throw e;
    });
  pendingMap.set(removalId, p);
  return p;
}

export function useManifest(removalId: string): {
  manifest: Manifest | null;
  error: ManifestUnavailableError | null;
} {
  const [m, setM] = useState<Manifest | null>(cache.get(removalId) ?? null);
  const [err, setErr] = useState<ManifestUnavailableError | null>(null);
  useEffect(() => {
    const c = cache.get(removalId);
    if (c) {
      setM(c);
      setErr(null);
      return;
    }
    setM(null);
    setErr(null);
    loadManifest(removalId)
      .then((m) => setM(m))
      .catch((e) => {
        if (e instanceof ManifestUnavailableError) setErr(e);
        else setErr(new ManifestUnavailableError(removalId, 0));
      });
  }, [removalId]);
  return { manifest: m, error: err };
}
