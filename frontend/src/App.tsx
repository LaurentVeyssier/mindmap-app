import React, { useState } from "react";
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
}

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

interface BreadcrumbItem {
  id: string;
  label: string;
}

export const App: React.FC = () => {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [nodes, setNodes] = useState<MindmapNode[]>([]);
  const [edges, setEdges] = useState<MindmapEdge[]>([]);
  const [centerLabel, setCenterLabel] = useState<string>("");
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    label: string;
    description: string;
    content: string | null;
    level: number;
  } | null>(null);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [isDrillingDown, setIsDrillingDown] = useState(false);

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
      setCenterLabel(data.topic.title);
      setBreadcrumbs([]);
      setSelectedNode(null);
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
      setCenterLabel(selectedNode.label);
      setBreadcrumbs(breadcrumbData.breadcrumbs);
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
      // Return to homepage
      setTopic(null);
      setNodes([]);
      setEdges([]);
      setCenterLabel("");
      setBreadcrumbs([]);
      setSelectedNode(null);
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
        setCenterLabel(topic.title);
        setBreadcrumbs([]);
      } else {
        // Fetch current active node details for center title
        const nodeDetailRes = await fetch(`http://127.0.0.1:8000/api/mindmap/node/${levelId}/breadcrumbs`);
        const breadcrumbData = await nodeDetailRes.json();
        setBreadcrumbs(breadcrumbData.breadcrumbs);

        const activeCrumb = breadcrumbData.breadcrumbs.find((b: BreadcrumbItem) => b.id === levelId);
        if (activeCrumb) {
          setCenterLabel(activeCrumb.label);
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
      setCenterLabel("");
      setBreadcrumbs([]);
      setSelectedNode(null);
    } catch (err) {
      console.error(err);
      alert("Failed to reset graph.");
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand-section">
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
        {!topic ? (
          // Topic configuration homepage
          <div className="app-sidebar">
            <TopicInput
              onSubmit={handleTopicSubmit}
              isLoading={isLoading}
              statusMessage={statusMessage}
            />
          </div>
        ) : null}

        {/* Central interactive canvas */}
        <div className="app-content">
          {topic ? (
            <MindmapCanvas
              nodes={nodes}
              edges={edges}
              centerLabel={centerLabel}
              onNodeClick={setSelectedNode}
            />
          ) : (
            <div className="canvas-placeholder">
              <div className="placeholder-card card">
                <Sparkles size={48} />
                <h3>No Active Mindmap</h3>
                <p>
                  Use the left dashboard panel to submit a topic domain. AI agents will immediately draft
                  and structure a visual graph schema for you.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Selected node details editor side drawer */}
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
      </main>
    </div>
  );
};

export default App;
