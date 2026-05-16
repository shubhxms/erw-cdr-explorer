/**
 * Manual column-per-stage layout.
 *
 * Replaces dagre's automatic node positioning with a deterministic columnar
 * arrangement: nodes within a stage are sorted by execution step (with file
 * order as the stable tiebreaker, which keeps the Ti / Ca / Mg sub-pipelines
 * contiguous in chain_deployment + chain_treatment instead of interleaved).
 *
 * Sub-stages that share a column are stacked top-to-bottom into bands:
 *   col 3: chain_deployment on top, chain_treatment below
 *   col 4: aggregation on top, diagnostics below
 *
 * Edges keep the handle-slot routing built further down — only the node
 * positions are computed here.
 */

import type { Edge, Node } from "@xyflow/react";
import { NODES, type Stage, type DagNode } from "../dag/nodes";
import { EDGES } from "../dag/edges";
import { HANDLE_COUNT, type CheckpointNodeData } from "./CheckpointNode";

const NODE_W = 220;
const NODE_H = 84;
const COL_GAP = 380; // horizontal distance between columns (center-to-center)
const ROW_GAP = 96; // vertical pitch within a column band (top-edge to top-edge)
const BAND_GAP = 80; // extra vertical padding between bands sharing a column

const COL_X: Record<Stage, number> = {
  inputs: 0,
  cleaning: 1 * COL_GAP,
  bootstrap: 2 * COL_GAP,
  chain_deployment: 3 * COL_GAP,
  chain_treatment: 3 * COL_GAP,
  aggregation: 4 * COL_GAP,
  diagnostics: 4 * COL_GAP,
};

/**
 * Bands within a column. Stages listed top-to-bottom in their visual order.
 * Stages not listed here get their own dedicated column band at y = 0.
 */
const COLUMN_BANDS: Stage[][] = [
  ["chain_deployment", "chain_treatment"],
  ["aggregation", "diagnostics"],
];

export interface LayoutResult {
  nodes: Node<CheckpointNodeData>[];
  edges: Edge[];
}

