import React, { useEffect, useRef, useState } from "react";
// @ts-ignore
import ForceGraph2D from "react-force-graph-2d";

interface MindmapNode {
  id: string;
  label: string;
  description: string;
  content: string | null;
  level: number;
  parent_id: string | null;
  has_subgraph?: boolean;
  topic_id: string;
}

interface MindmapEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}

interface CenterNode {
  id: string;
  label: string;
  description: string;
  content: string | null;
  level: number;
  has_subgraph?: boolean;
}

interface MindmapCanvasProps {
  nodes: MindmapNode[];
  edges: MindmapEdge[];
  centerNode: CenterNode;
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
  centerNode,
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

    const forceNodes = [
      {
        id: centerNode.id,
        label: centerNode.label,
        description: centerNode.description,
        content: centerNode.content,
        level: centerNode.level,
        has_subgraph: centerNode.has_subgraph || false,
        isCenter: true,
      },
      ...nodes.map((n) => ({
        id: n.id,
        label: n.label,
        description: n.description,
        content: n.content,
        level: n.level,
        has_subgraph: n.has_subgraph,
        isCenter: false,
      })),
    ];

    const forceLinks: any[] = [];

    // Add relationships from edges, dynamically mapping links from the parent node (not in nodes array) to centerNode.id
    edges.forEach((edge) => {
      const sourceExists = nodes.some((n) => n.id === edge.source);
      forceLinks.push({
        source: sourceExists ? edge.source : centerNode.id,
        target: edge.target,
        relation: edge.relation,
        isHubLink: !sourceExists,
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
    setSelectedNodeId(node.id);
    if (node.id === centerNode.id) {
      onNodeClick({
        id: centerNode.id,
        label: centerNode.label,
        description: centerNode.description,
        content: centerNode.content,
        level: centerNode.level,
      });
      return;
    }
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
            if (typeof node.x !== "number" || typeof node.y !== "number" || isNaN(node.x) || isNaN(node.y)) {
              return;
            }
            const isCenter = node.id === centerNode.id;
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

            // Draw Symbols below label text
            const symbols: { text: string; color: string }[] = [];
            if (node.content) {
              symbols.push({ text: "✦ Enriched", color: "#fbbf24" }); // Gold Sparkle
            }
            if (node.has_subgraph) {
              symbols.push({ text: "⧉ Sub-graph", color: "#38bdf8" }); // Cyan branching box
            }

            if (symbols.length > 0) {
              const symbolFontSize = (fontSize * 0.75);
              ctx.font = `bold ${symbolFontSize}px Outfit, sans-serif`;
              ctx.textBaseline = "top";
              ctx.textAlign = "center";
              
              const spacing = 8 / Math.max(0.65, globalScale * 0.75);
              const widths = symbols.map(s => ctx.measureText(s.text).width);
              const totalWidth = widths.reduce((a, b) => a + b, 0) + (symbols.length - 1) * spacing;
              
              let currentX = node.x - totalWidth / 2;
              const symbolsY = node.y + radius + 5 + fontSize + 3;
              
              symbols.forEach((sym, idx) => {
                ctx.fillStyle = sym.color;
                ctx.fillText(sym.text, currentX + widths[idx] / 2, symbolsY);
                currentX += widths[idx] + spacing;
              });
            }
          }}

          // --- Custom Link Drawing (Canvas) ---
          linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            if (
              !link ||
              !link.source ||
              !link.target ||
              typeof link.source.x !== "number" ||
              typeof link.source.y !== "number" ||
              typeof link.target.x !== "number" ||
              typeof link.target.y !== "number" ||
              isNaN(link.source.x) ||
              isNaN(link.source.y) ||
              isNaN(link.target.x) ||
              isNaN(link.target.y)
            ) {
              return;
            }
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
            if (label && globalScale > 0.45) {
              const midX = (link.source.x + link.target.x) / 2;
              const midY = (link.source.y + link.target.y) / 2;
              
              const fontSize = 10.5 / globalScale;
              ctx.font = `bold ${fontSize}px Outfit, sans-serif`;
              const textWidth = ctx.measureText(label).width;
              const padding = 3.5 / globalScale;
              
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
              ctx.fillStyle = "rgba(148, 163, 184, 0.85)";
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
