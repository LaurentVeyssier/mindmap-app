import React, { useEffect, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from "reactflow";
import type { Node, Edge } from "reactflow";
import "reactflow/dist/style.css";

interface MindmapNode {
  id: string;
  label: string;
  description: string;
  content: string | null;
  level: number;
  parent_id: string | null;
  topic_id: string;
}

interface MindmapEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}

interface MindmapCanvasProps {
  nodes: MindmapNode[];
  edges: MindmapEdge[];
  centerLabel: string;
  onNodeClick: (node: {
    id: string;
    label: string;
    description: string;
    content: string | null;
    level: number;
  }) => void;
}

/**
 * Canvas workspace rendering the mindmap graph with zoom, pan, and interactive radial layout.
 */
export const MindmapCanvas: React.FC<MindmapCanvasProps> = ({
  nodes,
  edges,
  centerLabel,
  onNodeClick,
}) => {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (nodes.length === 0) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }

    const calculatedNodes: Node[] = [];
    const calculatedEdges: Edge[] = [];

    // Center coordinates
    const centerX = 450;
    const centerY = 350;

    // 1. Render the central/parent hub node
    const centerNodeId = "center-hub-node";
    calculatedNodes.push({
      id: centerNodeId,
      type: "input",
      data: { label: centerLabel },
      position: { x: centerX - 100, y: centerY - 25 },
      selectable: false,
      style: {
        background: "linear-gradient(135deg, #d97706, #b45309)",
        color: "#ffffff",
        border: "2px solid #f59e0b",
        borderRadius: "20px",
        padding: "12px 24px",
        fontWeight: "bold",
        fontSize: "15px",
        width: "200px",
        textAlign: "center",
        boxShadow: "0 0 25px rgba(217, 119, 6, 0.4)",
        cursor: "default",
      },
    });

    // 2. Render concept nodes radially
    const totalConcepts = nodes.length;
    const radius = 260; // radius of circle layout

    nodes.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / totalConcepts;
      const x = centerX + radius * Math.cos(angle) - 80;
      const y = centerY + radius * Math.sin(angle) - 35;

      const isSelected = selectedNodeId === node.id;

      calculatedNodes.push({
        id: node.id,
        data: { label: node.label },
        position: { x, y },
        style: {
          background: isSelected ? "#1e293b" : "rgba(15, 23, 42, 0.75)",
          color: "#f8fafc",
          border: isSelected 
            ? "2px solid #f59e0b" 
            : "1px solid rgba(148, 163, 184, 0.3)",
          borderRadius: "10px",
          padding: "10px 14px",
          width: "160px",
          fontSize: "13px",
          textAlign: "center",
          fontWeight: "500",
          boxShadow: isSelected 
            ? "0 0 15px rgba(245, 158, 11, 0.3)" 
            : "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          backdropFilter: "blur(12px)",
          cursor: "pointer",
        },
      });

      // 3. Connect center hub to children
      calculatedEdges.push({
        id: `hub-to-${node.id}`,
        source: centerNodeId,
        target: node.id,
        animated: true,
        style: { stroke: "rgba(217, 119, 6, 0.35)", strokeWidth: 1.5 },
      });
    });

    // 4. Render homogenized relationships between nodes
    edges.forEach((edge) => {
      calculatedEdges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.relation,
        type: "smoothstep",
        animated: false,
        style: { stroke: "rgba(148, 163, 184, 0.5)", strokeWidth: 1.5 },
        labelStyle: { fill: "#ffffff", fontSize: 9, fontWeight: "600" },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: "#090d16", fillOpacity: 0.9, stroke: "rgba(148, 163, 184, 0.2)", strokeWidth: 1 },
      });
    });

    setRfNodes(calculatedNodes);
    setRfEdges(calculatedEdges);
  }, [nodes, edges, centerLabel, selectedNodeId, setRfNodes, setRfEdges]);

  const handleNodeClick = (_event: React.MouseEvent, node: Node) => {
    if (node.id === "center-hub-node") return;

    setSelectedNodeId(node.id);
    const originalNode = nodes.find((n) => n.id === node.id);
    if (originalNode) {
      onNodeClick({
        id: originalNode.id,
        label: originalNode.label,
        description: originalNode.description,
        content: originalNode.content,
        level: originalNode.level,
      });
    }
  };

  return (
    <div className="canvas-wrapper">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={1.8}
      >
        <Background color="#334155" gap={16} size={1} />
        <Controls showInteractive={false} className="canvas-controls" />
        <MiniMap
          nodeStrokeColor="#f59e0b"
          nodeColor="rgba(15, 23, 42, 0.8)"
          maskColor="rgba(9, 13, 22, 0.7)"
          className="canvas-minimap"
        />
      </ReactFlow>
    </div>
  );
};
