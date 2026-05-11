/// <reference lib="webworker" />
/**
 * Pyodide-backed chain worker.
 *
 * Loads Pyodide from the jsdelivr CDN, installs the real
 * `isometric_calculation_library==0.21.4` (with `deps=False` to skip its
 * numpy==2.4.3 pin — Pyodide's 2.2.5 is binary compatible), stubs the
 * geopandas/shapely import surface, then runs chain.py.
 *
 * The Python side calls back into JS via the `bridge` module we register,
 * posting one message per checkpoint with the same shape that the previous
 * JS worker used — so the store and components require no changes.
 */

import type { ArrayStats, Hist } from "../types/computed";
import type { EditSpec, OverrideSpec } from "../types/edits";
import chainPySrc from "./chain.py?raw";

const PYODIDE_VERSION = "0.29.4";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const LIBRARY_VERSION = "0.21.4";

export type WorkerInbound =
  | {
      type: "run";
      nRuns: number;
      seed: number;
      edits?: EditSpec[];
      overrides?: OverrideSpec[];
    }
  | { type: "abort" };

export type WorkerOutbound =
  | { type: "phase"; phase: "loading-pyodide" | "loading-packages" | "installing-library" | "fetching-inputs" | "running"; message?: string }
  | { type: "started"; nodeId: string }
  | {
      type: "array";
      nodeId: string;
      stats: ArrayStats;
      histogram: Hist;
      durationMs: number;
      overridden?: boolean;
    }
  | { type: "scalar"; nodeId: string; value: number; durationMs: number }
  | { type: "dataframe"; nodeId: string; rowCount: number; columns: string[]; durationMs: number }
  | { type: "complete"; p16: number; totalMs: number }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let abortFlag = false;
let pyodide: any = null;

// ---------------------------------------------------------------------------
// Pyodide setup (one-shot, cached for subsequent runs in the same worker)
// ---------------------------------------------------------------------------

async function ensurePyodide(): Promise<any> {
  if (pyodide) return pyodide;

  post({ type: "phase", phase: "loading-pyodide" });
  // Dynamic import of the ESM build straight from the CDN. Vite leaves this
  // alone (it's a runtime URL, not an asset to bundle).
  const url = `${PYODIDE_CDN}pyodide.mjs`;
  // dynamic remote import; types unavailable, cast through unknown
  const mod = (await import(/* @vite-ignore */ url)) as unknown as {
    loadPyodide: (opts: { indexURL: string }) => Promise<any>;
  };
  pyodide = await mod.loadPyodide({ indexURL: PYODIDE_CDN });

  post({ type: "phase", phase: "loading-packages" });
  await pyodide.loadPackage(["numpy", "pandas", "scipy", "micropip", "pyarrow"]);

  post({ type: "phase", phase: "installing-library" });
  await pyodide.runPythonAsync(`
import sys, types

class _AutoStub(types.ModuleType):
    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        cls = type(name, (), {})
        cls.__module__ = self.__name__
        setattr(self, name, cls)
        return cls

for _name in [
    "geopandas",
    "shapely",
    "shapely.geometry",
    "shapely.ops",
    "shapely.geometry.base",
    "fiona",
    "fiona.collection",
    "pyproj",
    "pyproj.crs",
    "rtree",
]:
    if _name not in sys.modules:
        sys.modules[_name] = _AutoStub(_name)

import micropip
await micropip.install("isometric_calculation_library==${LIBRARY_VERSION}", deps=False)
`);

  // Register the JS-side bridge that chain.py uses to post messages.
  pyodide.registerJsModule("bridge", {
    send(jsonStr: string) {
      try {
        ctx.postMessage(JSON.parse(jsonStr));
      } catch (e) {
        ctx.postMessage({ type: "error", message: `bridge JSON parse: ${(e as Error).message}` });
      }
    },
    checkAbort() {
      return abortFlag;
    },
  });

  return pyodide;
}

// ---------------------------------------------------------------------------
// Inputs: fetch + push to Pyodide FS
// ---------------------------------------------------------------------------

const INPUT_FILES = [
  "raw_samples.parquet",
  "feedstock_samples.parquet",
  "bulk_density_samples.parquet",
  "area_hectares.parquet",
];

async function loadInputs() {
  post({ type: "phase", phase: "fetching-inputs" });
  pyodide.FS.mkdirTree("/inputs");
  for (const name of INPUT_FILES) {
    const r = await fetch(`/checkpoints/inputs/${name}`);
    if (!r.ok) throw new Error(`fetch ${name} → HTTP ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer());
    pyodide.FS.writeFile(`/inputs/${name}`, buf);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function run(
  nRuns: number,
  seed: number,
  edits: EditSpec[],
  overrides: OverrideSpec[],
) {
  abortFlag = false;
  try {
    await ensurePyodide();
    await loadInputs();
    post({ type: "phase", phase: "running" });

    pyodide.globals.set("N_RUNS", nRuns);
    pyodide.globals.set("SEED", seed);
    pyodide.globals.set("EDITS_JSON", JSON.stringify(edits));
    pyodide.globals.set("OVERRIDES_JSON", JSON.stringify(overrides));
    pyodide.FS.writeFile("/chain.py", chainPySrc);
    await pyodide.runPythonAsync(`
import importlib, sys
if "chain" in sys.modules:
    del sys.modules["chain"]
sys.path.insert(0, "/")
import chain
chain.main(N_RUNS, SEED, EDITS_JSON, OVERRIDES_JSON)
`);
  } catch (e) {
    if (!abortFlag) {
      post({ type: "error", message: (e as Error)?.message ?? String(e) });
    }
  }
}

function post(msg: WorkerOutbound) {
  ctx.postMessage(msg);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

ctx.addEventListener("message", (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data;
  if (msg.type === "abort") {
    abortFlag = true;
    return;
  }
  if (msg.type === "run") {
    void run(msg.nRuns, msg.seed, msg.edits ?? [], msg.overrides ?? []);
  }
});