export function computeLayout(): LayoutResult {
  // Bucket nodes by stage, preserving file order from nodes.ts. We deliberately
  // do NOT sort by `step` here — file order is a hand-curated grouping that
  // keeps Ca and Mg pipelines visually contiguous in chain_deployment +
  // chain_treatment, instead of interleaving them per step.
  const byStage: Map<Stage, DagNode[]> = new Map();
  for (const n of NODES) {
    const arr = byStage.get(n.stage) ?? [];
    arr.push(n);
    byStage.set(n.stage, arr);
  }

  // Assign y positions per stage. Stages sharing a column get stacked.
  const positions = new Map<string, { x: number; y: number }>();
  const stagesInBand = new Set<Stage>();
  for (const band of COLUMN_BANDS) {
    let y = 0;
    for (const stage of band) {
      stagesInBand.add(stage);
      const nodes = byStage.get(stage) ?? [];
      for (const n of nodes) {
        positions.set(n.id, { x: COL_X[stage], y });
        y += ROW_GAP;
      }
      y += BAND_GAP; // padding between stacked sub-stages
    }
  }
  // Stages not in any band: laid out as a single band starting at y = 0.
  for (const [stage, nodes] of byStage) {
    if (stagesInBand.has(stage)) continue;
    let y = 0;
    for (const n of nodes) {
      positions.set(n.id, { x: COL_X[stage], y });
      y += ROW_GAP;
    }
  }

  // Centre all columns vertically against the tallest one — keeps short
  // columns (inputs, cleaning) from floating at the top while long ones
  // (bootstrap, chain) extend far below.
  const colHeights = new Map<number, number>();
  for (const [, pos] of positions) {
    const cur = colHeights.get(pos.x) ?? 0;
    if (pos.y > cur) colHeights.set(pos.x, pos.y);
  }
  const maxColHeight = Math.max(...colHeights.values(), 0);
  for (const [id, pos] of positions) {
    const colH = colHeights.get(pos.x) ?? 0;
    const offset = (maxColHeight - colH) / 2;
    positions.set(id, { x: pos.x, y: pos.y + offset });
  }

  const nodes: Node<CheckpointNodeData>[] = NODES.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    return {
      id: n.id,
      type: "checkpoint",
      position: { x: pos.x, y: pos.y },
      data: { id: n.id, label: n.label, stage: n.stage, description: n.description, unit: n.unit },
      width: NODE_W,
      height: NODE_H,
      selectable: true,
      draggable: false,
    };
  });

  // Helper used by edge routing below. We need each node's center-y for
  // sorting outgoing/incoming edges by neighbour position.
  function centerY(id: string): number {
    const p = positions.get(id);
    return p ? p.y + NODE_H / 2 : 0;
  }

  // ---- Handle-slot assignment ------------------------------------------
  // Each node has HANDLE_COUNT invisible handles per side. Each edge is
  // assigned to a specific source slot + target slot so edges leave/enter
  // the node at distinct y positions instead of stacking on the center.
  //
  // Main vs diagnostic edges are routed through DIFFERENT slot pools:
  //   main → CENTER_SLOTS  (middle band of handles)
  //   diag → OUTER_SLOTS   (top + bottom extremes)
  // This keeps the dotted "validation" lines from visually overlapping the
  // solid "feeds p16" lines — they take separate corridors out of each node.

  // For HANDLE_COUNT=9 → slots 0..8:
  //   CENTER_SLOTS = [2, 3, 4, 5, 6]
  //   OUTER_SLOTS  = [0, 1, 7, 8]
  const allSlots = Array.from({ length: HANDLE_COUNT }, (_, i) => i);
  const mid = Math.floor(HANDLE_COUNT / 2);
  const centerWidth = Math.max(3, Math.floor(HANDLE_COUNT * 0.55));
  const centerStart = mid - Math.floor(centerWidth / 2);
  const CENTER_SLOTS = allSlots.slice(centerStart, centerStart + centerWidth);
  const OUTER_SLOTS = allSlots.filter((s) => !CENTER_SLOTS.includes(s));

  function pickSlot(pool: number[], k: number, n: number): number {
    if (n <= 1) return pool[Math.floor(pool.length / 2)];
    const idx = Math.round((k / (n - 1)) * (pool.length - 1));
    return pool[idx];
  }

  type PositionedEdge = typeof EDGES[number] & {
    fromY: number;
    toY: number;
    origIdx: number;
  };
  const positioned: PositionedEdge[] = EDGES.filter(
    (e) => positions.has(e.from) && positions.has(e.to),
  ).map((e, i) => ({
    ...e,
    fromY: centerY(e.from),
    toY: centerY(e.to),
    origIdx: i,
  }));

  // Per source node, per edge kind: sort by target y, assign source slot.
  const outBuckets = new Map<string, { main: PositionedEdge[]; diag: PositionedEdge[] }>();
  for (const e of positioned) {
    const b = outBuckets.get(e.from) ?? { main: [], diag: [] };
    if (e.kind === "diagnostic") b.diag.push(e);
    else b.main.push(e);
    outBuckets.set(e.from, b);
  }
  const srcSlot = new Map<number, number>();
  for (const [, b] of outBuckets) {
    b.main.sort((a, b) => a.toY - b.toY);
    b.main.forEach((e, k) =>
      srcSlot.set(e.origIdx, pickSlot(CENTER_SLOTS, k, b.main.length)),
    );
    b.diag.sort((a, b) => a.toY - b.toY);
    b.diag.forEach((e, k) =>
      srcSlot.set(e.origIdx, pickSlot(OUTER_SLOTS, k, b.diag.length)),
    );
  }

  // Per target node, per kind: sort by source y, assign target slot.
  const inBuckets = new Map<string, { main: PositionedEdge[]; diag: PositionedEdge[] }>();
  for (const e of positioned) {
    const b = inBuckets.get(e.to) ?? { main: [], diag: [] };
    if (e.kind === "diagnostic") b.diag.push(e);
    else b.main.push(e);
    inBuckets.set(e.to, b);
  }
  const tgtSlot = new Map<number, number>();
  for (const [, b] of inBuckets) {
    b.main.sort((a, b) => a.fromY - b.fromY);
    b.main.forEach((e, k) =>
      tgtSlot.set(e.origIdx, pickSlot(CENTER_SLOTS, k, b.main.length)),
    );
    b.diag.sort((a, b) => a.fromY - b.fromY);
    b.diag.forEach((e, k) =>
      tgtSlot.set(e.origIdx, pickSlot(OUTER_SLOTS, k, b.diag.length)),
    );
  }

  const edges: Edge[] = positioned.map((e) => {
    const s = srcSlot.get(e.origIdx) ?? mid;
    const t = tgtSlot.get(e.origIdx) ?? mid;
    // Bezier (the react-flow "default" edge type) draws one smooth curve from
    // source handle to target handle — no explicit vertical segment, so two
    // edges sharing a target column can no longer collide on a single x-line.
    // The slot assignment above guarantees the source/target endpoints are
    // visually distinct; the curves between them spread naturally.
    return {
      id: `e${e.origIdx}`,
      source: e.from,
      target: e.to,
      sourceHandle: `s${s}`,
      targetHandle: `t${t}`,
      type: "default",
      animated: false,
      style:
        e.kind === "diagnostic"
          ? { stroke: "#b5a3c2", strokeDasharray: "3 4", strokeWidth: 1, opacity: 0.7 }
          : { stroke: "#555", strokeWidth: 1.3 },
    };
  });

  return { nodes, edges };
}
