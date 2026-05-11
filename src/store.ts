import { create } from "zustand";
import { coneOf, coneOfEdge } from "./dag/graph";

export interface Selection {
  kind: "node" | "edge" | "none";
  id: string | null;
  edgeFrom?: string;
  edgeTo?: string;
}

interface StoreState {
  selectedId: string | null;
  selection: Selection;
  highlighted: Set<string> | null;
  setSelected: (id: string | null) => void;
  selectEdge: (from: string, to: string) => void;
  clearSelection: () => void;
}

export const useStore = create<StoreState>((set) => ({
  selectedId: null,
  selection: { kind: "none", id: null },
  highlighted: null,
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
}));
