# Product Definition - Agentic Mindmap

## Purpose
The Agentic Mindmap application allows users to explore complex topics by generating detailed, hierarchical, and structured mindmaps. A set of specialized agents collaborates to decompose a main topic into balanced, non-overlapping concepts, link them with standardized relationships, and allow the user to generate deep articles (content) and sub-graphs (drill-downs) interactively.

## Target Audience & Personas
*   **Researchers & Students**: Looking to quickly build a structured visual schema of a new subject.
*   **Writers & Content Creators**: Seeking to decompose complex topics into sections, generate articles for specific nodes, and export the resulting structures.
*   **Developers & Knowledge Architects**: Seeking an agent-driven graph database (Neo4j) builder to visually query and manipulate knowledge representations.

## Key Features
1.  **Topic Configuration**: Input a primary topic with custom formatting guidelines, areas of focus, or background context.
2.  **Macro-Level Decomposition**: The agent divides the main topic into 6 to 10 concepts of similar conceptual size/significance.
3.  **Disjoint Concept Guarantee**: The agent ensures nodes are disjointed to prevent redundancy.
4.  **Relationship Homogenization**: Standardizes edge types (e.g., standardizing "is a part of", "makes up", "comprises" into `PART_OF`).
5.  **Interactive Graph Visualization**: Fully zoomable, panable, and draggable interactive canvas powered by React Flow.
6.  **Node Content Generation**: Select any node and request the agent to write a detailed markdown article for it, optionally supplying extra writing guidelines.
7.  **Sub-graph Drill-down**: Click a node to generate a sub-graph detailing that specific node's sub-topics, moving the UI focus into a new hierarchical level.
8.  **Breadcrumb Navigation**: Seamlessly navigate up and down the mindmap hierarchy.
9.  **Direct Neo4j Sync**: Write to and read from a live Neo4j database instance in real time.
10. **Mindmaps Dashboard**: View and list all previously generated topics in a sleek dashboard grid, allowing the user to select and load any prior knowledge graph workspace instantly.
11. **Real-time Construction Progress**: Dynamic step-by-step progress overlay mapping Plan/Write drafting, Critic validation, and Neo4j DB sync stages in real time via NDJSON stream parsing.
12. **State-Aware MECE Subgraph Isolation**: Injecting positive lineages (breadcrumbs) and negative space boundaries (all other nodes currently in the graph) to keep subgraphs bounded and semantically distinct.
13. **Altitude-Shifting Zoom**: Forcing the agent to switch from strategic/architectural terminology (root topic level) down to tactical/operational implementation details (drill-down levels).

