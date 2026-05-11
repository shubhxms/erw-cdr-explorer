import { create } from "zustand";
import { coneOf, coneOfEdge } from "./dag/graph";
import { NODES } from "./dag/nodes";
import type { ArrayStats, Hist } from "./types/computed";
import type { EditSpec, OverrideSpec } from "./types/edits";
import ChainWorker from "./worker/chainWorker?worker";
import type { WorkerInbound, WorkerOutbound } from "./worker/chainWorker";

const ALL_IDS: Set<string> = new Set(NODES.map((n) => n.id));
const allComputed = (): Set<string> => new Set(ALL_IDS);

export interface Selection {
  kind: "node" | "edge" | "none";
  id: string | null;
  edgeFrom?: string;
  edgeTo?: string;
}

export type RunStatus = "idle" | "loading" | "running" | "done" | "error";
export type RunPhase =
  | "loading-pyodide"
  | "loading-packages"
  | "installing-library"
  | "fetching-inputs"
  | "running"
  | null;

export type ComputedValue =
  | { kind: "array"; stats: ArrayStats; histogram: Hist; durationMs: number }
  | { kind: "scalar"; value: number; durationMs: number }
  | { kind: "dataframe"; rowCount: number; columns: string[]; durationMs: number };

interface StoreState {
  selectedId: string | null;
  selection: Selection;
  highlighted: Set<string> | null;

  runStatus: RunStatus;
  runPhase: RunPhase;
  computedSet: Set<string>;
  computedValues: Map<string, ComputedValue>;
  currentlyComputing: string | null;
  nRuns: number;
  seed: number;
  computedP16: number | null;
  runDurationMs: number | null;
  runError: string | null;

  // Phase 5: edits + overrides. Both are batched until the next run.
  // `editKey` is the EditSpec.nodeId for scalars/toggles/area, or
  //   `${nodeId}|${column}` for column transforms (so per-column edits
  //   on a single DataFrame can coexist).
  edits: Map<string, EditSpec>;
  overrides: Map<string, OverrideSpec>;
  /** Subset of computedSet flagged `overridden` by the worker on the last run. */
  overriddenSet: Set<string>;

  setSelected: (id: string | null) => void;
  selectEdge: (from: string, to: string) => void;
  clearSelection: () => void;

  startRun: () => void;
  cancelRun: () => void;
  setNRuns: (n: number) => void;

  setEdit: (key: string, edit: EditSpec) => void;
  clearEdit: (key: string) => void;
  setOverride: (nodeId: string, override: OverrideSpec) => void;
  clearOverride: (nodeId: string) => void;
  clearAllEdits: () => void;
}

export function editKey(e: EditSpec): string {
  if (e.kind === "column_transform") return `${e.nodeId}|${e.column}`;
  if (e.kind === "area") return `${e.nodeId}|${e.plotType}`;
  return e.nodeId;
}

let worker: Worker | null = null;

