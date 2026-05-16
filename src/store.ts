import { create } from "zustand";
import { coneOf, coneOfEdge } from "./dag/graph";
import { NODES } from "./dag/nodes";
import { DEFAULT_REMOVAL_ID } from "./data/removals";
import {
  buildSweepPlan,
  SWEEP_INPUTS,
  type SweepResultRow,
  type SweepSummary,
} from "./data/sensitivity";
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
  /** Active Isometric removal id (e.g. rmv_1KH3W7FMH1S0J5R9). Drives which
   *  manifest + checkpoint dir the rest of the app reads from. */
  removalId: string;

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

  /**
   * Snapshot of edits/overrides as of the last completed run — used by the
   * EditsPanel to flag "this edit hasn't been applied yet, click Run".
   * The CURRENT vs REGISTRY BASELINE comparison itself does *not* depend on
   * this — those come straight from `computedValues` (current) and
   * `manifest.entries[id].histogram` (baseline).
   */
  appliedEdits: Map<string, EditSpec>;
  appliedOverrides: Map<string, OverrideSpec>;
  /** Seed of the last completed run. null = no run finished yet. */
  appliedSeed: number | null;

  /**
   * Sensitivity sweep state. Orchestrates a sequence of single-run worker
   * calls (baseline + ±scale per input) without polluting the main canvas
   * computedSet — array/scalar/dataframe messages are discarded while
   * `sweep.status === "running"`, only `complete` (the p16) is captured.
   */
  sweep: SweepState;

  setSelected: (id: string | null) => void;
  selectEdge: (from: string, to: string) => void;
  clearSelection: () => void;

  /**
   * Switch to a different removal. Resets all run/edit/override state — the
   * comparison context (CURRENT vs REGISTRY BASELINE) only makes sense within
   * one removal at a time.
   */
  setRemovalId: (id: string) => void;

  startRun: () => void;
  cancelRun: () => void;
  setNRuns: (n: number) => void;
  setSeed: (n: number) => void;

  setEdit: (key: string, edit: EditSpec) => void;
  clearEdit: (key: string) => void;
  setOverride: (nodeId: string, override: OverrideSpec) => void;
  clearOverride: (nodeId: string) => void;
  clearAllEdits: () => void;

  /** Load a precomputed sensitivity sweep from `/checkpoints/<id>/sensitivity.json`. */
  loadPrecomputedSweep: (summary: SweepSummary) => void;
  /** Kick off a live sweep at the current N + seed (4 inputs × ±scale + baseline). */
  startSweep: (scale?: number) => void;
  cancelSweep: () => void;
}

