import { create } from "zustand";
import { coneOf, coneOfEdge, descendantsOf } from "./dag/graph";
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
  edits: Map<string, EditSpec>;
  overrides: Map<string, OverrideSpec>;
  /** Subset of computedSet flagged `overridden` by the worker on the last run. */
  overriddenSet: Set<string>;

  // Cross-run memoization: previous run state for computing dirty sets.
  previousEdits: Map<string, EditSpec>;
  previousOverrides: Map<string, OverrideSpec>;
  /** Nodes whose values changed between previous run and current run. */
  dirtySet: Set<string>;
  /** Previous run's computed values, used for overlay comparison. */
  previousValues: Map<string, ComputedValue>;

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

function computeDirtySet(
  currentEdits: Map<string, EditSpec>,
  currentOverrides: Map<string, OverrideSpec>,
  previousEdits: Map<string, EditSpec>,
  previousOverrides: Map<string, OverrideSpec>,
): Set<string> {
  const dirty = new Set<string>();

  const editChanged =
    currentEdits.size !== previousEdits.size ||
    ![...currentEdits.entries()].every(([k, v]) => {
      const prev = previousEdits.get(k);
      return prev && JSON.stringify(prev) === JSON.stringify(v);
    });

  const overrideChanged =
    currentOverrides.size !== previousOverrides.size ||
    ![...currentOverrides.entries()].every(([k, v]) => {
      const prev = previousOverrides.get(k);
      return prev && JSON.stringify(prev) === JSON.stringify(v);
    });

  if (!editChanged && !overrideChanged) return dirty;

  // If any constant (scalar/toggle) changed, everything downstream of inputs is dirty.
  // Constants aren't DAG nodes so we conservatively mark everything dirty.
  const prevConstantKeys = new Set(
    [...previousEdits.entries()]
      .filter(([, e]) => e.kind === "scalar" || e.kind === "toggle")
      .map(([k]) => k),
  );
  const curConstantKeys = new Set(
    [...currentEdits.entries()]
      .filter(([, e]) => e.kind === "scalar" || e.kind === "toggle")
      .map(([k]) => k),
  );
  const anyConstantChanged =
    prevConstantKeys.size !== curConstantKeys.size ||
    [...prevConstantKeys].some((k) => {
      const cur = currentEdits.get(k);
      const prev = previousEdits.get(k);
      return !cur || !prev || JSON.stringify(cur) !== JSON.stringify(prev);
    }) ||
    [...curConstantKeys].some((k) => !prevConstantKeys.has(k));

  if (anyConstantChanged) {
    for (const n of NODES) dirty.add(n.id);
    // Still add override-dirty nodes
  }

  // Column transforms: mark the input node + all descendants dirty.
  for (const [key, edit] of currentEdits.entries()) {
    if (edit.kind === "column_transform") {
      const prev = previousEdits.get(key);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(edit)) {
        dirty.add(edit.nodeId);
        for (const d of descendantsOf(edit.nodeId)) dirty.add(d);
      }
    }
  }
  // Check removed column transforms
  for (const [key, prev] of previousEdits.entries()) {
    if (prev.kind === "column_transform" && !currentEdits.has(key)) {
      dirty.add(prev.nodeId);
      for (const d of descendantsOf(prev.nodeId)) dirty.add(d);
    }
  }

  // Area edits: mark the relevant aggregation node + descendants dirty.
  for (const [key, edit] of currentEdits.entries()) {
    if (edit.kind === "area") {
      const prev = previousEdits.get(key);
      if (!prev || prev.value !== edit.value) {
        const aggId = `aggregation/${edit.plotType}_co2_tonnes`;
        dirty.add(aggId);
        for (const d of descendantsOf(aggId)) dirty.add(d);
      }
    }
  }
  for (const [key, prev] of previousEdits.entries()) {
    if (prev.kind === "area" && !currentEdits.has(key)) {
      const aggId = `aggregation/${prev.plotType}_co2_tonnes`;
      dirty.add(aggId);
      for (const d of descendantsOf(aggId)) dirty.add(d);
    }
  }

  // Override changes: mark the node + all descendants dirty.
  for (const [nodeId, ovr] of currentOverrides.entries()) {
    const prev = previousOverrides.get(nodeId);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(ovr)) {
      dirty.add(nodeId);
      for (const d of descendantsOf(nodeId)) dirty.add(d);
    }
  }
  for (const [nodeId, prev] of previousOverrides.entries()) {
    if (!currentOverrides.has(nodeId)) {
      dirty.add(nodeId);
      for (const d of descendantsOf(nodeId)) dirty.add(d);
    }
  }

  return dirty;
}

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

  previousEdits: new Map(),
  previousOverrides: new Map(),
  dirtySet: new Set(),
  previousValues: new Map(),

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
    if (!worker) {
      worker = new ChainWorker();
      worker.addEventListener("message", onWorkerMessage);
    }

    const s = get();

    // Compute the dirty set — nodes that need recomputation.
    const dirty = computeDirtySet(s.edits, s.overrides, s.previousEdits, s.previousOverrides);

    // Skip nodes that are NOT dirty and already have cached values.
    const skipNodeIds = NODES.filter((n) => !dirty.has(n.id)).map((n) => n.id);

    // Save previous run values for overlay comparison.
    const previousValues = new Map(s.computedValues);
    // For clean nodes, carry forward their previous computed values.
    const initialValues = new Map<string, ComputedValue>();
    for (const [id, val] of s.computedValues.entries()) {
      if (!dirty.has(id)) {
        initialValues.set(id, val);
      }
    }

    // Compute initial computedSet: all non-dirty nodes are already "computed".
    const initialComputedSet = new Set<string>();
    for (const n of NODES) {
      if (!dirty.has(n.id) && s.computedSet.has(n.id)) {
        initialComputedSet.add(n.id);
      }
    }

    set({
      runStatus: "loading",
      runPhase: "loading-pyodide",
      computedSet: initialComputedSet,
      computedValues: initialValues,
      currentlyComputing: null,
      computedP16: null,
      runDurationMs: null,
      runError: null,
      overriddenSet: new Set(),
      dirtySet: dirty,
      previousValues: previousValues,
    });

    const msg: WorkerInbound = {
      type: "run",
      nRuns: s.nRuns,
      seed: s.seed,
      edits: [...s.edits.values()],
      overrides: [...s.overrides.values()],
      skipNodeIds,
    };
    worker.postMessage(msg);
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
      useStore.setState((s) => ({
        runStatus: "done",
        runPhase: null,
        currentlyComputing: null,
        computedP16: msg.p16,
        runDurationMs: msg.totalMs,
        previousEdits: new Map(s.edits),
        previousOverrides: new Map(s.overrides),
      }));
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
