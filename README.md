# EW CDR Checkpoint Explorer

Interactive DAG visualization of the Isometric enhanced-weathering CDR calculation for Alt Carbon's Darjeeling project. Every named intermediate in the calculation chain is a node — click to inspect distributions, edit inputs, and recompute in-browser.

## Features

- **DAG Explorer** — 55 nodes across 7 stages (inputs, cleaning, bootstrap, deployment chain, treatment chain, diagnostics, aggregation), laid out with dagre and rendered via React Flow.
- **In-browser Recomputation** — The full CDR chain runs in a Web Worker using Pyodide (Python/WASM) with the real `isometric_calculation_library`. No server required.
- **Incremental Memoization** — On re-run, only nodes downstream of your edits are recalculated. Unaffected nodes reuse cached Python arrays instantly.
- **Causal Edits** — Modify feedstock columns, bulk density, plot areas, or chain constants (application rate, sampling depth, winsorise threshold, zero filter). Changes propagate naturally through the DAG.
- **Counterfactual Overrides** — Pin any intermediate array node to a chosen value (point-collapse or mean-shift) and observe the forward-only impact on downstream nodes.
- **Change Overlay** — When values change, the previous run's distribution is shown as a translucent overlay on affected nodes and in the sidebar histogram/stats table, so you can compare before and after.
- **Precomputed Manifest** — A build-time manifest (~110 KB) provides instant summary stats and 64-bin histograms for all nodes. Full arrays are lazy-loaded from parquet on demand.

## Stack

Vite + React + TypeScript + React Router + @xyflow/react + dagre + Pyodide + hyparquet + uPlot + Zustand

## Develop

```
npm install
npm run build-manifest   # one-shot: scans public/checkpoints/ → manifest.json
npm run dev              # http://localhost:5173
```

## Build

```
npm run build
npm run preview
```

## Data

`public/checkpoints/` contains the Python chain's output. To refresh from a sibling data directory:

```
rm -rf public/checkpoints
cp -R ../isometric-cdr-data/checkpoints public/
npm run build-manifest
```

## Chain Methodology

Tracer-corrected Total Cation Approach using titanium as the immobile tracer, with paired baseline-to-reporting-period bootstrap and a p50 control-correction ratio. The final reported metric is p16 (16th percentile of total CO₂ tonnes) = 4,704 tonnes.

See `src/worker/chain.py` for the full calculation port and `src/dag/nodes.ts` for the DAG structure.
