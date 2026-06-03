import React, { useState, useEffect } from "react";
import { Network, Sparkles, RotateCcw } from "lucide-react";
import { TopicInput } from "./components/TopicInput";
import { MindmapCanvas } from "./components/MindmapCanvas";
import { DetailSidebar } from "./components/DetailSidebar";
import { Breadcrumbs } from "./components/Breadcrumbs";
import "./App.css";

interface Topic {
  id: string;
  title: string;
  description: string;
  content: string | null;
}

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

interface BreadcrumbItem {
  id: string;
  label: string;
}

export const App: React.FC = () => {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [nodes, setNodes] = useState<MindmapNode[]>([]);
  const [edges, setEdges] = useState<MindmapEdge[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    label: string;
    description: string;
    content: string | null;
    level: number;
  } | null>(null);

  // Active parent node details (in case of drill down)
  const [currentParentNode, setCurrentParentNode] = useState<{
    id: string;
    label: string;
    description: string;
    content: string | null;
    level: number;
    has_subgraph?: boolean;
  } | null>(null);

  // Dashboard state
  const [mindmaps, setMindmaps] = useState<Topic[]>([]);
  const [viewMode, setViewMode] = useState<"dashboard" | "create">("dashboard");

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [isDrillingDown, setIsDrillingDown] = useState(false);

  // Fetch available topics in database
  const fetchMindmaps = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/api/mindmaps");
      if (response.ok) {
        const data = await response.json();
        setMindmaps(data);
      }
    } catch (err) {
      console.error("Error fetching mindmaps list:", err);
    }
  };

  // Refetch list when returning to dashboard
  useEffect(() => {
    if (topic === null) {
      fetchMindmaps();
      setViewMode("dashboard");
    }
  }, [topic]);

  // Load an existing topic workspace
  const handleLoadMindmap = async (loadedTopic: Topic) => {
    setIsLoading(true);
    setStatusMessage(`Loading workspace '${loadedTopic.title}'...`);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/mindmap/${loadedTopic.id}/graph`);
      if (!response.ok) {
        throw new Error("Failed to load mindmap graph.");
      }
      const data = await response.json();
      setTopic(loadedTopic);
      setNodes(data.nodes);
      setEdges(data.edges);
      setBreadcrumbs([]);
      setSelectedNode(null);
      setCurrentParentNode(null);
    } catch (err) {
      console.error(err);
      alert("Error loading mindmap from Neo4j database.");
    } finally {
      setIsLoading(false);
      setStatusMessage("");
    }
  };

  // Submit main topic config to backend agents
  const handleTopicSubmit = async (topicTitle: string, guidelines: string) => {
    setIsLoading(true);
    setStatusMessage("Planner Agent: Decomposing topic...");
    
    // Simulate multi-agent steps updates
    const timer1 = setTimeout(() => {
      setStatusMessage("Homogenizer Agent: Linking and standardizing relationships...");
    }, 2500);

    const timer2 = setTimeout(() => {
      setStatusMessage("Saving graph nodes & properties to Neo4j database...");
    }, 5500);

    try {
      const response = await fetch("http://127.0.0.1:8000/api/mindmap/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicTitle, guidelines }),
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      if (!response.ok) {
        throw new Error("Failed to generate mindmap.");
      }

      const data = await response.json();
      setTopic(data.topic);
      setNodes(data.nodes);
      setEdges(data.edges);
      setBreadcrumbs([]);
      setSelectedNode(null);
      setCurrentParentNode(null);
    } catch (err) {
      console.error(err);
      alert("Error generating mindmap. Please verify backend is running and Gemini API key is configured.");
    } finally {
      setIsLoading(false);
      setStatusMessage("");
    }
  };

  // Generate detailed article content for a specific node
  const handleGenerateContent = async (nodeId: string, instructions: string) => {
    if (!topic) return;
    setIsGeneratingContent(true);

    try {
      const response = await fetch(`http://127.0.0.1:8000/api/mindmap/node/${nodeId}/generate-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      });

      if (!response.ok) {
        throw new Error("Failed to write article.");
      }

      const data = await response.json();
      
      // Update local nodes array
      setNodes((prevNodes) =>
        prevNodes.map((n) => (n.id === nodeId ? { ...n, content: data.content } : n))
      );
      
      // Update selected node state for sidebar
      if (selectedNode && selectedNode.id === nodeId) {
        setSelectedNode({ ...selectedNode, content: data.content });
      }

      // Update currentParentNode if active
      if (currentParentNode && currentParentNode.id === nodeId) {
        setCurrentParentNode({ ...currentParentNode, content: data.content });
      }

      // Update topic if active
      if (topic && topic.id === nodeId) {
        setTopic({ ...topic, content: data.content });
      }
    } catch (err) {
      console.error(err);
      alert("Failed to generate detailed node guide.");
    } finally {
      setIsGeneratingContent(false);
    }
  };

  // Perform drill down to expand a concept sub-graph
  const handleDrillDown = async (nodeId: string) => {
    if (!topic || !selectedNode) return;
    setIsDrillingDown(true);

    try {
      const response = await fetch(`http://127.0.0.1:8000/api/mindmap/node/${nodeId}/drill-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error("Failed to drill down.");
      }

      const data = await response.json();
      
      // Fetch breadcrumbs for the new level
      const breadcrumbRes = await fetch(`http://127.0.0.1:8000/api/mindmap/node/${nodeId}/breadcrumbs`);
      const breadcrumbData = await breadcrumbRes.json();

      setNodes(data.nodes);
      setEdges(data.edges);
      setBreadcrumbs(breadcrumbData.breadcrumbs);
      setCurrentParentNode(selectedNode);
      setSelectedNode(null); // Close sidebar
    } catch (err) {
      console.error(err);
      alert("Failed to build sub-graph for this concept.");
    } finally {
      setIsDrillingDown(false);
    }
  };

  // Handle levels breadcrumb navigation clicks
  const handleNavigate = async (levelId: string | null) => {
    if (!topic) return;

    if (levelId === null) {
      // Return to dashboard
      setTopic(null);
      setNodes([]);
      setEdges([]);
      setBreadcrumbs([]);
      setSelectedNode(null);
      setCurrentParentNode(null);
      return;
    }

    // Retrieve topic level
    let url = `http://127.0.0.1:8000/api/mindmap/${topic.id}/graph`;
    if (levelId !== "root") {
      url += `?parent_id=${levelId}`;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch graph level.");
      }

      const data = await response.json();
      setNodes(data.nodes);
      setEdges(data.edges);

      if (levelId === "root") {
        setBreadcrumbs([]);
        setCurrentParentNode(null);
      } else {
        // Fetch current active node details for center title
        const nodeDetailRes = await fetch(`http://127.0.0.1:8000/api/mindmap/node/${levelId}/breadcrumbs`);
        const breadcrumbData = await nodeDetailRes.json();
        setBreadcrumbs(breadcrumbData.breadcrumbs);

        // Fetch parent details from database
        try {
          const parentRes = await fetch(`http://127.0.0.1:8000/api/mindmap/node/${levelId}`);
          if (parentRes.ok) {
            const parentData = await parentRes.json();
            setCurrentParentNode(parentData);
          }
        } catch (err) {
          console.error("Error fetching navigated parent node:", err);
        }
      }

      setSelectedNode(null);
    } catch (err) {
      console.error(err);
      alert("Error navigating graph levels.");
    }
  };

  // Reset the mindmap database and UI state
  const handleReset = async () => {
    if (!window.confirm("Are you sure you want to clear the database and start over?")) {
      return;
    }
    try {
      const response = await fetch("http://127.0.0.1:8000/api/mindmap/clear", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to clear database.");
      }
      
      // Reset local state to show initial configuration panel
      setTopic(null);
      setNodes([]);
      setEdges([]);
      setBreadcrumbs([]);
      setSelectedNode(null);
      setCurrentParentNode(null);
    } catch (err) {
      console.error(err);
      alert("Failed to reset graph.");
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand-section" onClick={() => setTopic(null)} style={{ cursor: "pointer" }}>
          <Network className="brand-logo" size={24} />
          <h1>Agentic Mindmap</h1>
        </div>

        {topic && (
          <Breadcrumbs
            breadcrumbs={breadcrumbs}
            rootTitle={topic.title}
            onNavigate={handleNavigate}
          />
        )}

        {topic && (
          <button onClick={handleReset} className="btn-reset-header">
            <RotateCcw size={14} />
            Reset Graph
          </button>
        )}
      </header>

      <main className="app-main">
        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-card card">
              <span className="spinner"></span>
              <p>{statusMessage}</p>
            </div>
          </div>
        )}

        {!topic ? (
          viewMode === "dashboard" ? (
            <div className="dashboard-container">
              <div className="dashboard-hero">
                <Network className="hero-logo" size={48} />
                <h2>AI Mindmaps Workspace</h2>
                <p>Navigate and explore your conceptual knowledge graphs, or start a new generation.</p>
                <button onClick={() => setViewMode("create")} className="btn btn-primary mt-3">
                  <Sparkles size={16} />
                  Create New Mindmap
                </button>
              </div>

              <h3 className="section-title">Your Stored Graphs ({mindmaps.length})</h3>
              
              {mindmaps.length > 0 ? (
                <div className="dashboard-grid">
                  {mindmaps.map((m) => (
                    <div key={m.id} className="mindmap-card card">
                      <div className="card-body">
                        <h3>{m.title}</h3>
                        <p>{m.description || "No description provided."}</p>
                      </div>
                      <div className="card-actions">
                        <button
                          onClick={() => handleLoadMindmap(m)}
                          className="btn btn-secondary w-full"
                        >
                          Load Workspace
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-dashboard card">
                  <Sparkles size={32} />
                  <p>No saved mindmaps found in your database.</p>
                  <button onClick={() => setViewMode("create")} className="btn btn-secondary mt-2">
                    Create Your First Graph
                  </button>
                </div>
              )}
            </div>
          ) : (
            // Splitted view for creation (Sidebar + placeholder canvas)
            <>
              <div className="app-sidebar">
                <div className="creation-nav-back">
                  <button onClick={() => setViewMode("dashboard")} className="btn-back-dashboard">
                    &larr; Back to Dashboard
                  </button>
                </div>
                <TopicInput
                  onSubmit={handleTopicSubmit}
                  isLoading={isLoading}
                  statusMessage={statusMessage}
                />
              </div>
              <div className="app-content">
                <div className="canvas-placeholder">
                  <div className="placeholder-card card">
                    <Sparkles size={48} />
                    <h3>No Active Mindmap</h3>
                    <p>
                      Use the left panel to submit a topic domain. AI agents will immediately draft
                      and structure a visual graph schema for you.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )
        ) : (
          // Active Mindmap Canvas Workspace
          (() => {
            const centerNode = currentParentNode 
              ? {
                  id: currentParentNode.id,
                  label: currentParentNode.label,
                  description: currentParentNode.description,
                  content: currentParentNode.content,
                  level: currentParentNode.level,
                  has_subgraph: currentParentNode.has_subgraph,
                }
              : topic 
              ? {
                  id: topic.id,
                  label: topic.title,
                  description: topic.description,
                  content: topic.content,
                  level: 0,
                  has_subgraph: false,
                }
              : null;

            return (
              <>
                <div className="app-content">
                  {centerNode && (
                    <MindmapCanvas
                      nodes={nodes}
                      edges={edges}
                      centerNode={centerNode}
                      onNodeClick={setSelectedNode}
                    />
                  )}
                </div>
                
                {selectedNode && (
                  <DetailSidebar
                    node={selectedNode}
                    onClose={() => setSelectedNode(null)}
                    onGenerateContent={handleGenerateContent}
                    onDrillDown={handleDrillDown}
                    isGeneratingContent={isGeneratingContent}
                    isDrillingDown={isDrillingDown}
                  />
                )}
              </>
            );
          })()
        )}
      </main>
    </div>
  );
};

export default App;
