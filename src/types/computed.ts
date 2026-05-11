/**
 * Shared shape of the worker's per-checkpoint outputs.
 * The Python worker computes these via numpy and posts them via JSON.
 */

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

export interface Hist {
  bins: number[];
  edges: number[];
}
