interface TopicResponse {
  id: string;
  title: string;
  description: string;
  content: string | null;
}

interface MindmapNodeSchema {
  id: string;
  label: string;
  description: string;
  content: string | null;
  level: number;
  parent_id: string | null;
  sub_graph_parent_id: string | null;
  topic_id: string;
}

interface MindmapEdgeSchema {
  id: string;
  source: string;
  target: string;
  relation: string;
}

interface ExportData {
  topic: TopicResponse;
  nodes: (MindmapNodeSchema & { has_subgraph?: boolean })[];
  edges: MindmapEdgeSchema[];
}

/**
 * Generates a self-contained, interactive HTML string containing the entire mindmap graph
 * and an offline viewer engine (ForceGraph, marked, mermaid).
 */
export const generateStandaloneHtml = (data: ExportData): string => {
  const serializedData = JSON.stringify(data);
  const topicTitle = data.topic.title;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interactive Mindmap - ${topicTitle}</title>
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- D3 Force Graph -->
  <script src="https://unpkg.com/force-graph"></script>
  
  <!-- Markdown Parser -->
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  
  <!-- Mermaid Diagrams -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>

  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Plus Jakarta Sans', 'sans-serif'],
            heading: ['Outfit', 'sans-serif'],
          },
          colors: {
            brand: {
              dark: '#050811',
              card: 'rgba(13, 20, 38, 0.45)',
              accent: '#f59e0b',
              accentHover: '#d97706',
              primary: '#3b82f6',
              border: 'rgba(255, 255, 255, 0.08)',
              borderFocus: 'rgba(255, 255, 255, 0.15)',
              success: '#10b981',
              danger: '#ef4444',
            }
          }
        }
      }
    }
  </script>

  <style>
    body {
      background-color: #050811;
      color: #f1f5f9;
      font-family: 'Plus Jakarta Sans', sans-serif;
      overflow: hidden;
    }
    .glassmorphic {
      background: rgba(13, 20, 38, 0.45);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    /* Custom scrollbar for sidebar */
    .custom-scroll::-webkit-scrollbar {
      width: 6px;
    }
    .custom-scroll::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scroll::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }
    .custom-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    /* Mermaid flowchart styles */
    .mermaid-chart {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
      display: flex;
      justify-content: center;
      overflow-x: auto;
      min-height: 80px;
    }
    .mermaid-chart svg {
      max-width: 100% !important;
      height: auto !important;
    }
    .markdown-body h1 { @apply text-2xl font-bold mt-6 mb-3 text-white border-b border-brand-border pb-1; }
    .markdown-body h2 { @apply text-xl font-semibold mt-5 mb-2 text-white border-b border-brand-border pb-1; }
    .markdown-body h3 { @apply text-lg font-semibold mt-4 mb-2 text-white; }
    .markdown-body p { @apply text-sm leading-relaxed text-slate-300 mb-3; }
    .markdown-body ul, .markdown-body ol { @apply list-disc list-inside mb-4 pl-2 text-sm text-slate-300 space-y-1; }
    .markdown-body li > ul { @apply list-circle pl-4 mt-1; }
    .markdown-body blockquote { @apply border-l-4 border-amber-500 bg-amber-500/5 px-4 py-2 my-4 rounded-r-md text-sm text-amber-200/90 italic; }
    .markdown-body code { @apply bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-xs text-amber-400 font-mono; }
    .markdown-body pre { @apply bg-black/40 border border-brand-border p-4 rounded-lg my-4 overflow-x-auto; }
    .markdown-body pre code { @apply bg-transparent border-0 p-0 text-slate-200 block text-xs leading-normal; }
  </style>
