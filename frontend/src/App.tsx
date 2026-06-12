import React, { useState, useEffect } from "react";
import { Network, Sparkles, RotateCcw, Download, Server, Loader2, AlertTriangle, RefreshCw, LogOut } from "lucide-react";
import { TopicInput } from "./components/TopicInput";
import { MindmapCanvas } from "./components/MindmapCanvas";
import { DetailSidebar } from "./components/DetailSidebar";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { Login } from "./components/Login";
import { generateStandaloneHtml } from "./utils/exportTemplate";
import "./App.css";

interface Topic {
  id: string;
  title: string;
  description: string;
  content: string | null;
  owner_email?: string | null;
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
  status: "pending" | "active" | "done" | "failed" | "disabled";
  message: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [userEmail, setUserEmail] = useState<string | null>(localStorage.getItem("userEmail"));
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [topic, setTopic] = useState<Topic | null>(null);

  // Decode JWT to extract admin status when token changes
  useEffect(() => {
    if (token) {
      try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(window.atob(base64));
        setIsAdmin(!!payload.is_admin);
      } catch (e) {
        console.error("Error decoding token:", e);
        setIsAdmin(false);
      }
    } else {
      setIsAdmin(false);
    }
  }, [token]);

  const [nodes, setNodes] = useState<MindmapNode[]>([]);
  const [edges, setMindmapEdges] = useState<MindmapEdge[]>([]); // named differently to avoid collision with setter
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
  const [backendStatus, setBackendStatus] = useState<"checking" | "waking_up" | "connected" | "failed">("checking");
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  // setEdges wrapper to match previous code
  const setEdges = (newEdges: MindmapEdge[]) => {
    setMindmapEdges(newEdges);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    setToken(null);
    setUserEmail(null);
    setIsAdmin(false);
    setTopic(null);
    setNodes([]);
    setEdges([]);
    setBreadcrumbs([]);
    setSelectedNode(null);
    setCurrentParentNode(null);
  };

  const handleLoginSuccess = (newToken: string, email: string) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("userEmail", email);
    setToken(newToken);
    setUserEmail(email);
  };

  // Custom fetch wrapper to inject Bearer token and handle 401 Unauthorized
  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...options.headers,
      "Authorization": `Bearer ${token}`
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      handleLogout();
      throw new Error("Session expired. Please log in again.");
    }
    return response;
  };

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
    if (!token) return;
    try {
      setConnectionAttempts((prev) => prev + 1);
      const response = await fetchWithAuth(`${API_BASE_URL}/api/mindmaps`);
      if (response.ok) {
        const data = await response.json();
        setMindmaps(data);
        setBackendStatus("connected");
        setConnectionAttempts(0);
      } else {
        setBackendStatus("failed");
      }
    } catch (err) {
      console.error("Error fetching mindmaps list:", err);
      setBackendStatus("waking_up");
    }
  };

  // Refetch list when returning to dashboard
  useEffect(() => {
    if (token && topic === null) {
      fetchMindmaps();
      setViewMode("dashboard");
    }
  }, [topic, token]);

  // Poll backend list when it's waking up
  useEffect(() => {
    if (token && backendStatus === "waking_up") {
      const timer = setTimeout(() => {
        fetchMindmaps();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [backendStatus, connectionAttempts, token]);

  // Load an existing topic workspace
  const handleLoadMindmap = async (loadedTopic: Topic) => {
    setIsLoading(true);
    setStatusMessage(`Loading workspace '${loadedTopic.title}'...`);
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/mindmap/${loadedTopic.id}/graph`);
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
      const response = await fetchWithAuth(`${API_BASE_URL}/api/mindmap/create`, {
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
      const response = await fetchWithAuth(`${API_BASE_URL}/api/mindmap/node/${nodeId}/generate-content`, {
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
      const response = await fetchWithAuth(`${API_BASE_URL}/api/mindmap/node/${nodeId}/drill-down`, {
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
        const breadcrumbRes = await fetchWithAuth(`${API_BASE_URL}/api/mindmap/node/${nodeId}/breadcrumbs`);
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
      const response = await fetchWithAuth(url);
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
        const nodeDetailRes = await fetchWithAuth(`${API_BASE_URL}/api/mindmap/node/${levelId}/breadcrumbs`);
        const breadcrumbData = await nodeDetailRes.json();
        setBreadcrumbs(breadcrumbData.breadcrumbs);

        // Fetch parent details from database
        try {
          const parentRes = await fetchWithAuth(`${API_BASE_URL}/api/mindmap/node/${levelId}`);
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
    if (!topic) return;
    if (!window.confirm("Are you sure you want to remove this mindmap graph? This will delete all its concepts and content.")) {
      return;
    }
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/mindmap/${topic.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete mindmap graph.");
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
      alert("Failed to delete graph.");
    }
  };

  // Fetches full graph data and triggers client-side download of standalone interactive HTML viewer
  const handleExportHtml = async () => {
    if (!topic) return;
    setIsLoading(true);
    setStatusMessage("Exporting interactive mindmap...");
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/mindmap/${topic.id}/export`);
      if (!response.ok) {
        throw new Error("Failed to export mindmap graph data.");
      }
      const data = await response.json();
      const htmlContent = generateStandaloneHtml(data);
      
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${topic.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-interactive-mindmap.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Export failed:", err);
      alert(`Export failed: ${err.message || err}`);
    } finally {
      setIsLoading(false);
      setStatusMessage("");
    }
  };

  if (!token) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

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

        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          {topic && (
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={handleExportHtml} className="btn-reset-header" style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(59, 130, 246, 0.12)", border: "1px solid rgba(59, 130, 246, 0.25)", color: "#93c5fd" }}>
                <Download size={14} />
                <span className="btn-text">Export HTML</span>
              </button>
              <button onClick={handleReset} className="btn-reset-header">
                <RotateCcw size={14} />
                <span className="btn-text">Remove Graph</span>
              </button>
            </div>
          )}
          
          <div className="user-profile-section">
            {isAdmin && <span className="admin-badge">ADMIN</span>}
            {userEmail && <span className="user-email-badge">{userEmail}</span>}
            <button onClick={handleLogout} className="btn-logout" title="Log Out">
              <LogOut size={14} />
              <span className="btn-text">Log Out</span>
            </button>
          </div>
        </div>
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
                            {step.status === "done" ? "✓" : step.status === "failed" ? "✗" : step.status === "disabled" ? "—" : index + 1}
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
                <button 
                  onClick={() => setViewMode("create")} 
                  className="btn btn-primary mt-3"
                  disabled={backendStatus !== "connected"}
                >
                  <Sparkles size={16} />
                  Create New Mindmap
                </button>
              </div>

              <h3 className="section-title">
                {backendStatus === "connected" ? `Your Stored Graphs (${mindmaps.length})` : "Your Stored Graphs"}
              </h3>

              {backendStatus === "checking" && (
                <div className="backend-connecting-card card">
                  <div className="connecting-content">
                    <Loader2 className="spinner icon-gold" size={32} />
                    <h3>Establishing connection to backend...</h3>
                    <p>Checking if the mindmap server is online.</p>
                  </div>
                </div>
              )}

              {backendStatus === "waking_up" && (
                <div className="backend-connecting-card card waking-up">
                  <div className="connecting-content">
                    <div className="pulsing-logo-container">
                      <Server className="pulsing-logo" size={40} />
                      <span className="ping-signal"></span>
                    </div>
                    <h3>Backend Server Waking Up</h3>
                    <p className="waking-up-desc">
                      The backend API service is hosted on Azure Container Apps and is currently cold-starting.
                      This usually takes 20 to 30 seconds as the container instance spins up.
                    </p>
                    <div className="progress-bar-container">
                      <div className="progress-bar-fill animate-progress"></div>
                    </div>
                    <div className="connection-attempt-info">
                      <span>Connection attempts: <strong>{connectionAttempts}</strong></span>
                      <button 
                        onClick={() => {
                          setBackendStatus("checking");
                          setConnectionAttempts(0);
                          fetchMindmaps();
                        }} 
                        className="btn btn-secondary btn-small mt-2"
                        style={{ width: "auto", display: "inline-flex", padding: "6px 12px", fontSize: "12px", height: "auto" }}
                      >
                        <RefreshCw size={12} className="animate-spin" />
                        Retry Now
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {backendStatus === "failed" && (
                <div className="backend-connecting-card card failed">
                  <div className="connecting-content">
                    <AlertTriangle className="icon-danger" size={40} />
                    <h3>Backend Connection Failed</h3>
                    <p className="waking-up-desc">
                      The backend server is online but returned an error or has database connectivity issues.
                      Please check the server status.
                    </p>
                    <button 
                      onClick={() => {
                        setBackendStatus("checking");
                        setConnectionAttempts(0);
                        fetchMindmaps();
                      }} 
                      className="btn btn-primary mt-2" 
                      style={{ width: "auto", display: "inline-flex", padding: "10px 16px" }}
                    >
                      <RefreshCw size={14} />
                      Retry Connection
                    </button>
                  </div>
                </div>
              )}

              {backendStatus === "connected" && (
                mindmaps.length > 0 ? (
                  <div className="dashboard-grid">
                    {mindmaps.map((m) => (
                      <div key={m.id} className="mindmap-card card" onClick={() => handleLoadMindmap(m)}>
                        <div className="card-body">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", width: "100%", overflow: "hidden" }}>
                            <h3>{m.title}</h3>
                            {m.owner_email && m.owner_email !== userEmail && (
                              <span className="card-owner-badge" title={`Owner: ${m.owner_email}`}>
                                {m.owner_email}
                              </span>
                            )}
                          </div>
                          <p>{m.description || "No description provided."}</p>
                        </div>
                        <div className="card-actions">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLoadMindmap(m);
                            }}
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
                )
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
                      selectedNodeId={selectedNode?.id || null}
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
