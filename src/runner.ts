/**
 * In-browser run animation for the EW CDR chain.
 *
 * The chain values are precomputed by the Python chain and shipped as parquet
 * — we never mutate the originals. "Running" here means revealing those values
 * in execution order so the cascade is visible step by step.
 *
 * Each node has a step number from run_chain.py. We walk nodes in step order,
 * pausing per-node by a duration loosely scaled to the real Python wall time,
 * divided by the user's speed multiplier.
 */

import { NODES, type DagNode, type Stage } from "./dag/nodes";

// Baseline per-node delay in milliseconds, scaled by node.step / stage.
// These are coarse approximations of run_log.json wall-times, compressed by
// ~10× so a full chain finishes in roughly 6 seconds at speed = 1.
const STAGE_DELAY_MS: Record<Stage, number> = {
  inputs: 0,
  cleaning: 40,
  bootstrap: 80,
  chain_deployment: 80,
  chain_treatment: 80,
  diagnostics: 60,
  aggregation: 80,
};

// Specific steps that dominated the Python chain — bump these so the cascade
// "feels" like the real timing (resamples and the initial bd bootstrap).
const HEAVY_HINTS = new Set<string>([
  "bootstrap/bd_boot",
  "bootstrap/ctl_bl_mass_fraction_ca",
  "bootstrap/ctl_rp_mass_fraction_ca",
  "bootstrap/ctl_bl_mass_fraction_mg",
  "bootstrap/ctl_rp_mass_fraction_mg",
  "chain_deployment/bl_ti",
  "chain_deployment/rp_ti",
  "chain_deployment/bl_mass_fraction_ca",
  "chain_deployment/rp_mass_fraction_ca",
  "chain_deployment/bl_mass_fraction_mg",
  "chain_deployment/rp_mass_fraction_mg",
  "chain_treatment/bl_ti",
  "chain_treatment/rp_ti",
  "chain_treatment/bl_mass_fraction_ca",
  "chain_treatment/rp_mass_fraction_ca",
  "chain_treatment/bl_mass_fraction_mg",
  "chain_treatment/rp_mass_fraction_mg",
]);

export function nodeDelayMs(node: DagNode): number {
  const base = STAGE_DELAY_MS[node.stage];
  const heavy = HEAVY_HINTS.has(node.id) ? 2.4 : 1;
  return base * heavy;
}

/** Nodes sorted by execution step; within a step, kept in declaration order. */
export const ORDERED_NODES: DagNode[] = [...NODES].sort((a, b) => a.step - b.step);

/** All input nodes — these "exist" before any run starts. */
export const INPUT_IDS: Set<string> = new Set(
  NODES.filter((n) => n.stage === "inputs").map((n) => n.id),
);

/**
 * AbortableSignal: lets callers cancel a run in flight.
 * runner.startRun() returns a handle with `abort()`.
 */
export interface RunHandle {
  abort(): void;
}

export interface RunCallbacks {
  /** Called when a node is about to begin "computing". */
  onStart(id: string): void;
  /** Called when a node has "finished" (its data is now visible). */
  onDone(id: string): void;
  /** Called once when the whole chain finishes. */
  onComplete(): void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function runChain(
  speed: number,
  cb: RunCallbacks,
): RunHandle {
  let aborted = false;
  (async () => {
    for (const node of ORDERED_NODES) {
      if (aborted) return;
      // inputs are pre-marked by the caller; skip simulating them
      if (INPUT_IDS.has(node.id)) {
        cb.onDone(node.id);
        continue;
      }
      cb.onStart(node.id);
      const delay = nodeDelayMs(node) / Math.max(speed, 0.1);
      // Always have at least one rAF tick so React paints "computing…" first.
      await sleep(Math.max(16, delay));
      if (aborted) return;
      cb.onDone(node.id);
    }
    if (!aborted) cb.onComplete();
  })();
  return {
    abort() {
      aborted = true;
    },
  };
}
