import { create } from "zustand";

interface StoreState {
  selectedId: string | null;
  setSelected: (id: string | null) => void;
}

export const useStore = create<StoreState>((set) => ({
  selectedId: null,
  setSelected: (id) => set({ selectedId: id }),
}));
