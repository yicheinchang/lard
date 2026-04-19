# Stage 1: Builder
FROM python:3.14-slim AS builder

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1
# Use the local cache for uv
ENV UV_LINK_MODE=copy

# Install dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    uv sync --frozen --no-install-project --no-dev

# Stage 2: Runtime
FROM python:3.14-slim AS runtime

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app" \
    HF_HOME="/app/data/huggingface" \
    RUNNING_IN_DOCKER="true"

WORKDIR /app

# Create a non-root user
RUN addgroup --system app && adduser --system --group app

# Copy the virtual environment from the builder
COPY --from=builder /app/.venv /app/.venv

# Copy application code
COPY . .

# Ensure the central data directory exists and is owned by the app user
RUN mkdir -p /app/data && chown -R app:app /app/data

# The database and settings will be in the root of /app
# We'll mount these via volumes in docker-compose

USER app

EXPOSE 8000

# Optimized production entry point
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--log-level", "info", "--no-access-log"]