export const useStore = create<StoreState>((set, get) => ({
  selectedId: null,
  selection: { kind: "none", id: null },
  highlighted: null,

  runStatus: "idle",
  runPhase: null,
  computedSet: allComputed(),
  computedValues: new Map(),
  currentlyComputing: null,
  nRuns: 10000,
  seed: 42,
  computedP16: null,
  runDurationMs: null,
  runError: null,

  edits: new Map(),
  overrides: new Map(),
  overriddenSet: new Set(),

  setSelected: (id) =>
    set(
      id == null
        ? { selectedId: null, selection: { kind: "none", id: null }, highlighted: null }
        : { selectedId: id, selection: { kind: "node", id }, highlighted: coneOf(id) },
    ),
  selectEdge: (from, to) =>
    set({
      selectedId: null,
      selection: { kind: "edge", id: `${from}->${to}`, edgeFrom: from, edgeTo: to },
      highlighted: coneOfEdge(from, to),
    }),
  clearSelection: () =>
    set({ selectedId: null, selection: { kind: "none", id: null }, highlighted: null }),

  setNRuns: (n) => set({ nRuns: n }),

  startRun: () => {
    worker?.terminate();
    const w = new ChainWorker();
    w.addEventListener("message", onWorkerMessage);
    worker = w;

    set({
      runStatus: "loading",
      runPhase: "loading-pyodide",
      computedSet: new Set<string>(),
      computedValues: new Map(),
      currentlyComputing: null,
      computedP16: null,
      runDurationMs: null,
      runError: null,
      overriddenSet: new Set<string>(),
    });

    const s = get();
    const msg: WorkerInbound = {
      type: "run",
      nRuns: s.nRuns,
      seed: s.seed,
      edits: [...s.edits.values()],
      overrides: [...s.overrides.values()],
    };
    w.postMessage(msg);
  },
  cancelRun: () => {
    if (worker) {
      const msg: WorkerInbound = { type: "abort" };
      worker.postMessage(msg);
      worker.terminate();
      worker = null;
    }
    set({
      runStatus: "idle",
      runPhase: null,
      computedSet: allComputed(),
      computedValues: new Map(),
      currentlyComputing: null,
    });
  },

  setEdit: (key, edit) =>
    set((s) => {
      const m = new Map(s.edits);
      m.set(key, edit);
      return { edits: m };
    }),
  clearEdit: (key) =>
    set((s) => {
      const m = new Map(s.edits);
      m.delete(key);
      return { edits: m };
    }),
  setOverride: (nodeId, override) =>
    set((s) => {
      const m = new Map(s.overrides);
      m.set(nodeId, override);
      return { overrides: m };
    }),
  clearOverride: (nodeId) =>
    set((s) => {
      const m = new Map(s.overrides);
      m.delete(nodeId);
      return { overrides: m };
    }),
  clearAllEdits: () =>
    set({ edits: new Map(), overrides: new Map() }),
}));

function onWorkerMessage(e: MessageEvent<WorkerOutbound>) {
  const msg = e.data;
  switch (msg.type) {
    case "phase": {
      useStore.setState({
        runPhase: msg.phase,
        runStatus: msg.phase === "running" ? "running" : "loading",
      });
      break;
    }
    case "started": {
      useStore.setState({ currentlyComputing: msg.nodeId });
      break;
    }
    case "array": {
      useStore.setState((s) => {
        const cs = new Set(s.computedSet);
        cs.add(msg.nodeId);
        const cv = new Map(s.computedValues);
        cv.set(msg.nodeId, {
          kind: "array",
          stats: msg.stats,
          histogram: msg.histogram,
          durationMs: msg.durationMs,
        });
        const next: Partial<StoreState> = { computedSet: cs, computedValues: cv };
        if (msg.overridden) {
          const os = new Set(s.overriddenSet);
          os.add(msg.nodeId);
          next.overriddenSet = os;
        }
        return next;
      });
      break;
    }
    case "scalar": {
      useStore.setState((s) => {
        const cs = new Set(s.computedSet);
        cs.add(msg.nodeId);
        const cv = new Map(s.computedValues);
        cv.set(msg.nodeId, {
          kind: "scalar",
          value: msg.value,
          durationMs: msg.durationMs,
        });
        const extras = msg.nodeId === "aggregation/p16" ? { computedP16: msg.value } : {};
        return { computedSet: cs, computedValues: cv, ...extras };
      });
      break;
    }
    case "dataframe": {
      useStore.setState((s) => {
        const cs = new Set(s.computedSet);
        cs.add(msg.nodeId);
        const cv = new Map(s.computedValues);
        cv.set(msg.nodeId, {
          kind: "dataframe",
          rowCount: msg.rowCount,
          columns: msg.columns,
          durationMs: msg.durationMs,
        });
        return { computedSet: cs, computedValues: cv };
      });
      break;
    }
    case "complete": {
      useStore.setState({
        runStatus: "done",
        runPhase: null,
        currentlyComputing: null,
        computedP16: msg.p16,
        runDurationMs: msg.totalMs,
      });
      break;
    }
    case "error": {
      useStore.setState({
        runStatus: "error",
        runPhase: null,
        runError: msg.message,
        currentlyComputing: null,
      });
      break;
    }
  }
}
