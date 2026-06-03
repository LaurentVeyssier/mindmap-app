# Use a lightweight official Python image
FROM python:3.13-slim-bookworm

# Set system and app configurations
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

# Install uv for fast and secure dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency configuration and lock files
COPY pyproject.toml uv.lock ./

# Install project dependencies in a virtual environment (excluding dev packages)
RUN uv sync --frozen --no-install-project --no-dev

# Copy the actual application source code
COPY app ./app

# Expose the API port
EXPOSE 8000

# Start uvicorn server binding to 0.0.0.0
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
