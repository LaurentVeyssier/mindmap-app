import React, { useState, useEffect } from "react";
import { Sparkles, Activity, AlertCircle } from "lucide-react";

interface TopicInputProps {
  onSubmit: (topic: string, guidelines: string) => void;
  isLoading: boolean;
  statusMessage: string;
}

/**
 * Component for entering a topic and configuring guidelines for the mindmap generation.
 */
export const TopicInput: React.FC<TopicInputProps> = ({
  onSubmit,
  isLoading,
  statusMessage,
}) => {
  const [topic, setTopic] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [apiHealth, setApiHealth] = useState<{
    status: string;
    database: string;
    gemini: boolean;
  } | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(true);

  // Check backend health on mount
  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/health")
      .then((res) => res.json())
      .then((data) => {
        setApiHealth({
          status: data.status,
          database: data.database,
          gemini: data.gemini_api_key_configured,
        });
        setCheckingHealth(false);
      })
      .catch(() => {
        setApiHealth({ status: "offline", database: "disconnected", gemini: false });
        setCheckingHealth(false);
      });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    onSubmit(topic, guidelines);
  };

  return (
    <div className="topic-input-container card">
      <div className="card-header">
        <Sparkles className="icon-gold animate-pulse" size={24} />
        <h2>Create a Mindmap</h2>
      </div>
      <p className="card-description">
        Provide a topic. Our team of specialized AI agents will plan, decompose,
        and link the key concepts.
      </p>

      <form onSubmit={handleSubmit} className="topic-form">
        <div className="form-group">
          <label htmlFor="topic-field">Topic / Domain</label>
          <input
            id="topic-field"
            type="text"
            placeholder="e.g. Quantum Computing, Roman Empire..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={isLoading}
            required
            className="input-field"
          />
        </div>

        <div className="form-group">
          <label htmlFor="guidelines-field">Additional Context & Guidelines</label>
          <textarea
            id="guidelines-field"
            placeholder="e.g. Focus on modern applications, emphasize hardware limitations, structure for beginners..."
            value={guidelines}
            onChange={(e) => setGuidelines(e.target.value)}
            disabled={isLoading}
            rows={4}
            className="textarea-field"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || (apiHealth !== null && apiHealth.status === "offline")}
          className="btn btn-primary"
        >
          {isLoading ? (
            <span className="spinner-container">
              <span className="spinner"></span>
              Generating...
            </span>
          ) : (
            <>
              <Sparkles size={18} />
              Build Mindmap
            </>
          )}
        </button>
      </form>

      {/* Agents generation progress steps */}
      {isLoading && (
        <div className="loading-steps card-section">
          <h4>Agent Orchestration Status:</h4>
          <div className="step-indicator">
            <div className={`step-item ${statusMessage.includes("Planner") ? "active" : "done"}`}>
              <div className="step-bullet">1</div>
              <span>Decomposing Topic (Planner Agent)</span>
            </div>
            <div className={`step-item ${statusMessage.includes("Homogenizer") ? "active" : statusMessage.includes("persisting") || statusMessage.includes("Completed") ? "done" : ""}`}>
              <div className="step-bullet">2</div>
              <span>Homogenizing Relationships (Homogenizer Agent)</span>
            </div>
            <div className={`step-item ${statusMessage.includes("persisting") ? "active" : statusMessage.includes("Completed") ? "done" : ""}`}>
              <div className="step-bullet">3</div>
              <span>Syncing with Neo4j Aura Database</span>
            </div>
          </div>
          <p className="status-toast">{statusMessage}</p>
        </div>
      )}

      {/* Backend connection health check */}
      <div className="health-check-section card-footer">
        {checkingHealth ? (
          <div className="health-indicator checking">
            <span className="bullet animate-ping"></span>
            <span>Checking backend link...</span>
          </div>
        ) : apiHealth?.status === "offline" ? (
          <div className="health-indicator offline">
            <AlertCircle size={16} />
            <span>API Server is offline. Start backend server first.</span>
          </div>
        ) : (
          <div className="health-indicator online">
            <Activity size={16} />
            <span>
              Connected to Neo4j ({apiHealth?.database}) | Gemini (
              {apiHealth?.gemini ? "Ready" : "Key Missing"})
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
