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

export function summarise(arr: Float64Array): ArrayStats {
  const n = arr.length;
  let nan_count = 0;
  let inf_count = 0;
  const clean: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    if (Number.isNaN(v)) nan_count++;
    else if (!Number.isFinite(v)) inf_count++;
    else clean.push(v);
  }
  const m = clean.length;
  if (m === 0) {
    return {
      n, mean: NaN, std: NaN, p5: NaN, p16: NaN, p50: NaN, p84: NaN, p95: NaN,
      min: NaN, max: NaN, nan_count, inf_count,
    };
  }
  clean.sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < m; i++) sum += clean[i];
  const mean = sum / m;
  let ss = 0;
  for (let i = 0; i < m; i++) {
    const d = clean[i] - mean;
    ss += d * d;
  }
  const std = Math.sqrt(ss / m);
  const pct = (p: number) => {
    const idx = (p / 100) * (m - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return clean[lo];
    return clean[lo] + (clean[hi] - clean[lo]) * (idx - lo);
  };
  return {
    n,
    mean,
    std,
    p5: pct(5),
    p16: pct(16),
    p50: pct(50),
    p84: pct(84),
    p95: pct(95),
    min: clean[0],
    max: clean[m - 1],
    nan_count,
    inf_count,
  };
}

export function nanPercentile(arr: Float64Array, p: number): number {
  const clean: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (Number.isFinite(v)) clean.push(v);
  }
  if (clean.length === 0) return NaN;
  clean.sort((a, b) => a - b);
  const idx = (p / 100) * (clean.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return clean[lo];
  return clean[lo] + (clean[hi] - clean[lo]) * (idx - lo);
}

export function histogram(arr: Float64Array, nbins = 64): Hist {
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (!Number.isFinite(mn) || mn === mx) {
    return { bins: new Array(nbins).fill(0), edges: [mn || 0, (mx || 0) + 1] };
  }
  const bins = new Array(nbins).fill(0);
  const edges = new Array(nbins + 1);
  const step = (mx - mn) / nbins;
  for (let i = 0; i <= nbins; i++) edges[i] = mn + step * i;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    let idx = Math.floor((v - mn) / step);
    if (idx === nbins) idx = nbins - 1;
    if (idx < 0) idx = 0;
    bins[idx]++;
  }
  return { bins, edges };
}
