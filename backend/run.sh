#!/bin/bash
# Unified startup script for Lard Backend
# Usage: ./run.sh [dev|prod]

MODE=${1:-dev}

if [ "$MODE" = "prod" ]; then
    echo "🚀 Starting Lard Backend (Production Mode)..."
    # Production: Multi-worker, no reload, optimized logging
    uv run uvicorn main:app \
      --host 0.0.0.0 \
      --port 8000 \
      --workers 4 \
      --log-level info \
      --no-access-log
else
    echo "🚀 Starting Lard Backend (Development Mode - Optimized)..."
    # Development: Targeted reloader to bypass large .venv scan, no-sync for speed
    uv run --no-sync uvicorn main:app \
      --host 0.0.0.0 \
      --port 8000 \
      --reload \
      --reload-dir ai \
      --reload-dir routers \
      --reload-dir database \
      --reload-include main.py \
      --reload-include config.py \
      --reload-exclude '.venv/*' \
      --reload-exclude 'node_modules/*'
fi
