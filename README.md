# 🐱 Lard - Lazy AI-powered Resume Database

![Lard Logo](assets/Lard-icon.png)

### **Automated extraction • Interview tracking • RAG-powered Chat**

An AI-powered, high-performance job application tracking system with automated data extraction, document management, and interview pipeline visualization.

[Features](#🚀-key-features) • [Getting Started](#🛠️-getting-started) • [Docker](#🐳-docker-deployment-recommended) • [Docs](#📚-documentation)

---

## 📸 Application Showcase

### Dashboard & Kanban Pipeline
![Dashboard Screenshot](assets/Screenshot-dashboard.png)

### Intelligent AI Extraction
![Add Job Screenshot](assets/Screenshot-addJob.png)

### Advanced Configuration
![Settings Screenshot](assets/Screenshot-settings.png)

---

## 🚀 Key Features

### 🤖 Intelligent AI Extraction
- **JSON-LD First**: Prioritizes structured Schema.org data for 100% extraction accuracy.
- **Modern Extraction**: Uses **Docling** for high-fidelity extraction of `.docx` and `.html` files with automated preloading for sub-10s cold starts.
- **Agentic Pipeline**: Supports both high-speed Single-Agent mode and high-fidelity Multi-Agent mode.
- **Strict Validation**: Implements RFC-compliant `NameEmail` and `HttpUrl` validation with automated name extraction via Pydantic v2 `model_validators`.
- **Field-Level Feedback**: Global error handling provides specific, human-readable feedback (e.g., `[hr_email]: invalid format`) directly to the frontend.
- **Dynamic Prompt Sync**: Centralized prompt engineering in the backend ensures the UI and AI logic remain perfectly synchronized.

### 📊 Powerful Visualization
- **Dynamic Kanban**: Drag-and-drop pipeline with a specialized **Tabbed Mobile UI** for focused single-column tracking on small screens.
- **Data Table**: High-fidelity list view with advanced sorting, filtering, and density-rich tooltips.
- **Interview Tracking**: Manage every step with full CRUD, inline editing, and lifecycle guards (Applied/Interviewing status synchronization).

### ⚡ Extreme Performance
- **Extreme Frontend Performance**: Utilizes **Next.js 16 `after()` hooks** for non-blocking audit logging and background tasks.
- **Instant Backend Startup**: Cold start in **< 5 seconds** via background eager loading and `app_factory` patterns.
- **Local Embedded Models**: Uses `all-MiniLM-L6-v2` with a persistent local model cache.
- **Dynamic Settings**: Change LLM providers, models, or themes in real-time with **Deep Merge** settings persistence.

---

## 📂 Project Structure

- **`/backend`**: FastAPI ecosystem (Python 3.14+). Handles data persistence (SQLite), vector search (ChromaDB), and AI orchestration (LangGraph v1.0).
- **`/frontend`**: Next.js 16 + React 19 + Tailwind CSS 4. Acts as the secure gateway via **API Proxying** and **Server Actions**.
- **`/assets`**: Project icons, screenshots, and documentation media.

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
The application uses a unified configuration system. Copy the environment template to get started:
```bash
cp .env.example .env
```
### 3. Startup

#### Option A: Docker Compose (Recommended)
```bash
docker-compose up -d --build
```
Access the application at **[http://localhost:8081](http://localhost:8081)**.

#### Option B: Manual Docker Commands
If `docker-compose` is unavailable, use these commands to set up networking and start the containers:

```bash
# 1. Create Network & Volume
docker network create lard-net
docker volume create lard-data-vol

# 2. Build Images
docker build -t lard-backend ./backend
docker build -t lard-frontend ./frontend

# 3. Run Backend
docker run -d \
  --name lard-backend \
  --network lard-net \
  --add-host=host.docker.internal:host-gateway \
  -v lard-data-vol:/app/data \
  -e RUNNING_IN_DOCKER=true \
  -e LARD_DATA_DIR=/app/data \
  -e LARD_OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  lard-backend

# 4. Run Frontend
docker run -d \
  --name lard-frontend \
  --network lard-net \
  -p 3030:3000 \
  -e INTERNAL_BACKEND_URL=http://lard-backend:8000 \
  lard-frontend
```
Access the application at **[http://localhost:3030](http://localhost:3030)**.

### 4. Persistence
All data is consolidated into a project-root **`/data`** directory, which is persisted across both local development and Docker.
- **SQLite**: `data/db/tracker.db` and `data/db/ai_history.db`.
- **Settings**: `data/app_settings.json` (Supports Deep Merging).
- **Uploads**: `data/uploads/`
- **ChromaDB**: `data/chroma_db/`
- **AI Cache**: `data/huggingface/`
- **AI Logs**: `data/tmp/`

---

## 📚 Documentation
For detailed architecture, API endpoints, and optimization details, refer to:
- [Backend README](file:///home/Lard/backend/README.md)
- [Frontend README](file:///home/Lard/frontend/README.md)
- [Codebase Map](file:///home/Lard/codebase-map.md)
---
## 📜 License
This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for more details.

---
Built with ❤️ by Antigravity.
Final version synchronized with v0.84.0.
