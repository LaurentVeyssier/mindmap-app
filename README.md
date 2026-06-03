# Agentic MECE Mindmap Builder

An enterprise-grade, agent-driven visual knowledge graph builder that decomposes complex subjects into **MECE (Mutually Exclusive, Collectively Exhaustive)** structural taxonomies. The system coordinates specialized Gemini agents (Planner, Content Writer, and Critic) to draft, refine, and dynamically drill down into concept subgraphs, persisted in real time to a **Neo4j Graph Database**.

---

## System Architecture & Process Flow

The diagram below outlines the end-to-end request flow. When a user submits a topic or drills down into a concept, the backend queries the database for context boundaries, routes lineage data to the drafting agents, triggers a Critic review cycle, persists the finalized structure, and streams real-time progression stages to the UI.

```mermaid
graph TD
    %% User Actions
    User[User Input] -->|1. Submit Topic / Drill Down| FE[Frontend React Flow UI]
    
    %% API Streams
    FE -->|2. POST Request| API[FastAPI Endpoints]
    
    %% Context Gathering
    API -->|3. Get Lineage & Sibling Boundaries| DB[(Neo4j Database)]
    DB -->|4. Positive Lineage & Negative Space| API
    
    %% Agent Orchestration
    API -->|5. Initial Draft Call| Planner[Planner Agent / Content Writer]
    Planner -->|6. JSON Schema Draft| Critic[Critic Agent]
    
    %% Critic Loop
    Critic -->|7. Evaluates Boundaries & MECE rules| CriticRule{Flaws Found?}
    CriticRule -->|Yes| Critic -->|8. Polish and Refine| FinalDraft[Finalized Plan / Article]
    CriticRule -->|No| FinalDraft
    
    %% DB Sync & UI Stream
    FinalDraft -->|9. Save Graph / Article| DB
    API -->|10. Stream NDJSON status lines| FE
    API -->|11. Send completed payload| FE
    FE -->|12. Render Nodes / Edges / Breadcrumbs| User
    
    %% Style custom colors
    classDef blue fill:#3b82f6,stroke:#1d4ed8,color:#fff;
    classDef green fill:#10b981,stroke:#047857,color:#fff;
    classDef gold fill:#f59e0b,stroke:#b45309,color:#fff;
    class FE,User blue;
    class API,Planner,Critic green;
    class DB gold;
```

---

## Key Features

### 1. MECE Decomposition (Mutually Exclusive, Collectively Exhaustive)
Guided by expert system instructions, the **Planner Agent** breaks down any domain into balanced, non-overlapping conceptual divisions (Level 1 concepts), radiating into exactly 3 distinct foundational sub-points (Level 2 leaves). Sibling concepts are vertically disjoint, maintaining clean thematic separation without duplicate cross-linking.

### 2. State-Aware Subgraph Isolation Protocol (Negative Space Boundaries)
To solve the classic semantic bleeding problem where a subgraph repeats parent-level concepts, the system uses a state-aware prompt protocol:
*   **Positive Lineage**: The exact breadcrumb path from the root topic is injected into the prompt.
*   **Negative Space**: A dynamic Cypher query maps every other active node in the graph. These nodes are fed to the agent as off-limits territory (boundaries) so the subgraph is strictly isolated.
*   **Altitude Zoom Control**: Forces the agent to transition from strategic/architectural terminology (high altitude) to tactical/operational implementation details (low altitude) when expanding subgraphs.

### 3. Double-Pass Critic Validation Cycle
Before saving graph changes or generating articles, a **Critic Agent** running on a stronger Gemini model (e.g. `gemini-3.5-flash`) reviews the candidates:
*   Analyzes structural disjointness, relationship naming, and guideline compliance.
*   *Strict Validation Rule*: The Critic only recommends changes or regenerates if it identifies flaws or missing dimensions; otherwise, it proceeds with the candidate immediately (no unnecessary latency).

### 4. Interactive Force Graph UI & Navigation
*   **Breadcrumbs Nav**: Tracks zoom level and anchors navigation back to root or intermediate parent subgraphs.
*   **Concentric Highlights**: Central hub lines are highlighted with golden glow links, while leaf lines use structural grey branches.
*   **Details Sidebar**: Allows selecting any node (including the root topic node) to read, update, or write markdown articles.

### 5. Multi-Graph Isolated Dashboard
*   Users can exit the active workspace to return to a visual homepage showing all saved mindmaps in a clean card layout.
*   Because every node and relationship is stamped with a unique `topic_id`, multiple independent mindmap workspaces are isolated and reloaded instantly on the same Neo4j database instance.

### 6. Real-time Progress Window
*   Generative actions return an `application/x-ndjson` stream.
*   The frontend uses a TextDecoder chunk parser to update a step-by-step progress checklist (Planner, Critic, DB Sync) in real time.

---

## Technology Stack

### Backend
*   **FastAPI**: API endpoints, CORS handling, and NDJSON streaming responses.
*   **Neo4j**: Database driver storing nodes, edges, properties, and hierarchy metadata.
*   **Google GenAI SDK**: Implements `google-genai` Client for structured schema outputs.
*   **uv**: Python packaging and environment manager.

### Frontend
*   **React + TypeScript + Vite**: Responsive Single Page App.
*   **React Flow**: Force graph canvas rendering.
*   **Vanilla CSS**: Glassmorphic panels, glowing boundaries, and custom CSS custom properties (no Tailwind CSS).

---

## Getting Started

### 1. Prerequisites
Ensure you have a running Neo4j Instance (Aura DB Free tier or local Desktop) and a Gemini API Key.

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create a `.env` file in the `backend/` directory:
   ```env
   NEO4J_URI=neo4j+s://<your-instance-url>
   NEO4J_USERNAME=neo4j
   NEO4J_PASSWORD=<your-password>
   NEO4J_DATABASE=neo4j
   GEMINI_API_KEY=<your-api-key>
   PRIMARY_MODEL=gemini-2.5-flash
   CRITIC_MODEL=gemini-3.5-flash
   ```
3. Sync python dependencies and run the server using `uv`:
   ```bash
   uv sync
   uv run uvicorn app.main:app --port 8000 --host 127.0.0.1
   ```

### 3. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:5173/`.


### AZURE CONTAINER APP DEPLOYMENT 
- .github\workflows\deploy-backend.yml