import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { X, Sparkles, Network, ArrowRight } from "lucide-react";
import mermaid from "mermaid";

// Initialize mermaid with custom dark theme variables matching our glassmorphism aesthetics
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  themeVariables: {
    background: "transparent",
    primaryColor: "rgba(59, 130, 246, 0.15)",
    primaryBorderColor: "rgba(59, 130, 246, 0.3)",
    primaryTextColor: "#e2e8f0",
    lineColor: "rgba(255, 255, 255, 0.15)",
    secondaryColor: "rgba(245, 158, 11, 0.15)",
    tertiaryColor: "rgba(16, 185, 129, 0.15)",
    actorBkg: "rgba(255, 255, 255, 0.03)",
    actorBorder: "rgba(255, 255, 255, 0.1)",
  }
});

const MermaidRenderer: React.FC<{ chart: string }> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Clear previous SVG content to avoid duplication during updates
    containerRef.current.innerHTML = "";
    
    const id = `mermaid-${Math.floor(Math.random() * 100000)}`;
    const cleanChart = chart
      .replace(/^```mermaid\n?/i, "")
      .replace(/\n?```$/, "");

    try {
      mermaid.render(id, cleanChart).then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      }).catch((err) => {
        console.error("Mermaid render error:", err);
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre class="mermaid-error">Error parsing diagram: ${err.message || err}</pre>`;
        }
      });
    } catch (err: any) {
      console.error("Mermaid sync render error:", err);
      if (containerRef.current) {
        containerRef.current.innerHTML = `<pre class="mermaid-error">Error rendering diagram</pre>`;
      }
    }
  }, [chart]);

  return <div ref={containerRef} className="mermaid-chart" />;
};

interface NodeData {
  id: string;
  label: string;
  description: string;
  content: string | null;
  level: number;
}

interface DetailSidebarProps {
  node: NodeData | null;
  onClose: () => void;
  onGenerateContent: (nodeId: string, instructions: string) => void;
  onDrillDown: (nodeId: string) => void;
  isGeneratingContent: boolean;
  isDrillingDown: boolean;
}

/**
 * Sidebar drawer showing detailed properties, article editor, and actions for a selected concept node.
 */
export const DetailSidebar: React.FC<DetailSidebarProps> = ({
  node,
  onClose,
  onGenerateContent,
  onDrillDown,
  isGeneratingContent,
  isDrillingDown,
}) => {
  const [instructions, setInstructions] = useState("");

  if (!node) return null;

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerateContent(node.id, instructions);
  };

  return (
    <div className="detail-sidebar drawer">
      <div className="drawer-header">
        <div>
          <span className="node-badge">
            {node.level === 0 ? "Root Topic" : `Level ${node.level} Concept`}
          </span>
          <h3>{node.label}</h3>
        </div>
        <button onClick={onClose} className="btn-close" aria-label="Close panel">
          <X size={20} />
        </button>
      </div>

      <div className="drawer-content">
        <section className="drawer-section">
          <h4>Overview</h4>
          <p className="node-desc">{node.description}</p>
        </section>

        <section className="drawer-section border-top">
          <h4>Detailed Explanation</h4>
          {node.content ? (
            <div className="markdown-viewport">
              <ReactMarkdown
                components={{
                  code({ children, className, ...rest }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const isMermaid = match && match[1] === "mermaid";
                    if (isMermaid) {
                      return <MermaidRenderer chart={String(children).replace(/\n$/, "")} />;
                    }
                    return (
                      <code {...rest} className={className}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {node.content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="generate-content-prompt">
              <p>No detailed article has been generated for this concept yet.</p>
              
              <form onSubmit={handleGenerate} className="generation-form">
                <div className="form-group">
                  <label htmlFor="writer-instructions">Writer Instructions (Optional)</label>
                  <textarea
                    id="writer-instructions"
                    placeholder="e.g. Focus on practical code snippets, write in a casual tone, explain using the solar system analogy..."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    disabled={isGeneratingContent}
                    rows={3}
                    className="textarea-field"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isGeneratingContent}
                  className="btn btn-secondary w-full"
                >
                  {isGeneratingContent ? (
                    <span className="spinner-container">
                      <span className="spinner"></span>
                      Writing Article...
                    </span>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Generate Detailed Guide
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </section>

        {node.content && (
          <section className="drawer-section border-top regenerate-section">
            <details>
              <summary>Regenerate or update article guidelines</summary>
              <form onSubmit={handleGenerate} className="generation-form mt-2">
                <textarea
                  placeholder="e.g. Focus more on code examples..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  disabled={isGeneratingContent}
                  rows={2}
                  className="textarea-field"
                />
                <button
                  type="submit"
                  disabled={isGeneratingContent}
                  className="btn btn-secondary w-full mt-1"
                >
                  {isGeneratingContent ? "Writing..." : "Update Content"}
                </button>
              </form>
            </details>
          </section>
        )}

        {node.level > 0 && (
          <section className="drawer-section border-top actions-section">
            <h4>Explore Sub-topics</h4>
            <p className="section-help-text">
              Decompose this node further into its own dedicated sub-graph mindmap level.
            </p>
            <button
              onClick={() => onDrillDown(node.id)}
              disabled={isDrillingDown}
              className="btn btn-primary w-full"
            >
              {isDrillingDown ? (
                <span className="spinner-container">
                  <span className="spinner"></span>
                  Planning Sub-graph...
                </span>
              ) : (
                <>
                  <Network size={16} />
                  Drill Down into Concept
                  <ArrowRight size={16} className="ml-auto" />
                </>
              )}
            </button>
          </section>
        )}
      </div>
    </div>
  );
};
