import { create } from "zustand";
import { coneOf, coneOfEdge } from "./dag/graph";
import { runChain, type RunHandle, INPUT_IDS } from "./runner";
import { NODES } from "./dag/nodes";

const ALL_IDS: Set<string> = new Set(NODES.map((n) => n.id));
const allComputed = (): Set<string> => new Set(ALL_IDS);

export interface Selection {
  kind: "node" | "edge" | "none";
  id: string | null;
  edgeFrom?: string;
  edgeTo?: string;
}

export type RunStatus = "idle" | "running" | "done";

interface StoreState {
  // selection / highlight
  selectedId: string | null;
  selection: Selection;
  highlighted: Set<string> | null;
  // run state
  runStatus: RunStatus;
  computedSet: Set<string>;
  currentlyComputing: string | null;
  speed: number;
  // actions
  setSelected: (id: string | null) => void;
  selectEdge: (from: string, to: string) => void;
  clearSelection: () => void;
  startRun: () => void;
  cancelRun: () => void;
  resetRun: () => void;
  setSpeed: (s: number) => void;
}

let currentRun: RunHandle | null = null;

export const useStore = create<StoreState>((set, get) => ({
  selectedId: null,
  selection: { kind: "none", id: null },
  highlighted: null,
  // before any run starts, all nodes are considered "computed" — the data is
  // already on disk. The "Run" button blanks this and replays.
  runStatus: "idle",
  computedSet: allComputed(),
  currentlyComputing: null,
  speed: 1,

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

  startRun: () => {
    currentRun?.abort();
    set({
      runStatus: "running",
      computedSet: new Set<string>(INPUT_IDS),
      currentlyComputing: null,
    });
    currentRun = runChain(get().speed, {
      onStart: (id) => set({ currentlyComputing: id }),
      onDone: (id) =>
        set((s) => {
          const next = new Set(s.computedSet);
          next.add(id);
          return { computedSet: next };
        }),
      onComplete: () => set({ runStatus: "done", currentlyComputing: null }),
    });
  },
  cancelRun: () => {
    currentRun?.abort();
    currentRun = null;
    set({ runStatus: "idle", computedSet: allComputed(), currentlyComputing: null });
  },
  resetRun: () => {
    currentRun?.abort();
    currentRun = null;
    set({ runStatus: "idle", computedSet: allComputed(), currentlyComputing: null });
  },
  setSpeed: (s) => set({ speed: s }),
}));
