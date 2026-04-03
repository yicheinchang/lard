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

- **`/backend`**: FastAPI ecosystem. Handles data persistence (SQLAlchemy + SQLite), vector search (ChromaDB), and AI orchestration (LangGraph).
- **`/frontend`**: Next.js 15 + Tailwind CSS. Provides a premium, theme-aware user experience with local persistence for layout adjustments.

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

---

## 📚 Documentation
For detailed architecture, API endpoints, and optimization details, refer to:
- [Backend README](file:///home/Lard/backend/README.md)
- [Codebase Map](file:///home/Lard/codebase-map.md)

---
Built with ❤️ by Antigravity.
Current version: v0.40.0
