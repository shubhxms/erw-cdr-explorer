import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { computeLayout } from "./layout";
import { CheckpointNode, type CheckpointNodeData } from "./CheckpointNode";
import { useStore } from "../store";

const NODE_TYPES = { checkpoint: CheckpointNode };

export function Graph() {
  const setSelected = useStore((s) => s.setSelected);
  const { nodes, edges } = useMemo(() => computeLayout(), []);

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => setSelected(node.id),
    [setSelected],
  );

  return (
    <ReactFlow
      nodes={nodes as Node<CheckpointNodeData>[]}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodeClick={onNodeClick}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
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
  );
}
