# EW CDR Checkpoint Explorer

Read-only DAG viewer for the Isometric enhanced-weathering CDR calculation. Every named variable in `run_chain.py` (the sibling Python chain that mirrors Isometric's `code.py`) is a node; click a node to inspect summary stats and a histogram of its distribution.

Stack: Vite + React + TypeScript + React Router + @xyflow/react + dagre + hyparquet + uPlot + Zustand.

## Develop

```
npm install
npm run build-manifest   # one-shot, scans public/checkpoints/ and emits manifest.json
npm run dev              # http://localhost:5173
```

## Build

```
npm run build
npm run preview
```

## Data

`public/checkpoints/` is a copy of the Python chain's output. To refresh:

```
rm -rf public/checkpoints
cp -R ../isometric-cdr-data/checkpoints public/
npm run build-manifest
```

The manifest is ~110 KB and contains summary stats + a 32-bin histogram for every `[N]` array, plus row counts and column names for every DataFrame. Full arrays (each ~1.9 MB) are lazy-loaded via hyparquet when the user expands a node's "load full" button in the sidebar.

## What it isn't (yet)

This is v1 — read-only inspection only. No knobs, no edits, no cascading recompute. See `checkpoint_plan.md` in the sibling repo for the next-step interactive plan.
