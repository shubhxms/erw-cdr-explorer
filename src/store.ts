import { create } from "zustand";
import { coneOf, coneOfEdge } from "./dag/graph";
import { NODES } from "./dag/nodes";
import type { ArrayStats, Hist } from "./types/computed";
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

  setSelected: (id: string | null) => void;
  selectEdge: (from: string, to: string) => void;
  clearSelection: () => void;

  startRun: () => void;
  cancelRun: () => void;
  setNRuns: (n: number) => void;
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
    });

    const msg: WorkerInbound = { type: "run", nRuns: get().nRuns, seed: get().seed };
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
        return { computedSet: cs, computedValues: cv };
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
