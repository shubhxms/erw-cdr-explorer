# ERW CDR Checkpoint Explorer

Interactive DAG viewer for the enhanced rock weathering CDR calculation behind **Alt Carbon's Darjeeling project** on the [Isometric registry](https://registry.isometric.com/supplier/spl_1J6EQFMYF1S00KDE#issuances). Every named intermediate in the chain is a node; click any node to inspect its distribution, edit inputs, and recompute in-browser via Pyodide.

## Scope

Only the soil-bootstrap + tracer-corrected mass-balance portion of the issuance is in scope. The final issued removal applies additional steps that this explorer does **not** model:

- upstream activity emissions (flights, freight, spreading fuel, lab electricity)
- weathering losses (strong acid weathering, plant uptake, counterfactual liming)
- downstream retention (river runoff, ocean re-equilibration)

## Features

- **DAG explorer** — 71 nodes laid out by stage (inputs → cleaning → bootstrap → deployment chain → treatment chain → diagnostics → aggregation), rendered via React Flow + dagre.
- **In-browser recompute** — The full chain runs in a Web Worker via Pyodide (Python in WebAssembly) using the real `isometric_calculation_library` (v0.21.4). No server.
- **Causal edits** — Tweak feedstock columns, bulk density, plot areas, application rate, sampling depth, winsorise threshold, or zero-filter toggle.
- **Counterfactual overrides** — Pin any `[N]` array node to a fixed value (point-collapse) or recenter it (mean-shift); propagation is forward-only by design.
- **Current vs. baseline** — Each node compares this browser's freshly-computed result against the precomputed N=200k registry-matching baseline; sidebar histograms + stats tables show a Δ column.
- **Precomputed manifest** — A build-time JSON manifest (~110 KB) provides instant summary stats + 64-bin histograms for all nodes. Full arrays lazy-load from parquet on demand.

## Stack

Vite + React + TypeScript + React Router + @xyflow/react + Pyodide + hyparquet + uPlot + Zustand.

## Develop

```
npm install
npm run build-manifest -- rmv_1KH3W7FMH1S0J5R9   # builds manifest for one removal
npm run dev                                       # http://localhost:5173
```

Each removal lives under `public/checkpoints/<removalId>/` with its own
`manifest.json`. Add a new removal by dropping its `inputs/ cleaning/ … `
checkpoint tree under that path and rebuilding the manifest for that id.

## Build

```
npm run build
npm run preview
```

## Data

`public/checkpoints/<removalId>/` contains the chain's pre-baked output (parquet + JSON checkpoints) for each removal. The active removal is selected via the topbar dropdown and persisted in the `?removal=…` URL query param. To refresh data for one removal:

```
rm -rf public/checkpoints/<removalId>
cp -R ../isometric-cdr-data/checkpoints public/checkpoints/<removalId>
npm run build-manifest -- <removalId>
```

## Methodology

Tracer-corrected Total Cation Approach using Ti as the immobile tracer, with paired baseline → reporting-period bootstrap and a p50 control-correction ratio applied to each cation. Final reported metric is the 16th percentile of total CO₂ tonnes.

See `src/worker/chain.py` for the in-browser calculation and `src/dag/nodes.ts` for the DAG topology.
