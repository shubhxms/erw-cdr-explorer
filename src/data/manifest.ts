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

let cached: Manifest | null = null;
let pending: Promise<Manifest> | null = null;

export function loadManifest(): Promise<Manifest> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = fetch("/checkpoints/manifest.json")
    .then((r) => r.json())
    .then((m: Manifest) => {
      cached = m;
      return m;
    });
  return pending;
}

export function useManifest(): Manifest | null {
  const [m, setM] = useState<Manifest | null>(cached);
  useEffect(() => {
    if (!cached) loadManifest().then(setM);
  }, []);
  return m;
}
