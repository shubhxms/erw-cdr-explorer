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
import { NODES, type DagNode } from "../dag/nodes";
import { EDGES } from "../dag/edges";
import { HANDLE_COUNT, type CheckpointNodeData } from "./CheckpointNode";

const NODE_W = 220;
const NODE_H = 84;
const ROW_GAP = 96; // vertical pitch within a cell (top-edge to top-edge)
const BAND_GAP = 80; // extra vertical padding between bands sharing a column

/**
 * Column x positions. We split long stages into multiple semantic sub-columns
 * so no single vertical strip has 15+ nodes:
 *
 *   col 0  inputs
 *   col 1  cleaning
 *   col 2  bootstrap · bulk-density + feedstock preprocessing
 *   col 3  bootstrap · control correction
 *   col 4  chain · pairing + Ti (mass_ratio, app_rate)
 *   col 5  chain · Ca pipeline
 *   col 6  chain · Mg pipeline + combined CO₂
 *   col 7  aggregation + validation (banded)
 *
 * Sub-columns of the same logical stage sit 280 px apart; jumps between
 * different stages are 380 px so the grouping reads visually.
 */
const COL_X: number[] = [
  0,        // inputs
  380,      // cleaning
  760,      // bootstrap-A
  1040,     // bootstrap-B
  1420,     // chain-Ti
  1700,     // chain-Ca
  1980,     // chain-Mg+combined
  2360,     // agg+validation
];

/**
 * Which sub-column does a bootstrap node belong to?
 *   0 = bulk-density + feedstock
 *   1 = control correction (paired + bl/rp/corr_boot/p50 for Ca + Mg)
 */
function bootstrapSubCol(tail: string): 0 | 1 {
  if (
    tail === "bd_boot" ||
    tail === "bd_mean" ||
    tail === "soil_mass_kg_ha" ||
    tail.startsWith("fs_")
  ) {
    return 0;
  }
  return 1;
}

/**
 * Which sub-column does a chain_deployment / chain_treatment node belong to?
 *   0 = pairing + Ti (paired, bl_ti, rp_ti, mass_ratio, app_rate_kg_ha)
 *   1 = Ca pipeline (anything with _ca in the name)
 *   2 = Mg pipeline + co2_combined
 */
function chainSubCol(tail: string): 0 | 1 | 2 {
  if (
    tail === "paired" ||
    tail === "bl_ti" ||
    tail === "rp_ti" ||
    tail === "mass_ratio" ||
    tail === "app_rate_kg_ha"
  ) {
    return 0;
  }
  if (tail.includes("_ca")) return 1;
  return 2;
}

/** Map a DAG node to its visual (column index, band index) cell. */
function cellFor(n: DagNode): { col: number; band: 0 | 1 } {
  const tail = n.id.split("/")[1] ?? "";
  switch (n.stage) {
    case "inputs":
      return { col: 0, band: 0 };
    case "cleaning":
      return { col: 1, band: 0 };
    case "bootstrap":
      return { col: 2 + bootstrapSubCol(tail), band: 0 };
    case "chain_deployment":
      return { col: 4 + chainSubCol(tail), band: 0 };
    case "chain_treatment":
      return { col: 4 + chainSubCol(tail), band: 1 };
    case "aggregation":
      return { col: 7, band: 0 };
    case "diagnostics":
      return { col: 7, band: 1 };
  }
}

export interface LayoutResult {
  nodes: Node<CheckpointNodeData>[];
  edges: Edge[];
}

export function computeLayout(): LayoutResult {
  // Bucket nodes by (column, band) cell, preserving file order from nodes.ts —
  // keeps Ca/Mg pipelines, bd/fs groups, etc. visually contiguous.
  const cells = new Map<string, DagNode[]>();
  for (const n of NODES) {
    const { col, band } = cellFor(n);
    const key = `${col}:${band}`;
    const arr = cells.get(key) ?? [];
    arr.push(n);
    cells.set(key, arr);
  }

  // For each column, lay out band 0 then band 1 with BAND_GAP between them.
  const positions = new Map<string, { x: number; y: number }>();
  for (let col = 0; col < COL_X.length; col++) {
    let y = 0;
    let printedAny = false;
    for (let band = 0; band < 2; band++) {
      const nodes = cells.get(`${col}:${band}`) ?? [];
      if (nodes.length === 0) continue;
      if (printedAny) y += BAND_GAP;
      for (const n of nodes) {
        positions.set(n.id, { x: COL_X[col], y });
        y += ROW_GAP;
      }
      printedAny = true;
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
    // Smoothstep (orthogonal "snake": right → down/up → right) is easier to
    // trace than bezier curves between distant columns, which swoop and
    // visually overlap. Per-edge `offset` is varied by source slot index so
    // each edge's vertical turn happens at a distinct x — vertical segments
    // don't stack into the same corridor. Main vs diagnostic also get
    // different base offsets so the two kinds settle into different x-bands.
    const baseOffset = e.kind === "diagnostic" ? 16 : 36;
    const offset = baseOffset + s * 6;
    return {
      id: `e${e.origIdx}`,
      source: e.from,
      target: e.to,
      sourceHandle: `s${s}`,
      targetHandle: `t${t}`,
      type: "smoothstep",
      animated: false,
      pathOptions: { offset, borderRadius: 12 },
      style:
        e.kind === "diagnostic"
          ? { stroke: "#b5a3c2", strokeDasharray: "3 4", strokeWidth: 0.9 }
          : { stroke: "#555", strokeWidth: 1.0 },
    };
  });

  return { nodes, edges };
}
