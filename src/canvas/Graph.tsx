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
      const isSelectedNode = sel.kind === "node" && sel.id === n.id;
      if (!hl) return { ...n, selected: isSelectedNode };
      const inSet = hl.has(n.id);
      return {
        ...n,
        selected: isSelectedNode,
        style: inSet
          ? { filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.12))" }
          : { opacity: 0.18, filter: "grayscale(1)" },
      };
    });
    const styledEdges: Edge[] = base.edges.map((e) => {
      const isSelectedEdge =
        sel.kind === "edge" && sel.edgeFrom === e.source && sel.edgeTo === e.target;
      const baseStyle = e.style ?? {};
      if (!hl) {
        return { ...e, style: { ...baseStyle, opacity: 0.85 } };
      }
      const both = hl.has(e.source) && hl.has(e.target);
      if (!both) {
        return { ...e, style: { ...baseStyle, opacity: 0.04 } };
      }
      // edge inside the cone
      const isDiag =
        (baseStyle as { strokeDasharray?: string }).strokeDasharray !== undefined;
      return {
        ...e,
        animated: true,
        style: {
          ...baseStyle,
          opacity: 1,
          stroke: isSelectedEdge ? "#111" : isDiag ? "#7a4fb1" : "#1850c8",
          strokeWidth: isSelectedEdge ? 2.4 : 1.8,
        },
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
