/**
 * Column-per-stage layout using dagre.
 * Stages flow left → right; nodes within a stage stack top → bottom by execution step.
 */

import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import { NODES, type Stage } from "../dag/nodes";
import { EDGES } from "../dag/edges";
import { HANDLE_COUNT, type CheckpointNodeData } from "./CheckpointNode";

const NODE_W = 220;
const NODE_H = 84;

const STAGE_RANK: Record<Stage, number> = {
  inputs: 0,
  cleaning: 1,
  bootstrap: 2,
  chain_deployment: 3,
  chain_treatment: 3, // same column, separated vertically by dagre
  diagnostics: 4,
  aggregation: 4,
};

export interface LayoutResult {
  nodes: Node<CheckpointNodeData>[];
  edges: Edge[];
}

export function computeLayout(): LayoutResult {
  const g = new dagre.graphlib.Graph({ multigraph: false });
  g.setGraph({
    rankdir: "LR",
    // Wider horizontal gaps + larger edgesep give dagre room to route many
    // parallel edges with visible offset between them instead of stacking
    // them on top of each other through narrow corridors.
    nodesep: 48,
    ranksep: 180,
    edgesep: 32,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of NODES) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H, rank: STAGE_RANK[n.stage] });
  }
  for (const e of EDGES) {
    if (!g.hasNode(e.from) || !g.hasNode(e.to)) continue;
    g.setEdge(e.from, e.to, { minlen: 1 });
  }

  dagre.layout(g);

  const nodes: Node<CheckpointNodeData>[] = NODES.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: "checkpoint",
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { id: n.id, label: n.label, stage: n.stage, description: n.description, unit: n.unit },
      width: NODE_W,
      height: NODE_H,
      selectable: true,
      draggable: false,
    };
  });

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
    (e) => g.hasNode(e.from) && g.hasNode(e.to),
  ).map((e, i) => ({
    ...e,
    fromY: g.node(e.from).y,
    toY: g.node(e.to).y,
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
