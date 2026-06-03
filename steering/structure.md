# Project Structure - Agentic Mindmap

This document defines the folder layout and module boundaries for the Agentic Mindmap codebase.

## Directory Layout

```
mindmap-app/
├── steering/
│   ├── product.md          # Product features and scenarios
│   ├── tech.md             # Tech stack, conventions, and rules
│   └── structure.md        # Folder structures and module map (this file)
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py       # Configuration & env variable validation (Pydantic Settings)
│   │   ├── logger.py       # Structured logging with Rich
│   │   ├── schemas.py      # Pydantic schemas for LLM outputs and API schemas
│   │   ├── neo4j_client.py # Neo4j Session and driver wrapper
│   │   ├── agents.py       # LLM Agent orchestration and prompt building
│   │   └── main.py         # FastAPI application and route endpoints
│   ├── test/
│   │   ├── __init__.py
│   │   ├── test_agents.py  # Unit tests for agents
│   │   └── test_neo4j.py   # Integration tests for database queries
│   ├── pyproject.toml      # Dependency specification
│   └── .env                # Local secrets (ignored in Git)
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── MindmapCanvas.tsx   # React Flow container
    │   │   ├── DetailSidebar.tsx   # Sidebar for reading/generating content
    │   │   ├── TopicInput.tsx      # Panel to input target topics & guidelines
    │   │   └── Breadcrumbs.tsx     # Drill-down depth tracking and navigation
    │   ├── App.tsx
    │   ├── App.css
    │   ├── main.tsx
    │   └── index.css
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts
```

## Module Responsibilities

### Backend

*   `app/config.py`: Loads and parses environment configuration using Pydantic BaseSettings. Validates Neo4j credentials and LLM API keys.
*   `app/logger.py`: Sets up a customized logger with Rich standard logging handler to present color-coded console logs.
*   `app/schemas.py`: Houses data models representing Neo4j graph nodes and edges, API payloads, and expected Gemini Pydantic schemas.
*   `app/neo4j_client.py`: Provides transaction methods to safely write, update, clear, and traverse graphs, fetch all stored topics, and retrieve other graph nodes for negative space boundaries.
*   `app/agents.py`: Uses the Google GenAI SDK to interact with the LLM. Implements drafting (Planner and Content Writer) and validation (Critic) agents using configured models and global MECE system instructions.
*   `app/main.py`: Sets up the web server, CORS policies, routes HTTP requests (including listing and retrieving mindmaps), and connects request payloads to backend agents.

### Frontend

*   `MindmapCanvas.tsx`: Renders nodes and edges using React Flow, manages layouts (e.g. concentric or tree-based coordinates), handles node selections, double clicks, or drag actions.
*   `DetailSidebar.tsx`: Allows users to trigger detail generations, display generated content in markdown format, and initiate drill-down calls.
*   `TopicInput.tsx`: Form for starting new mindmaps, specifying primary topics, guidelines, and checking database connections.
*   `Breadcrumbs.tsx`: Navigational helper tracking the current active parent node ID, rendering clickable links for all parent levels.
