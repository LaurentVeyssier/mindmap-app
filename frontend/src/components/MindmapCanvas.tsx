import React, { useEffect, useRef, useState } from "react";
// @ts-ignore
import { ForceGraph2D } from "react-force-graph";

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
 * Canvas workspace rendering the mindmap graph with a fluid D3 force-directed physics engine.
 */
export const MindmapCanvas: React.FC<MindmapCanvasProps> = ({
  nodes,
  edges,
  centerLabel,
  onNodeClick,
}) => {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Measure container and handle resizing dynamically
  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }

    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Format data for react-force-graph
  const getGraphData = () => {
    if (nodes.length === 0) return { nodes: [], links: [] };

    const centerNodeId = "center-hub-node";
    const forceNodes = [
      {
        id: centerNodeId,
        label: centerLabel,
        isCenter: true,
        level: nodes[0]?.level || 0,
      },
      ...nodes.map((n) => ({
        id: n.id,
        label: n.label,
        description: n.description,
        content: n.content,
        level: n.level,
        isCenter: false,
      })),
    ];

    const forceLinks: any[] = [];

    // Connect the center hub to all concepts (composition link)
    nodes.forEach((node) => {
      forceLinks.push({
        source: centerNodeId,
        target: node.id,
        relation: "", // Empty relation for structural link
        isHubLink: true,
      });
    });

    // Add the homogenized relationships between concepts
    edges.forEach((edge) => {
      forceLinks.push({
        source: edge.source,
        target: edge.target,
        relation: edge.relation,
        isHubLink: false,
      });
    });

    return { nodes: forceNodes, links: forceLinks };
  };

  const graphData = getGraphData();

  // Configure forces and fit viewport when graph changes
  useEffect(() => {
    if (fgRef.current && nodes.length > 0) {
      const fg = fgRef.current;

      // Adjust D3 force simulation parameters for optimal layout spacing
      fg.d3Force("charge").strength(-260);
      fg.d3Force("link").distance((link: any) => {
        return link.isHubLink ? 85 : 125;
      });

      // Warm up simulation and automatically center the graph
      setTimeout(() => {
        fg.zoomToFit(500, 70);
      }, 250);
    }
  }, [nodes, edges]);

  const handleNodeClick = (node: any) => {
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
    <div ref={containerRef} className="canvas-wrapper" style={{ height: "100%", width: "100%" }}>
      {nodes.length > 0 ? (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          onNodeClick={handleNodeClick}
          backgroundColor="#050811"
          cooldownTicks={120} // Let simulation settle quickly
          
          // --- Custom Node Drawing (Canvas) ---
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const isCenter = node.id === "center-hub-node";
            const isSelected = selectedNodeId === node.id;
            const radius = isCenter ? 14 : 9;

            // Draw glowing drop-shadow on selected node
            if (isSelected) {
              ctx.shadowColor = "#f59e0b";
              ctx.shadowBlur = 12 * globalScale;
            }

            // Paint radial-gradient sphere
            const gradient = ctx.createRadialGradient(node.x, node.y, 1, node.x, node.y, radius);
            if (isCenter) {
              gradient.addColorStop(0, "#fbbf24");
              gradient.addColorStop(1, "#b45309");
            } else if (isSelected) {
              gradient.addColorStop(0, "#f59e0b");
              gradient.addColorStop(1, "#1e293b");
            } else {
              gradient.addColorStop(0, "#475569");
              gradient.addColorStop(1, "#0f172a");
            }

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
            ctx.fill();

            // Reset shadow
            ctx.shadowBlur = 0;

            // Draw border ring
            ctx.strokeStyle = isSelected ? "#f59e0b" : isCenter ? "#d97706" : "rgba(148, 163, 184, 0.4)";
            ctx.lineWidth = isSelected ? 2 / globalScale : 1 / globalScale;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
            ctx.stroke();

            // Draw Label text below sphere
            const label = node.label || "";
            const fontSize = (isCenter ? 11.5 : 9.5) / Math.max(0.65, globalScale * 0.75);
            ctx.font = `500 ${fontSize}px Outfit, sans-serif`;
            ctx.fillStyle = isSelected ? "#f59e0b" : isCenter ? "#fbbf24" : "#cbd5e1";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            
            ctx.fillText(label, node.x, node.y + radius + 5);
          }}

          // --- Custom Link Drawing (Canvas) ---
          linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            // Draw link line
            ctx.strokeStyle = link.isHubLink
              ? "rgba(217, 119, 6, 0.28)"
              : "rgba(148, 163, 184, 0.28)";
            ctx.lineWidth = (link.isHubLink ? 1.8 : 1.2) / globalScale;
            ctx.beginPath();
            ctx.moveTo(link.source.x, link.source.y);
            ctx.lineTo(link.target.x, link.target.y);
            ctx.stroke();

            // Paint text relationship type at the midpoint
            const label = link.relation;
            if (label && globalScale > 0.8) {
              const midX = (link.source.x + link.target.x) / 2;
              const midY = (link.source.y + link.target.y) / 2;
              
              const fontSize = 7 / globalScale;
              ctx.font = `bold ${fontSize}px Outfit, sans-serif`;
              const textWidth = ctx.measureText(label).width;
              const padding = 2.5 / globalScale;
              
              // Draw capsule background
              ctx.fillStyle = "rgba(5, 8, 17, 0.92)";
              ctx.fillRect(
                midX - textWidth / 2 - padding,
                midY - fontSize / 2 - padding,
                textWidth + padding * 2,
                fontSize + padding * 2
              );
              
              // Capsule border
              ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
              ctx.lineWidth = 0.5 / globalScale;
              ctx.strokeRect(
                midX - textWidth / 2 - padding,
                midY - fontSize / 2 - padding,
                textWidth + padding * 2,
                fontSize + padding * 2
              );
              
              // Label text
              ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(label, midX, midY);
            }
          }}

          // --- Animated Particles (Wind/Spring Flow) ---
          linkDirectionalParticles={(link: any) => (link.isHubLink ? 2 : 0)}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleColor={() => "#f59e0b"}
        />
      ) : (
        <div style={{ display: "none" }} />
      )}
    </div>
  );
};
