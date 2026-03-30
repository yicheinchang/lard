# Codebase Map: Job Tracker AI

This document provides a summary of the project's architecture, tech stack, and key logic to give AI coding agents instant context.

## 🚀 Tech Stack

### Backend
- **Core**: FastAPI (Python 3.14+)
- **ORM**: SQLAlchemy (SQLite)
- **Vector DB**: ChromaDB
- **AI Orchestration**: LangChain & LangGraph
- **Package Management**: `uv`

### Frontend
- **Framework**: Next.js 16 (App Router, React 19)
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript
- **Icons**: Lucide React
- **API Client**: Axios

---

## 📂 File Structure

### Root
- `/backend`: Core API and AI logic.
- `/frontend`: Next.js web application.

### Backend (`/backend`)
- `main.py`: Application entry point and router integration.
- `config.py`: Settings management (env vars + `app_settings.json`).
- `routers/`:
  - `jobs.py`: CRUD operations for jobs, interview steps, and documents.
  - `ai.py`: AI Assistant chat and data extraction endpoints.
  - `settings.py`: Application configuration endpoints.
- `database/`:
  - `models.py`: SQLAlchemy relational models.
  - `relational.py`: Database engine and session setup.
  - `vector_store.py`: ChromaDB integration for RAG.
- `ai/`:
  - `assistant.py`: LangGraph-based conversational agent logic.
  - `llm_factory.py`: Multi-provider support (Ollama, OpenAI, Anthropic).
  - `chains.py`: Specific LangChain sequences (e.g., for extraction).
  - `graph.py`: LangGraph state machine definitions.
- `uploads/`: Local storage for uploaded job documents.

### Frontend (`/frontend`)
- `src/app/`: Next.js routes (Layouts and Pages).
- `src/components/`: Reusable UI components:
  - `AppShell.tsx`: Main layout wrapper (Sidebar + Content area + AI Chat).
  - `KanbanBoard.tsx`: Drag-and-drop pipeline visualization.
  - `TableView.tsx`: Density-rich list view of applications.
  - `JobCard.tsx`: Individual job item in the Kanban board.
  - `JobDetailView.tsx`: Comprehensive slide-over for job details and document management.
  - `AddJobModal.tsx`: Multi-step form for new job entries and initial AI processing.
  - `ChatAssistant.tsx`: Semi-permanent drawer for the AI conversational agent.
  - `SettingsPage.tsx`: Integrated configuration for LLMs, themes, and system toggles.
- `src/lib/`:
  - `api.ts`: Axios client with typed backend endpoints.
  - `ViewContext.tsx`: Global UI state (Active view: Kanban/Table/Settings).
  - `SettingsContext.tsx`: Reactive application settings (Theme, AI status).

---

## 🎨 Frontend Architecture & UI Logic

The frontend is a **Single Page Application (SPA)** built with Next.js 16, utilizing a "Master-Detail" pattern with an overlay-based detailing system.

### 1. View Orchestration
The `AppShell` provides the persistent UI (sidebar and chat), while `src/app/page.tsx` acts as the main view switcher. Transitioning between Dashboard (Kanban) and Table view is handled via the `ViewContext` to ensure state is preserved.

### 2. Job Detail System
Instead of separate routes, job details are shown in an overlay (`JobDetailView.tsx`). This allows for a fast, responsive user experience. The component handles:
- Status updates and timeline tracking.
- Document uploads and management.
- Detailed metadata editing.

### 3. Contextual AI Integration
The `ChatAssistant` is a global component accessible from any page. It maintains its own state and can be toggled via a floating action button or keyboard shortcuts.

### 4. Dynamic Theme Store
The UI uses Tailwind CSS 4 with CSS variables defined in `globals.css`. These variables are updated dynamically by the `SettingsContext`, supporting instant theme switching between Dark/Light and customizable accent colors.

---

## 📦 Core Data Models

Shared structures used for API communication and state management.

### 1. Job (`Job`)
The central entity representing a job application.
- `id`: Unique identifier.
- `status`: One of `Wishlist`, `Applied`, `Interviewing`, `Offered`, `Rejected`, `Closed`, `Discontinued`.
- `company` & `role`: Basic identifiers.
- `steps`: Array of `InterviewStep` objects.
- `documents`: Array of `DocumentMeta` objects (Job Post, Resume, etc.).
- `metadata`: Salary range, location, contact info (HR, Hiring Manager, Headhunter).

### 2. Interview Step (`InterviewStep`)
Timeline events for an application.
- `step_type`: `Phone Screen`, `Technical`, `Onsite`, etc.
- `status`: `Scheduled`, `Completed`, `Passed`, `Requested`.
- `step_date`: ISO timestamp.

### 3. App Settings (`AppSettings`)
Global configuration persisted on the server.
- `theme`: `dark` | `light` | `system`.
- `ai_enabled`: Global toggle for AI features.
- `llm_provider`: Choose between `ollama`, `openai`, `anthropic`.
- `embedding_provider`: Choose between `default` (HuggingFace local), `ollama`, `openai`.

---

## 🔌 API Endpoints (Prefix: `/api`)

### Jobs (`/jobs`)
- `GET /jobs`: List all applications.
- `POST /jobs/`: Create a new application (triggers vectorization).
- `PUT /jobs/{id}`: Update application details.
- `DELETE /jobs/{id}`: Remove application.
- `POST /jobs/{id}/documents`: Upload and vectorize PDF/Text files.
- `POST /jobs/{id}/steps`: Add interview timeline steps.

### AI (`/ai`)
- `POST /ai/chat`: Interactive chat with context from stored jobs/docs.
- `POST /ai/extract`: Extract job metadata from a URL.

### Settings (`/settings`)
- `GET /settings`: Retrieve current app configuration.
- `POST /settings`: Update LLM/Embedding providers and UI theme.

---

## 🧠 Critical Logic & Patterns

### 1. RAG (Retrieval-Augmented Generation)
When a job description is added or a document is uploaded, it is automatically processed and stored in **ChromaDB**. The AI Assistant uses these embeddings to provide context-aware answers about the user's specific job search.

### 2. Multi-Provider AI
The system is designed to be model-agnostic. Through `llm_factory.py`, it can switch between:
- **Local**: Ollama (default: `gemma3:4b-it-qat`)
- **Cloud**: OpenAI (GPT-4o) or Anthropic (Claude 3)

### 3. State Management (LangGraph)
The AI assistant uses **LangGraph** to manage conversational state, enabling multi-turn workflows and tool-calling (e.g., querying the database vs. searching documents).

### 4. Dynamic Configuration
Settings are not just environment variables. They are persisted in `backend/app_settings.json`, allowing the user to change providers or themes at runtime via the UI without restarting the server.

### 5. Document Ingestion
Supports PDF and plain text. PDFs are parsed using `pypdf` and split into chunks before vectorization.

---

## 🛠️ Development Commands

### Backend
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm run dev
```