</head>
<body class="h-screen w-screen flex flex-col font-sans select-none antialiased">

  <!-- Header -->
  <header class="h-16 w-full flex items-center justify-between px-6 border-b border-brand-border z-10 bg-brand-dark/80 backdrop-blur-md">
    <div class="flex items-center gap-3">
      <!-- Network Icon -->
      <svg xmlns="http://www.w3.org/2000/svg" class="text-amber-500 animate-pulse" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="16" y="16" width="6" height="6" rx="1" />
        <rect x="2" y="16" width="6" height="6" rx="1" />
        <rect x="9" y="2" width="6" height="6" rx="1" />
        <path d="M12 8v8M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
      </svg>
      <span class="font-heading text-lg font-bold tracking-tight text-white">Interactive Mindmap Viewer</span>
    </div>
    
    <!-- Breadcrumbs Navigation -->
    <nav class="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
      <button onclick="navigateToLevel(null)" class="hover:text-amber-500 transition-colors">Home</button>
      <span class="text-slate-600">/</span>
      <div id="breadcrumbs-container" class="flex items-center gap-1.5">
        <!-- Injected via JavaScript -->
      </div>
    </nav>
  </header>

  <!-- Main View -->
  <div class="flex-1 w-full flex overflow-hidden relative">
    
    <!-- Graph Canvas Container -->
    <div id="graph-container" class="w-full h-full relative cursor-grab active:cursor-grabbing">
      <div id="graph-canvas" class="w-full h-full"></div>
      
      <!-- Overlay Instructions -->
      <div class="absolute bottom-4 left-6 z-10 pointer-events-none glassmorphic rounded-lg px-4 py-2.5 text-slate-400 text-xs flex flex-col gap-1 select-none">
        <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span>Center Node (Active Pillar)</span></div>
        <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span><span>Sub-Concepts / Pillars</span></div>
        <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-slate-500"></span><span>Leaf Concepts</span></div>
        <p class="mt-1.5 text-[10px] text-slate-500 border-t border-brand-border pt-1">Left-click node to inspect. Drag/scroll canvas to pan/zoom.</p>
      </div>
    </div>

    <!-- Sidebar Details Drawer -->
    <aside id="sidebar" class="w-96 h-full border-l border-brand-border glassmorphic absolute right-0 top-0 translate-x-full transition-transform duration-300 ease-out z-20 flex flex-col">
      <!-- Drawer Header -->
      <div class="h-16 px-6 border-b border-brand-border flex items-center justify-between">
        <div>
          <span id="node-level-badge" class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">Concept</span>
          <h3 id="node-title" class="font-heading text-base font-bold text-white mt-1 leading-snug truncate w-64">Node Title</h3>
        </div>
        <button onclick="closeSidebar()" class="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <!-- Drawer Content -->
      <div class="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-scroll select-text">
        <!-- Overview -->
        <section>
          <h4 class="text-xs uppercase font-bold tracking-wider text-slate-400 mb-2.5">Overview</h4>
          <p id="node-desc" class="text-slate-300 text-sm leading-relaxed">Overview description text goes here.</p>
        </section>

        <!-- Detailed Guide -->
        <section id="guide-section" class="border-t border-brand-border pt-5 hidden">
          <h4 class="text-xs uppercase font-bold tracking-wider text-slate-400 mb-3">Detailed Guide</h4>
          <div id="markdown-content" class="markdown-body select-text">
            <!-- Rendered Markdown goes here -->
          </div>
        </section>
        
        <!-- Drill Down Section -->
        <section id="drill-section" class="border-t border-brand-border pt-5 hidden">
          <h4 class="text-xs uppercase font-bold tracking-wider text-slate-400 mb-2.5">Explore Sub-topics</h4>
          <p class="text-slate-400 text-[11px] mb-3 leading-relaxed">Decompose this concept further into its own dedicated sub-graph mindmap level.</p>
          <button id="btn-drill-down" onclick="drillDownActive()" class="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-brand-dark font-semibold text-sm py-2 px-4 rounded-lg transition-colors select-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Drill Down into Concept
          </button>
        </section>
      </div>
    </aside>

  </div>

  <!-- Global Application Code -->
  <script>
    // Embedded Data injected during download build
    const DATA = ${serializedData};
    
    // Application State
    let currentParentId = null;
    let breadcrumbs = [];
    let selectedNode = null;
    let graphEngine = null;

    // Initialize Mermaid compiler
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      themeVariables: {
        background: 'transparent',
        primaryColor: 'rgba(59, 130, 246, 0.15)',
        primaryBorderColor: 'rgba(59, 130, 246, 0.3)',
        primaryTextColor: '#e2e8f0',
        lineColor: 'rgba(255, 255, 255, 0.15)',
        secondaryColor: 'rgba(245, 158, 11, 0.15)',
        tertiaryColor: 'rgba(16, 185, 129, 0.15)',
        actorBkg: 'rgba(255, 255, 255, 0.03)',
        actorBorder: 'rgba(255, 255, 255, 0.1)',
      }
    });

    // Helper: Determine if a node has children/subgraph
    function hasSubgraph(nodeId) {
      return DATA.nodes.some(n => n.sub_graph_parent_id === nodeId);
    }

    // Filter nodes and edges based on current parent / depth
    function getFilteredData() {
      // Find the hub/center node representing the current level
      let centerNode = null;
      if (currentParentId === null) {
        // Root Topic Level
        centerNode = {
          id: DATA.topic.id,
          label: DATA.topic.title,
          description: DATA.topic.description,
          content: DATA.topic.content,
          level: 0,
          isCenter: true
        };
      } else {
        // Concept Sub-graph Level
        const originalNode = DATA.nodes.find(n => n.id === currentParentId);
        centerNode = {
          ...originalNode,
          isCenter: true
        };
      }

      // Filter children nodes belonging to this parent
      const childNodes = DATA.nodes.filter(n => n.sub_graph_parent_id === currentParentId)
        .map(n => ({
          ...n,
          isCenter: false,
          has_subgraph: hasSubgraph(n.id)
        }));

      const activeNodes = [centerNode, ...childNodes];
      const activeIds = new Set(activeNodes.map(n => n.id));

      // Filter edges that connect active nodes in this view
      const activeEdges = DATA.edges.filter(edge => {
        // Include edges connecting nodes that are both active
        if (activeIds.has(edge.source) && activeIds.has(edge.target)) {
          return true;
        }
        // Include edge from parent if currentParentId is set
        if (currentParentId !== null && edge.source === currentParentId && activeIds.has(edge.target)) {
          return true;
        }
        return false;
      }).map(edge => {
        const isHub = (edge.source === centerNode.id);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          relation: edge.relation,
          isHubLink: isHub
        };
      });

      return { nodes: activeNodes, links: activeEdges };
    }

    // Initialize and Render D3 Canvas
    function renderGraph() {
      const container = document.getElementById('graph-canvas');
      container.innerHTML = '';
      
      const { nodes, links } = getFilteredData();
      
      graphEngine = ForceGraph()(container)
        .graphData({ nodes, links })
        .width(container.clientWidth)
        .height(container.clientHeight)
        .backgroundColor('#050811')
        .cooldownTicks(120)
        .linkWidth(link => link.isHubLink ? 2.5 : 1.25)
        .linkColor(link => link.isHubLink ? 'rgba(245, 158, 11, 0.45)' : 'rgba(255, 255, 255, 0.12)')
        .linkDirectionalParticles(link => link.isHubLink ? 2 : 0)
        .linkDirectionalParticleWidth(2)
        .linkDirectionalParticleSpeed(0.005)
        .nodeCanvasObject((node, ctx, globalScale) => {
          if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
          
          const isCenter = node.isCenter;
          const radius = isCenter ? 24
            : node.level === 1
              ? 16  // Level 1 Concepts
              : 10;  // Level 2 Leaves
              
          // Paint radial-gradient sphere
          const gradient = ctx.createRadialGradient(node.x, node.y, 1, node.x, node.y, radius);
          if (isCenter) {
            gradient.addColorStop(0, "#fbbf24");
            gradient.addColorStop(1, "#b45309");
          } else if (node.level === 1) {
            gradient.addColorStop(0, "#60a5fa");
            gradient.addColorStop(1, "#1d4ed8");
          } else {
            gradient.addColorStop(0, "#34d399");
            gradient.addColorStop(1, "#065f46");
          }
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
          ctx.fill();
          
          // Draw border ring
          ctx.strokeStyle = isCenter ? "#d97706" : "rgba(148, 163, 184, 0.4)";
          ctx.lineWidth = 1 / globalScale;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
          ctx.stroke();
          
          // Draw Label text below sphere
          const label = node.label || "";
          const fontSize = (isCenter ? 11.5 : 9.5) / Math.max(0.65, globalScale * 0.75);
          ctx.font = "500 " + fontSize + "px 'Outfit', sans-serif";
          ctx.fillStyle = isCenter ? "#fbbf24" : "#cbd5e1";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(label, node.x, node.y + radius + 5);
          
          // Draw Symbols below label text
          const symbols = [];
          if (node.content) {
            symbols.push({ text: "✦ Enriched", color: "#fbbf24" });
          }
          if (node.has_subgraph) {
            symbols.push({ text: "⧉ Sub-graph", color: "#38bdf8" });
          }
          
          if (symbols.length > 0) {
            const symbolFontSize = fontSize * 0.75;
            ctx.font = "bold " + symbolFontSize + "px 'Outfit', sans-serif";
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
        })
        .linkCanvasObjectMode(() => 'after')
        .linkCanvasObject((link, ctx, globalScale) => {
          if (globalScale < 0.6) return;
          
          const label = link.relation;
          if (!label) return;
          const fontSize = 7.5 / globalScale;
          ctx.font = "italic 500 " + fontSize + "px 'Plus Jakarta Sans', sans-serif";
          
          const start = link.source;
          const end = link.target;
          if (typeof start !== 'object' || typeof end !== 'object') return;
          
          // Midpoint of link
          const textX = start.x + (end.x - start.x) / 2;
          const textY = start.y + (end.y - start.y) / 2;
          
          // Draw bounding box
          const textWidth = ctx.measureText(label).width;
          const paddingX = 4;
          const paddingY = 2;
          ctx.fillStyle = '#050811';
          ctx.fillRect(
            textX - textWidth / 2 - paddingX,
            textY - fontSize / 2 - paddingY,
            textWidth + paddingX * 2,
            fontSize + paddingY * 2
          );
          
          // Render label
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
          ctx.fillText(label, textX, textY);
        })
        .onNodeClick(node => {
          // Select and show details in sidebar
          selectedNode = node;
          showSidebar(node);
        });

      // Configure forces
      graphEngine.d3Force('charge').strength(-260);
      graphEngine.d3Force('link').distance(link => link.isHubLink ? 85 : 125);

      // Fit to screen on initial load
      setTimeout(() => {
        graphEngine.zoomToFit(300, 50);
      }, 100);
    }

    // Side panel display logic
    function showSidebar(node) {
      document.getElementById('node-title').innerText = node.label;
      document.getElementById('node-desc').innerText = node.description;
      
      // Update badge
      const badge = document.getElementById('node-level-badge');
      if (node.level === 0) {
        badge.innerText = 'Root Topic';
      } else {
        badge.innerText = \`Level \${node.level} Concept\`;
      }

      // Check if detailed guide exists
      const guideSection = document.getElementById('guide-section');
      const mdContent = document.getElementById('markdown-content');
      if (node.content) {
        guideSection.classList.remove('hidden');
        mdContent.innerHTML = marked.parse(node.content);
        
        // Render any nested diagrams found in markdown
        setTimeout(() => {
          const codeElements = mdContent.querySelectorAll('.language-mermaid, pre code');
          codeElements.forEach((el, index) => {
            const codeText = el.innerText.trim();
            if (codeText.startsWith('graph') || codeText.startsWith('sequenceDiagram') || codeText.startsWith('flowchart')) {
              // Convert containing pre element into a mermaid container
              const pre = el.tagName === 'CODE' ? el.parentElement : el;
              const wrapper = document.createElement('div');
              wrapper.className = 'mermaid-chart';
              wrapper.id = \`mermaid-sidebar-\${index}\`;
              pre.parentNode.replaceChild(wrapper, pre);
              
              try {
                mermaid.render(\`svg-sidebar-\${index}\`, codeText).then(({ svg }) => {
                  wrapper.innerHTML = svg;
                });
              } catch (e) {
                wrapper.innerHTML = \`<pre class="text-xs text-red-500 font-mono">Error rendering diagram</pre>\`;
              }
            }
          });
        }, 10);
      } else {
        guideSection.classList.add('hidden');
        mdContent.innerHTML = '';
      }

      // Drill down option
      const drillSection = document.getElementById('drill-section');
      if (node.level > 0 && hasSubgraph(node.id)) {
        drillSection.classList.remove('hidden');
      } else {
        drillSection.classList.add('hidden');
      }

      // Show drawer
      document.getElementById('sidebar').classList.remove('translate-x-full');
    }

    function closeSidebar() {
      document.getElementById('sidebar').classList.add('translate-x-full');
      selectedNode = null;
    }

    // Drill down logic
    function drillDownActive() {
      if (!selectedNode) return;
      navigateToLevel(selectedNode.id);
      closeSidebar();
    }

    // Navigation and Breadcrumbs Engine
    function navigateToLevel(parentId) {
      currentParentId = parentId;
      
      if (parentId === null) {
        breadcrumbs = [];
      } else {
        // Find index if already in breadcrumbs
        const idx = breadcrumbs.findIndex(b => b.id === parentId);
        if (idx !== -1) {
          // Truncate up to that point
          breadcrumbs = breadcrumbs.slice(0, idx + 1);
        } else {
          // Load ancestors from data to reconstruct full lineage
          const targetNode = DATA.nodes.find(n => n.id === parentId);
          breadcrumbs = [];
          
          let current = targetNode;
          while (current) {
            breadcrumbs.unshift({ id: current.id, label: current.label });
            if (current.sub_graph_parent_id) {
              current = DATA.nodes.find(n => n.id === current.sub_graph_parent_id);
            } else {
              current = null;
            }
          }
        }
      }

      renderBreadcrumbs();
      renderGraph();
    }

    function renderBreadcrumbs() {
      const container = document.getElementById('breadcrumbs-container');
      container.innerHTML = '';
      
      breadcrumbs.forEach((b, idx) => {
        const item = document.createElement('div');
        item.className = 'flex items-center gap-1.5';
        
        const arrow = document.createElement('span');
        arrow.className = 'text-slate-600';
        arrow.innerText = '/';
        item.appendChild(arrow);
        
        const btn = document.createElement('button');
        btn.className = 'hover:text-amber-500 transition-colors text-ellipsis max-w-[120px] overflow-hidden whitespace-nowrap';
        btn.innerText = b.label;
        btn.onclick = () => navigateToLevel(b.id);
        item.appendChild(btn);
        
        container.appendChild(item);
      });
    }

    // Window Resize Handler
    window.addEventListener('resize', () => {
      if (graphEngine) {
        const container = document.getElementById('graph-canvas');
        graphEngine.width(container.clientWidth).height(container.clientHeight);
      }
    });

    // Run on startup
    window.onload = () => {
      renderBreadcrumbs();
      renderGraph();
    };
  </script>
</body>
</html>`;
};
