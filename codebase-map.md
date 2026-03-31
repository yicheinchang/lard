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
- `.agents/rules/`: Operational rules and roles for AI completion.

### Backend (`/backend`)
- `main.py`: Application entry point and router integration.
- `config.py`: Settings management (env vars + `app_settings.json`).
- `routers/`:
  - `jobs.py`: 
    *   `Company`: Represents a company/organization. Ensures consistency.
    *   `JobApplication`: Tracks job details, status, and linked documents/steps. Linked to `Company`.
    *   `InterviewStep`: Individual process steps (e.g., "Phone Screen").
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
  - `JobDetailView.tsx`: Core component for job application management. Consists of multiple tabs including "Interview Pipeline", "Job Details", and "Application Notes". Integrates `MdEditor` for rich text editing and `ReactMarkdown` with `prose` for rendering.
  - `AddJobModal.tsx`: Core form for new applications. Includes AI Auto-fill, file attachment, and **Duplication Detection** prompts.
  - `ConfirmDialog.tsx`: Reusable modal for user confirmations (e.g., "Add Anyway", "Discard Changes").
  - `MdEditor`: Markdown editor component.
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
- Status updates and timeline tracking (includes virtual "Applied" system events).
- Document uploads and management.
- Detailed metadata editing (including independent "Record Created" and "Applied" dates).
- Application advancement triggers (e.g., prompting for application date when moving from Wishlist to Applied).

### 3. Contextual AI Integration
The `ChatAssistant` is a global component accessible from any page. It maintains its own state and can be toggled via a floating action button or keyboard shortcuts.

### 4. Dynamic Theme Store
The UI uses Tailwind CSS 4 with `globals.css`: Global CSS containing theme variables, glassmorphism utilities, and the `@plugin "@tailwindcss/typography"` registration for Markdown rendering. These variables are updated dynamically by the `SettingsContext`, supporting instant theme switching between Dark/Light and customizable accent colors. Key components like `JobDetailView` and `KanbanBoard` are fully theme-aware, ensuring readability in both Light and Dark modes.

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

## 🗄️ Data Storage & Persistence

### 1. Relational Database (SQLAlchemy + SQLite: `tracker.db`)

#### `job_applications`
- `id`: (Integer, PK)
- `company`: (String)
- `role`: (String)
- `status`: (String) Pipeline stage: Wishlist, Applied, etc.
- `url`: (String) Application web link.
- `job_posted_date`, `application_deadline`: (DateTime)
- `company_job_id`, `location`, `salary_range`: (String)
- `description`: (Text, Markdown)
- `notes`: (Text, Markdown) User notes.
- `hr_email`, `hiring_manager_name`, `hiring_manager_email`: (String)
- `applied_date`: (DateTime) The date the application was actually submitted.
- `created_at`: (DateTime) The date the record was first added to the system.
- `last_updated`: (DateTime)

#### `interview_steps`
- `id`: (Integer, PK)
- `job_application_id`: (FK -> `job_applications.id`)
- `step_type_id`: (FK -> `step_types.id`)
- `step_date`: (DateTime)
- `status`: (String) Scheduled, Completed, etc.
- `notes`: (Text) Specific step feedback.

#### `step_types` & `documents`
- `step_types`: Configuration table for unique interview types.
- `documents`: Metadata/paths for PDFs and MD files.

### 2. Vector Store (ChromaDB: `chroma_db/`)

- **Collection**: `jobs_collection`
- **Embedding Logic**: Hybrid (Ollama/OpenAI/Local fallback).
- **Document Categorization** (`metadata.type`):
  - `job_description`: Primary job text (Source ID: `job_{id}`).
  - `document`: Uploaded files (Source ID: `doc_{id}`).
  - `job_notes`: User-provided Markdown notes (Source ID: `job_notes_{id}`).
- **Chunking Strategy**: RecursiveCharacterTextSplitter (1000/200 overlap).

---

## 🔌 API Endpoints (Prefix: `/api`)

### Jobs (`/jobs`)
- `GET /jobs`: List all applications.
- `POST /api/jobs/`: Create new application. Performs auto-linkage to `Company`.
- `POST /api/jobs/check-duplicate`: Logic for exact (URL/JobID) and similar (Role) matches.
- `GET /api/companies`: List of known companies for suggestions.
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

### 1. Note Ingestion & RAG
When `JobApplication.notes` is updated via the integrated editor in the **Job Details** tab, the change triggers an automatic re-ingestion of the text into ChromaDB under the `job_notes` type. This ensures the AI Assistant can retrieve the user's personal thoughts and research during chat sessions.

### 2. Multi-Provider AI
The system is designed to be model-agnostic. Through `llm_factory.py`, it can switch between:
- **Local**: Ollama (default: `gemma3:4b-it-qat`)
- **Cloud**: OpenAI (GPT-4o) or Anthropic (Claude 3)

### 3. Agent Operational Rules
The workspace uses a formalized rule system in `.agents/rules/workspace-role.md` to ensure:
- **Micro Git Commits**: Atomic, granular commits for every stable change.
- **Synchronized Versioning**: Automated SemVer updates across backend and frontend.
- **Codebase Map Sync**: Mandatory updates to this document to maintain architectural context.
- **Git Tagging**: Automated tagging for every version bump.

### 3. State Management (LangGraph)
The AI assistant uses **LangGraph** to manage conversational state, enabling multi-turn workflows and tool-calling (e.g., querying the database vs. searching documents).

### 4. Dynamic Configuration
Settings are not just environment variables. They are persisted in `backend/app_settings.json`, allowing the user to change providers or themes at runtime via the UI without restarting the server.

### 5. AI Extraction & Preprocessing
The system uses a multi-stage pipeline to extract job details from URLs, PDFs, and text:
- **HTML Cleaning**: Generic BeautifulSoup-based cleaning removes `script`, `nav`, `footer`, and `header` tags to isolate the job description.
- **Verbatim Extraction**: The LLM prompt is optimized to extract text VERBATIM without rephrasing or adding inferred labels, preserving the original sentence structure and wording.
- **Markdown Conversion**: The AI is instructed to convert the extracted job description into structured Markdown (headers, lists, etc.) while keeping the original content intact.

### 6. Document Ingestion
Supports PDF and plain text. PDFs are parsed using `pypdf` and split into chunks before vectorization.

### 7. Centralized Navigation Guard
The system uses a global navigation guard managed within `ViewContext.tsx`. This pattern protects against accidental data loss:
- **Dirty State Tracking**: Components (like `JobDetailView` and `SettingsPage`) report their "dirty" status and a contextual warning message to the `ViewContext`.
- **Action Interception**: All disruptive actions (view changes, job selection, opening modals) are wrapped in a `requestAction` call.
- **Global Prompt**: If the system is dirty, a centralized `ConfirmDialog` in `AppShell.tsx` intercepts the action and prompts the user to either discard changes or stay on the current page.

### 8. Modal State Management
Modals (like `AddJobModal.tsx`) are designed to be idempotent. They utilize `useEffect` hooks to reset their internal form state to `initialFormData` every time they are opened, ensuring no stale data persists from previous interactions.

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
