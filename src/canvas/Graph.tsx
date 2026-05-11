import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { computeLayout } from "./layout";
import { CheckpointNode, type CheckpointNodeData } from "./CheckpointNode";
import { Legend } from "./Legend";
import { useStore } from "../store";

const NODE_TYPES = { checkpoint: CheckpointNode };

export function Graph() {
  const setSelected = useStore((s) => s.setSelected);
  const selectEdge = useStore((s) => s.selectEdge);
  const clearSelection = useStore((s) => s.clearSelection);
  const highlighted = useStore((s) => s.highlighted);
  const selection = useStore((s) => s.selection);

  const base = useMemo(() => computeLayout(), []);

  // Apply highlight styling: when a selection exists, dim nodes/edges outside
  // the highlight set; otherwise render everything at full opacity.
  const { nodes, edges } = useMemo(() => {
    const hl = highlighted;
    const sel = selection;
    const styledNodes: Node<CheckpointNodeData>[] = base.nodes.map((n) => {
      if (!hl) return n;
      const inSet = hl.has(n.id);
      return {
        ...n,
        style: inSet ? undefined : { opacity: 0.18 },
        selected: sel.kind === "node" && sel.id === n.id,
      };
    });
    const styledEdges: Edge[] = base.edges.map((e) => {
      const isSelectedEdge =
        sel.kind === "edge" && sel.edgeFrom === e.source && sel.edgeTo === e.target;
      if (!hl) {
        return { ...e, style: { ...e.style, opacity: isSelectedEdge ? 1 : 0.85 } };
      }
      const both = hl.has(e.source) && hl.has(e.target);
      const base = e.style ?? {};
      return {
        ...e,
        style: both
          ? {
              ...base,
              opacity: 1,
              stroke: isSelectedEdge ? "#111" : (base as { stroke?: string }).stroke,
              strokeWidth: isSelectedEdge ? 2 : ((base as { strokeWidth?: number }).strokeWidth ?? 1.2),
            }
          : { ...base, opacity: 0.08 },
      };
    });
    return { nodes: styledNodes, edges: styledEdges };
  }, [base, highlighted, selection]);

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => setSelected(node.id),
    [setSelected],
  );
  const onEdgeClick = useCallback(
    (_: unknown, edge: Edge) => selectEdge(edge.source, edge.target),
    [selectEdge],
  );
  const onPaneClick = useCallback(() => clearSelection(), [clearSelection]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        edgesFocusable
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        fitView
        minZoom={0.2}
        maxZoom={2.5}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
      <Legend />
    </div>
  );
}
