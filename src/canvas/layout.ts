/**
 * Column-per-stage layout using dagre.
 * Stages flow left → right; nodes within a stage stack top → bottom by execution step.
 */

import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import { NODES, type Stage } from "../dag/nodes";
import { EDGES } from "../dag/edges";
import type { CheckpointNodeData } from "./CheckpointNode";

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
    nodesep: 28,
    ranksep: 90,
    edgesep: 10,
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

  const edges: Edge[] = EDGES.filter(
    (e) => g.hasNode(e.from) && g.hasNode(e.to),
  ).map((e, i) => ({
    id: `e${i}`,
    source: e.from,
    target: e.to,
    type: "smoothstep",
    animated: false,
    style:
      e.kind === "diagnostic"
        ? { stroke: "#aaa", strokeDasharray: "4 3", strokeWidth: 1 }
        : { stroke: "#666", strokeWidth: 1.2 },
  }));

  return { nodes, edges };
}
