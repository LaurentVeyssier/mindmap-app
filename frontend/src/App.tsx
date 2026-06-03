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

interface LoadingStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "failed";
  message: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

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
  const [loadingSteps, setLoadingSteps] = useState<LoadingStep[]>([]);

  // Helper to read NDJSON stream from agent endpoints
  const handleStreamResponse = async (
    response: Response,
    onStepUpdate: (stepId: string, status: "pending" | "active" | "done" | "failed", message: string) => void,
    onCompleted: (data: any) => void
  ) => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("ReadableStream not supported by browser");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.status === "error") {
          throw new Error(event.message || "Unknown error occurred during execution.");
        }
        if (event.status === "completed") {
          onCompleted(event.data);
          return;
        }
        if (event.step) {
          onStepUpdate(event.step, event.status, event.message || "");
        }
      }
    }

    if (buffer.trim()) {
      const event = JSON.parse(buffer);
      if (event.status === "error") {
        throw new Error(event.message || "Unknown error occurred during execution.");
      }
      if (event.status === "completed") {
        onCompleted(event.data);
        return;
      }
      if (event.step) {
        onStepUpdate(event.step, event.status, event.message || "");
      }
    }
  };

  // Fetch available topics in database
  const fetchMindmaps = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/mindmaps`);
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
      const response = await fetch(`${API_BASE_URL}/api/mindmap/${loadedTopic.id}/graph`);
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
    setStatusMessage("Initializing graph generation...");
    setLoadingSteps([
      { id: "planner", label: "Planner Agent", status: "pending", message: "" },
      { id: "critic", label: "Critic Agent", status: "pending", message: "" },
      { id: "db", label: "Neo4j Database Sync", status: "pending", message: "" }
    ]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/mindmap/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicTitle, guidelines }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Failed to generate mindmap.");
      }

      let completedData: any = null;
      await handleStreamResponse(
        response,
        (stepId, status, message) => {
          setStatusMessage(message);
          setLoadingSteps((prev) =>
            prev.map((s) => (s.id === stepId ? { ...s, status, message } : s))
          );
        },
        (data) => {
          completedData = data;
        }
      );

      if (completedData) {
        setTopic(completedData.topic);
        setNodes(completedData.nodes);
        setEdges(completedData.edges);
        setBreadcrumbs([]);
        setSelectedNode(null);
        setCurrentParentNode(null);
      } else {
        throw new Error("No data returned from generation stream.");
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error generating mindmap: ${err.message || err}`);
    } finally {
      setIsLoading(false);
      setStatusMessage("");
      setLoadingSteps([]);
    }
  };

  // Generate detailed article content for a specific node
  const handleGenerateContent = async (nodeId: string, instructions: string) => {
    if (!topic) return;
    setIsGeneratingContent(true);
    setIsLoading(true);
    setStatusMessage("Initializing content generation...");
    setLoadingSteps([
      { id: "writer", label: "Content Writer Agent", status: "pending", message: "" },
      { id: "critic", label: "Critic Agent", status: "pending", message: "" },
      { id: "db", label: "Neo4j Database Sync", status: "pending", message: "" }
    ]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/mindmap/node/${nodeId}/generate-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Failed to generate content.");
      }

      let completedData: any = null;
      await handleStreamResponse(
        response,
        (stepId, status, message) => {
          setStatusMessage(message);
          setLoadingSteps((prev) =>
            prev.map((s) => (s.id === stepId ? { ...s, status, message } : s))
          );
        },
        (data) => {
          completedData = data;
        }
      );

      if (completedData) {
        // Update local nodes array
        setNodes((prevNodes) =>
          prevNodes.map((n) => (n.id === nodeId ? { ...n, content: completedData.content } : n))
        );
        
        // Update selected node state for sidebar
        if (selectedNode && selectedNode.id === nodeId) {
          setSelectedNode({ ...selectedNode, content: completedData.content });
        }

        // Update currentParentNode if active
        if (currentParentNode && currentParentNode.id === nodeId) {
          setCurrentParentNode({ ...currentParentNode, content: completedData.content });
        }

        // Update topic if active
        if (topic && topic.id === nodeId) {
          setTopic({ ...topic, content: completedData.content });
        }
      } else {
        throw new Error("Stream closed without completed payload.");
      }
    } catch (err: any) {
      console.error(err);
      alert(`Failed to generate detailed node guide: ${err.message || err}`);
    } finally {
      setIsGeneratingContent(false);
      setIsLoading(false);
      setStatusMessage("");
      setLoadingSteps([]);
    }
  };

  // Perform drill down to expand a concept sub-graph
  const handleDrillDown = async (nodeId: string) => {
    if (!topic || !selectedNode) return;
    setIsDrillingDown(true);
    setIsLoading(true);
    setStatusMessage("Initializing sub-graph generation...");
    setLoadingSteps([
      { id: "planner", label: "Planner Agent", status: "pending", message: "" },
      { id: "critic", label: "Critic Agent", status: "pending", message: "" },
      { id: "db", label: "Neo4j Database Sync", status: "pending", message: "" }
    ]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/mindmap/node/${nodeId}/drill-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Failed to drill down.");
      }

      let completedData: any = null;
      await handleStreamResponse(
        response,
        (stepId, status, message) => {
          setStatusMessage(message);
          setLoadingSteps((prev) =>
            prev.map((s) => (s.id === stepId ? { ...s, status, message } : s))
          );
        },
        (data) => {
          completedData = data;
        }
      );

      if (completedData) {
        // Fetch breadcrumbs for the new level
        const breadcrumbRes = await fetch(`${API_BASE_URL}/api/mindmap/node/${nodeId}/breadcrumbs`);
        const breadcrumbData = await breadcrumbRes.json();

        setNodes(completedData.nodes);
        setEdges(completedData.edges);
        setBreadcrumbs(breadcrumbData.breadcrumbs);
        setCurrentParentNode(selectedNode);
        setSelectedNode(null); // Close sidebar
      } else {
        throw new Error("Stream closed without completed payload.");
      }
    } catch (err: any) {
      console.error(err);
      alert(`Failed to build sub-graph for this concept: ${err.message || err}`);
    } finally {
      setIsDrillingDown(false);
      setIsLoading(false);
      setStatusMessage("");
      setLoadingSteps([]);
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
    let url = `${API_BASE_URL}/api/mindmap/${topic.id}/graph`;
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
        const nodeDetailRes = await fetch(`${API_BASE_URL}/api/mindmap/node/${levelId}/breadcrumbs`);
        const breadcrumbData = await nodeDetailRes.json();
        setBreadcrumbs(breadcrumbData.breadcrumbs);

        // Fetch parent details from database
        try {
          const parentRes = await fetch(`${API_BASE_URL}/api/mindmap/node/${levelId}`);
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
      const response = await fetch(`${API_BASE_URL}/api/mindmap/clear`, {
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
            <div className="loading-card card" style={{ maxWidth: "450px", width: "95%" }}>
              {loadingSteps.length > 0 ? (
                <>
                  <div style={{ marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {loadingSteps.some(s => s.id === "writer")
                        ? "Generating Detailed Guide"
                        : currentParentNode
                        ? "Expanding Sub-graph"
                        : "Generating Mindmap"}
                    </h3>
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "6px" }}>
                      Please wait while our agents collaborate.
                    </p>
                  </div>
                  
                  <div className="loading-steps" style={{ textAlign: "left", width: "100%" }}>
                    <div className="step-indicator">
                      {loadingSteps.map((step, index) => (
                        <div key={step.id} className={`step-item ${step.status}`}>
                          <div className="step-bullet">
                            {step.status === "done" ? "✓" : step.status === "failed" ? "✗" : index + 1}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
                            <span style={{ fontWeight: 600 }}>{step.label}</span>
                            {step.message && (
                              <span className="status-toast" style={{ fontSize: "11px", fontStyle: "normal", color: "var(--text-secondary)", marginTop: "2px" }}>
                                {step.message}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <span className="spinner"></span>
                  <p>{statusMessage}</p>
                </>
              )}
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
