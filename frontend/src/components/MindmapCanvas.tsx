import React, { useEffect, useRef, useState } from "react";
// @ts-ignore
import ForceGraph2D from "react-force-graph-2d";
// @ts-ignore
import { forceCollide } from "d3-force-3d";


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
  selectedNodeId: string | null;
  onNodeClick: (node: {
    id: string;
    label: string;
    description: string;
    content: string | null;
    level: number;
  }) => void;
}

const drawWrappedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  lineHeight: number,
  maxLines: number = 3
): number => {
  const words = text.split(" ");
  let lines: string[] = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (currentLine.length + word.length > 12) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine += " " + word;
    }
  }
  lines.push(currentLine);

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] += "...";
  }

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
  
  return lines.length;
};

/**
 * Canvas workspace rendering the mindmap graph with a fluid D3 force-directed physics engine.
 */
export const MindmapCanvas: React.FC<MindmapCanvasProps> = ({
  nodes,
  edges,
  centerNode,
  selectedNodeId,
  onNodeClick,
}) => {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Auto-center camera on the selected node, with an offset for the sidebar drawer
  useEffect(() => {
    if (selectedNodeId && fgRef.current) {
      // Small timeout to let the drawer render if it's opening
      setTimeout(() => {
        if (!fgRef.current) return;
        const graphNodes = fgRef.current.graphData().nodes;
        const nodeObj = graphNodes.find((n: any) => n.id === selectedNodeId);
        if (nodeObj && typeof nodeObj.x === "number" && typeof nodeObj.y === "number") {
          const zoom = fgRef.current.zoom() || 1;
          const isMobile = window.innerWidth < 768;
          // Drawer occupies right part of the viewport on desktop
          const drawerWidth = isMobile ? 0 : 450;
          const screenOffset = drawerWidth / 2;
          const graphOffset = screenOffset / zoom;
          
          fgRef.current.centerAt(nodeObj.x + graphOffset, nodeObj.y, 400);
        }
      }, 50);
    }
  }, [selectedNodeId]);

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

  // Configure forces and fit viewport when graph or dimensions change
  useEffect(() => {
    if (fgRef.current && nodes.length > 0) {
      const fg = fgRef.current;
      const isSmallScreen = dimensions.width < 768;

      // Adjust D3 force simulation parameters for optimal layout spacing
      fg.d3Force("charge").strength(isSmallScreen ? -280 : -400); // Increase repulsion on mobile to spread out
      fg.d3Force("link").distance((link: any) => {
        // Hub links (center to Level 1) are longer to give Level 1 concepts more circumference space.
        // Child links (Level 1 to Level 2 leaves) are shorter to keep sub-tree leaves clustered compactly.
        if (isSmallScreen) {
          return link.isHubLink ? 110 : 70; // Spread out link distance on small viewports
        }
        return link.isHubLink ? 150 : 90;
      });

      // Add a collision force to prevent overlapping node spheres and labels
      fg.d3Force("collide", forceCollide((node: any) => {
        const radius = node.id === centerNode.id
          ? (isSmallScreen ? 18 : 28)
          : node.level === 1
            ? (isSmallScreen ? 14 : 20)  // Level 1 Concepts
            : (isSmallScreen ? 9 : 12);  // Level 2 Leaves
        const padding = isSmallScreen ? 25 : 30; // Spaced collision radius padding
        return radius + padding; // Node radius plus padding for label/text spacing
      }));

      // Warm up simulation and automatically center the graph
      setTimeout(() => {
        fg.zoomToFit(500, isSmallScreen ? 35 : 70);
      }, 250);
    }
  }, [nodes, edges, centerNode, dimensions.width]);

  const handleNodeClick = (node: any) => {
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
            const isSmall = dimensions.width < 768;
            
            const radius = isCenter
              ? (isSmall ? 18 : 28)
              : node.level === 1
                ? (isSmall ? 14 : 20)  // Level 1 Concepts
                : (isSmall ? 9 : 12);  // Level 2 Leaves

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
              if (node.level === 1) {
                gradient.addColorStop(0, "#f17863ff"); // Indigo for Level 1 Concepts
                gradient.addColorStop(1, "#4b1e1bff");
              } else {
                gradient.addColorStop(0, "#475569"); // Grey for Level 2 Leaves
                gradient.addColorStop(1, "#0f172a");
              }
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
            const baseFontSize = isSmall
              ? (isCenter ? 9.5 : 8)
              : (isCenter ? 11.5 : 9.5);
            const fontSize = baseFontSize / Math.max(0.65, globalScale * 0.75);
            ctx.font = `500 ${fontSize}px Outfit, sans-serif`;
            ctx.fillStyle = isSelected ? "#f59e0b" : isCenter ? "#fbbf24" : "#cbd5e1";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            let linesDrawn = 1;
            const startY = node.y + radius + 5;
            const lineHeight = fontSize + 2;

            if (isSmall && label.length > 12) {
              linesDrawn = drawWrappedText(ctx, label, node.x, startY, lineHeight, 3);
            } else {
              ctx.fillText(label, node.x, startY);
            }

            // Draw Symbols below label text
            const symbols: { text: string; color: string }[] = [];
            if (node.content) {
              symbols.push({ text: isSmall ? "✦" : "✦ Enriched", color: "#fbbf24" }); // Gold Sparkle
            }
            if (node.has_subgraph) {
              symbols.push({ text: isSmall ? "⧉" : "⧉ Sub-graph", color: "#38bdf8" }); // Cyan branching box
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
              const symbolsY = startY + (linesDrawn * lineHeight) + 3;

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
            const isSmall = dimensions.width < 768;
            if (label && globalScale > 0.45 && !isSmall) {
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
