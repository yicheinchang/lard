#!/bin/bash
# Production startup script for Job Tracker Backend
# Disables file watching and optimizes for performance and concurrency.

echo "🚀 Starting Job Tracker Backend (Production)..."
uv run uvicorn main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 4 \
  --log-level info \
  --no-access-log