export interface SweepState {
  status: "idle" | "running" | "done" | "error";
  /** Total worker runs in the current plan (1 baseline + 2 per input). */
  totalSteps: number;
  /** Index of step currently in flight (0-based). */
  currentStep: number;
  currentLabel: string;
  scale: number;
  nRuns: number;
  seed: number;
  baselineP16: number | null;
  /** Per-input collected p16s for plus / minus directions. */
  perInputP16: Map<string, { plus: number | null; minus: number | null }>;
  /** Final summary (set on completion or when loading precomputed). */
  summary: SweepSummary | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

function freshSweepState(): SweepState {
  return {
    status: "idle",
    totalSteps: 0,
    currentStep: 0,
    currentLabel: "",
    scale: 0.1,
    nRuns: 0,
    seed: 0,
    baselineP16: null,
    perInputP16: new Map(),
    summary: null,
    error: null,
    startedAt: null,
    finishedAt: null,
  };
}

export function editKey(e: EditSpec): string {
  if (e.kind === "column_transform") return `${e.nodeId}|${e.column}`;
  if (e.kind === "area") return `${e.nodeId}|${e.plotType}`;
  return e.nodeId;
}

let worker: Worker | null = null;

/**
 * Module-scoped sweep plan. We keep this out of the zustand state because:
 *   - It's only meaningful while a sweep is running.
 *   - It carries EditSpec arrays we don't need React subscribers reacting to.
 *   - It's read+advanced by the worker message handler, which can't easily
 *     receive store mutations atomically.
 */
let sweepPlan: ReturnType<typeof buildSweepPlan> = [];

export const useStore = create<StoreState>((set, get) => ({
  removalId: DEFAULT_REMOVAL_ID,
  selectedId: null,
  selection: { kind: "none", id: null },
  highlighted: null,

  runStatus: "idle",
  runPhase: null,
  computedSet: allComputed(),
  computedValues: new Map(),
  currentlyComputing: null,
  nRuns: 200000,
  seed: 42,
  computedP16: null,
  runDurationMs: null,
  runError: null,

  edits: new Map(),
  overrides: new Map(),
  overriddenSet: new Set(),

  appliedEdits: new Map(),
  appliedOverrides: new Map(),
  appliedSeed: null,

  sweep: freshSweepState(),

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

  setRemovalId: (id) => {
    // Stop any in-flight worker — its inputs would be from the old removal.
    if (worker) {
      worker.terminate();
      worker = null;
    }
    set({
      removalId: id,
      selectedId: null,
      selection: { kind: "none", id: null },
      highlighted: null,
      runStatus: "idle",
      runPhase: null,
      computedSet: allComputed(),
      computedValues: new Map(),
      currentlyComputing: null,
      computedP16: null,
      runDurationMs: null,
      runError: null,
      edits: new Map(),
      overrides: new Map(),
      overriddenSet: new Set(),
      appliedEdits: new Map(),
      appliedOverrides: new Map(),
      appliedSeed: null,
      sweep: freshSweepState(),
    });
    sweepPlan = [];
  },

  setNRuns: (n) => set({ nRuns: n }),
  setSeed: (n) => {
    if (!Number.isInteger(n)) return;
    set({ seed: n });
  },

  startRun: () => {
    if (!worker) {
      worker = new ChainWorker();
      worker.addEventListener("message", onWorkerMessage);
    }

    const s = get();

    set({
      runStatus: "loading",
      runPhase: "loading-pyodide",
      computedSet: new Set(),
      computedValues: new Map(),
      currentlyComputing: null,
      computedP16: null,
      runDurationMs: null,
      runError: null,
      overriddenSet: new Set(),
    });

    const msg: WorkerInbound = {
      type: "run",
      removalId: s.removalId,
      nRuns: s.nRuns,
      seed: s.seed,
      edits: [...s.edits.values()],
      overrides: [...s.overrides.values()],
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
    set({ edits: new Map(), overrides: new Map(), seed: 42 }),

  loadPrecomputedSweep: (summary) =>
    set((s) => ({ sweep: { ...s.sweep, summary, status: "done" } })),

  startSweep: (scale = 0.1) => {
    if (!worker) {
      worker = new ChainWorker();
      worker.addEventListener("message", onWorkerMessage);
    }
    const s = get();
    sweepPlan = buildSweepPlan(scale);
    set({
      sweep: {
        status: "running",
        totalSteps: sweepPlan.length,
        currentStep: 0,
        currentLabel: sweepPlan[0].inputLabel,
        scale,
        nRuns: s.nRuns,
        seed: s.seed,
        baselineP16: null,
        perInputP16: new Map(SWEEP_INPUTS.map((d) => [d.id, { plus: null, minus: null }])),
        summary: null,
        error: null,
        startedAt: Date.now(),
        finishedAt: null,
      },
    });
    postSweepStep(s.removalId, s.nRuns, s.seed, sweepPlan[0]);
  },

  cancelSweep: () => {
    if (worker) {
      worker.postMessage({ type: "abort" } satisfies WorkerInbound);
      worker.terminate();
      worker = null;
    }
    sweepPlan = [];
    set((s) => ({ sweep: { ...s.sweep, status: "idle", error: null } }));
  },
}));

/**
 * Dispatch a single sweep step as a normal worker run. The worker doesn't
 * know it's part of a sweep — sequencing happens in onWorkerMessage on the
 * `complete` event.
 */
function postSweepStep(
  removalId: string,
  nRuns: number,
  seed: number,
  step: ReturnType<typeof buildSweepPlan>[number],
) {
  if (!worker) return;
  const msg: WorkerInbound = {
    type: "run",
    removalId,
    nRuns,
    seed,
    edits: step.edits,
    overrides: [],
  };
  worker.postMessage(msg);
}

/**
 * On sweep complete: assemble the SweepSummary by joining baselineP16 +
 * collected plus/minus p16s into the row format the chart consumes.
 */
function finalizeSweep(s: StoreState): SweepState {
  const baseline = s.sweep.baselineP16 ?? 0;
  const rows: SweepResultRow[] = [];
  for (const def of SWEEP_INPUTS) {
    const pair = s.sweep.perInputP16.get(def.id);
    if (!pair || pair.plus === null || pair.minus === null) continue;
    const dp = pair.plus - baseline;
    const dm = pair.minus - baseline;
    rows.push({
      id: def.id,
      label: def.label,
      unit: def.unit,
      baselineP16: baseline,
      plusP16: pair.plus,
      minusP16: pair.minus,
      deltaPlus: dp,
      deltaMinus: dm,
      magnitude: Math.abs(dp) + Math.abs(dm),
    });
  }
  rows.sort((a, b) => b.magnitude - a.magnitude);
  const summary: SweepSummary = {
    baselineP16: baseline,
    scale: s.sweep.scale,
    nRuns: s.sweep.nRuns,
    seed: s.sweep.seed,
    computedAt: new Date().toISOString(),
    removalId: s.removalId,
    precomputed: false,
    rows,
  };
  return {
    ...s.sweep,
    status: "done",
    summary,
    finishedAt: Date.now(),
  };
}

function onWorkerMessage(e: MessageEvent<WorkerOutbound>) {
  const msg = e.data;
  const sweepRunning = useStore.getState().sweep.status === "running";
  switch (msg.type) {
    case "phase": {
      // During a sweep we suppress phase updates on the main runStatus so the
      // canvas doesn't flicker between "loading" and "running" 9 times. The
      // sweep panel surfaces its own progress label instead.
      if (sweepRunning) break;
      useStore.setState({
        runPhase: msg.phase,
        runStatus: msg.phase === "running" ? "running" : "loading",
      });
      break;
    }
    case "started": {
      if (sweepRunning) break;
      useStore.setState({ currentlyComputing: msg.nodeId });
      break;
    }
    case "array": {
      if (sweepRunning) break;
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
      if (sweepRunning) break;
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
      if (sweepRunning) break;
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
      if (sweepRunning) {
        // Capture p16 for the step that just finished, then dispatch the
        // next step (or finalize).
        const stepIdx = useStore.getState().sweep.currentStep;
        const step = sweepPlan[stepIdx];
        useStore.setState((s) => {
          const next = { ...s.sweep };
          if (step.sign === 0) {
            next.baselineP16 = msg.p16;
          } else {
            const cur = new Map(next.perInputP16);
            const slot = cur.get(step.inputId) ?? { plus: null, minus: null };
            if (step.sign === 1) slot.plus = msg.p16;
            else slot.minus = msg.p16;
            cur.set(step.inputId, slot);
            next.perInputP16 = cur;
          }
          const nextIdx = stepIdx + 1;
          if (nextIdx >= sweepPlan.length) {
            // Finalize.
            return { sweep: finalizeSweep({ ...s, sweep: next }) };
          }
          next.currentStep = nextIdx;
          next.currentLabel = sweepPlan[nextIdx].inputLabel;
          // Tail-dispatch the next worker run AFTER we yield to the event
          // loop so the state update commits first.
          queueMicrotask(() => {
            const s2 = useStore.getState();
            postSweepStep(s2.removalId, s2.sweep.nRuns, s2.sweep.seed, sweepPlan[nextIdx]);
          });
          return { sweep: next };
        });
        break;
      }
      useStore.setState((s) => ({
        runStatus: "done",
        runPhase: null,
        currentlyComputing: null,
        computedP16: msg.p16,
        runDurationMs: msg.totalMs,
        appliedEdits: new Map(s.edits),
        appliedOverrides: new Map(s.overrides),
        appliedSeed: s.seed,
      }));
      break;
    }
    case "error": {
      if (sweepRunning) {
        sweepPlan = [];
        useStore.setState((s) => ({
          sweep: { ...s.sweep, status: "error", error: msg.message },
        }));
        break;
      }
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
