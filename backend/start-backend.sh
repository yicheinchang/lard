#!/bin/bash
# Optimized backend startup script for development
# Only watches source directories to bypass the massive .venv file scan.

echo "🚀 Starting Job Tracker Backend (Optimized)..."
uv run --no-sync uvicorn main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --reload \
  --reload-dir ai \
  --reload-dir routers \
  --reload-dir database \
  --reload-include main.py \
  --reload-include config.py
