# Technical Stack & Conventions - Agentic Mindmap

## Frontend Stack
*   **Framework**: React (Vite + TypeScript)
*   **Styling**: Vanilla CSS (No TailwindCSS, utilizing CSS Custom Properties for themes, transitions, and glassmorphism layouts)
*   **Graph Library**: `react-force-graph-2d` (with custom canvas nodes, link styling, D3 forces, and dynamic mobile spacing)
*   **State Management**: React Context / Hooks for state orchestration
*   **Build Tool**: Vite

## Backend Stack
*   **Runtime & Package Manager**: Python >= 3.13, managed using `uv`
*   **Framework**: FastAPI (supporting real-time NDJSON progress streams using StreamingResponse)
*   **LLM Integration**: `google-genai` SDK (`from google import genai`)
*   **Model Configuration (configurable via `.env`)**:
    *   **Primary LLM Model**: `gemini-2.5-flash` (for drafting planned structures and node articles)
    *   **Critic LLM Model**: `gemini-3.5-flash` (stronger LLM for review validation and isolation constraints)
*   **Database**: Neo4j (using official `neo4j` package driver with breadcrumbs hierarchical tracking)
*   **Environment management**: `python-dotenv` and `pydantic-settings` for config loading and validation from `.env`

## Conventions & Rules
1.  **Code Validation**: Always validate python scripts using `uv run python -m py_compile <script_to_validate.py>` after editing/adding code.
2.  **Modular Code**: Implement clear, testable functions and classes. Place business/agent logic in specialized module files.
3.  **Documentation**: Every class and function must have a Python docstring specifying purpose, parameters, and return types. Use type hints throughout.
4.  **Logging**: Use the structured logging system (Python standard `logging` + `rich` handlers for color coding in outputs). Do NOT use print statements.
5.  **Test Organization**: Put test files under a `test/` directory, including an `__init__.py` file for imports.
