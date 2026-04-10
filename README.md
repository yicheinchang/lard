# 🐱 Lard - Lazy AI-powered Resume Database (Monorepo)

An AI-powered, high-performance job application tracking system with automated data extraction, document management, and interview pipeline visualization.

---

## 🚀 Key Features

### 🤖 Intelligent AI Extraction
- **Multi-Strategy Parsing**: Automated extraction from URLs, PDFs, and raw text.
- **JSON-LD First**: Prioritizes structured Schema.org data for 100% extraction accuracy on modern job portals.
- **Agentic Pipeline**: Supports both high-speed Single-Agent mode and high-fidelity Multi-Agent mode (parallel field extraction).
- **Verbatim Descriptions**: Preserves original job description formatting and hierarchy in Markdown.

### 📊 Powerful Visualization
- **Dynamic Kanban**: Drag-and-drop job hunt pipeline with 4 standard stages.
- **Data Table**: High-fidelity list view with advanced sorting, filtering, and bulk actions.
- **Interview Tracking**: Manage every step (Name, Date, Status, Notes) with status synchronization.

### ⚡ Extreme Performance
- **Instant Backend Startup**: Reaches "Ready" state in **< 5 seconds** through lazy-loading and optimized reloader indexing.
- **Local Embedded Models**: Uses `all-MiniLM-L6-v2` for embeddings with a persistent local model cache.
- **Dynamic Settings**: Change LLM providers (Ollama, OpenAI, Anthropic) or themes in real-time via the UI.

---

## 📂 Project Structure

- **`/backend`**: FastAPI ecosystem. Handles data persistence (SQLAlchemy + SQLite), vector search (ChromaDB), and AI orchestration (LangGraph). Isolated from public access.
- **`/frontend`**: Next.js 15 + Tailwind CSS. Acts as the secure gateway via **API Proxying** and **Server Actions**.

---

## 🛠️ Getting Started

### 1. Setup & Installation
```bash
# Backend
cd backend
uv sync

# Frontend
cd frontend
npm install
```

### 2. Running in Development
```bash
# Start Backend (Optimized Reload)
cd backend
./run.sh dev

# Start Frontend
cd frontend
npm run dev
```

### 3. Running in Production
```bash
# Start Backend (4 Workers, No Reload)
cd backend
./run.sh prod
```

```

---

## 🐳 Docker Deployment (Recommended)

Run the entire stack with a single command using Docker Compose.

### 1. Requirements
- Docker and Docker Compose installed.
- Ollama running on the host (if using local models).

### 2. Configuration
Copy the environment template:
```bash
cp .env.example .env
```
Edit `.env` to add your OpenAI/Anthropic keys if needed.

### 3. Startup
```bash
docker-compose up -d --build
```
Access the application at **[http://localhost:8081](http://localhost:8081)**.

### 4. Persistence
All data is consolidated into a project-root **`/data`** directory, which is persisted across both local development and Docker.
- **SQLite**: `data/db/tracker.db`
- **Settings**: `data/app_settings.json`
- **Uploads**: `data/uploads/`
- **ChromaDB**: `data/chroma_db/`
- **AI Cache**: `data/huggingface/`

---

## 📚 Documentation
For detailed architecture, API endpoints, and optimization details, refer to:
- [Backend README](file:///home/Lard/backend/README.md)
- [Codebase Map](file:///home/Lard/codebase-map.md)

---
Built with ❤️ by Antigravity.
Current version: v0.56.7
