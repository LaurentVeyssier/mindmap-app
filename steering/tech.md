# Technical Stack & Conventions - Agentic Mindmap

## Frontend Stack
*   **Framework**: React (Vite + TypeScript)
*   **Styling**: Vanilla CSS (No TailwindCSS, utilizing CSS Custom Properties for themes, transitions, and glassmorphism layouts)
*   **Graph Library**: React Flow (with custom nodes, customized edges, and layout options)
*   **State Management**: React Context / Hooks for state orchestration
*   **Build Tool**: Vite

## Backend Stack
*   **Runtime & Package Manager**: Python >= 3.13, managed using `uv`
*   **Framework**: FastAPI
*   **LLM Integration**: `google-genai` SDK (`from google import genai`)
*   **Primary LLM Model**: `gemini-2.5-flash`
*   **Database**: Neo4j (using official `neo4j` package driver)
*   **Environment management**: `python-dotenv` for loading secrets from `.env`

## Conventions & Rules
1.  **Code Validation**: Always validate python scripts using `uv run python -m py_compile <script_to_validate.py>` after editing/adding code.
2.  **Modular Code**: Implement clear, testable functions and classes. Place business/agent logic in specialized module files.
3.  **Documentation**: Every class and function must have a Python docstring specifying purpose, parameters, and return types. Use type hints throughout.
4.  **Logging**: Use the structured logging system (Python standard `logging` + `rich` handlers for color coding in outputs). Do NOT use print statements.
5.  **Test Organization**: Put test files under a `test/` directory, including an `__init__.py` file for imports.
