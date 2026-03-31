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
Instead of separate routes, job details are shown in a reactive overlay (`JobDetailView.tsx`). The component organizes data into three primary contexts:
- **Interview Pipeline**: Chronological timeline of events with inline status, name, and date editing. Supports manual addition and system events (e.g., virtual "Applied" marker).
- **Job Details**: Editable metadata (Company, Role, Salary, Dates) and Markdown-driven description rendering. Includes document management for Job Posts and Resumes.
- **Application Notes**: A dedicated Markdown editor for deep-dive research and interview preparation, synchronizing with the RAG system.
- **Workflow Triggers**: Contextual logic for status advancing (e.g., prompting for `applied_date` when moving from Wishlist to Applied) and deletion guards.

### 3. Contextual AI Integration
The `ChatAssistant` is a global component accessible from any page. It maintains its own state and can be toggled via a floating action button or keyboard shortcuts.

### 4. Dynamic Theme Store
The UI uses Tailwind CSS 4 with `globals.css`: Global CSS containing theme variables, glassmorphism utilities, and the `@plugin "@tailwindcss/typography"` registration for Markdown rendering. These variables are updated dynamically by the `SettingsContext`, supporting instant theme switching between Dark/Light and customizable accent colors. Key components like `JobDetailView` and `KanbanBoard` are fully theme-aware, ensuring readability in both Light and Dark modes.

---

## 📦 Core Data Models

Shared structures used for API communication and state management.

### 1. Job Application (`Job`)
The central entity representing a job application.
- `id`: Unique identifier (Integer).
- `company` & `role`: Brand and position (Strings).
- `status`: Lifecycle stage (Wishlist ... Discontinued).
- `steps`: Array of `InterviewStep` objects.
- `documents`: Array of `DocumentMeta` objects (Job Post, Resume, etc.).
- `description`: Markdown job description (Vectorized).
- `notes`: Markdown user notes (Vectorized).
- `dates`: includes `created_at`, `applied_date`, `job_posted_date`, and `application_deadline`.
- `metadata`: Salary range, location, and detailed contact info (HR/HM).

### 2. Interview Step (`InterviewStep`)
Timeline events for an application.
- `step_type`: Object containing `id` and `name` (e.g., "Onsite").
- `status`: Current state (Requested, Scheduled, Completed, Passed).
- `step_date`: ISO timestamp (Nullable).
- `notes`: Personal feedback or preparation notes.

### 3. App Settings (`AppSettings`)
Global configuration persisted on the server (`app_settings.json`).
- `theme`: `dark` | `light` | `system`.
- `ai_enabled`: Global boolean toggle.
- `extraction_mode`: `single` | `multi` (Decomposes extraction for small models).
- `providers`: Configurable LLM and Embedding sources (Ollama, OpenAI, Anthropic).

---

## 🗄️ Data Storage & Persistence

### 1. Relational Database (SQLAlchemy + SQLite: `tracker.db`)

#### `companies`
- `id`: (Integer, PK)
- `name`: (String, Unique) Centralized company name for consistency.

#### `job_applications`
- `id`: (Integer, PK)
- `company_id`: (FK -> `companies.id`, Nullable)
- `company`: (String, index) Redundant company name for display/legacy caching.
- `role`: (String)
- `status`: (String) Pipeline stage: Wishlist, Applied, Interviewing, Offered, Rejected, Closed, Discontinued.
- `url`: (String) Application web link.
- `job_posted_date`, `application_deadline`: (DateTime)
- `company_job_id`, `location`, `salary_range`: (String)
- `description`: (Text, Markdown)
- `notes`: (Text, Markdown) User notes, automatically vectorized for RAG.
- `hr_email`, `hiring_manager_name`, `hiring_manager_email`, `headhunter_name`, `headhunter_email`: (String)
- `applied_date`: (DateTime) The date the application was actually submitted.
- `created_at`: (DateTime) The date the record was first added to the system.
- `last_updated`: (DateTime) Triggered on any record change.

#### `interview_steps`
- `id`: (Integer, PK)
- `job_application_id`: (FK -> `job_applications.id`)
- `step_type_id`: (FK -> `step_types.id`)
- `step_date`: (DateTime, Nullable)
- `status`: (String) Requested, Scheduled, Completed, Passed.
- `notes`: (Text) Specific step feedback or interview prep.

#### `step_types`
- `id`: (Integer, PK)
- `name`: (String, Unique) Unique process step names (e.g., "Phone Screen", "Technical Interview").

#### `documents`
- `id`: (Integer, PK)
- `job_id`: (FK -> `job_applications.id`, Nullable)
- `title`: (String) Corrected filename.
- `doc_type`: (String) Categorization: job_post, submitted_resume, additional_document.
- `file_path`: (String) Relative path to `/uploads/`.
- `uploaded_at`: (DateTime)

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

### Jobs (`/api/jobs`)
- `GET /jobs`: List all job applications with nested steps and documents.
- `POST /jobs`: Create a new application with auto-linkage to a `Company`.
- `PUT /jobs/{id}`: Update job application details (triggers re-vectorization of description/notes).
- `DELETE /jobs/{id}`: Remove a job application and all associated data.
- `POST /jobs/check-duplicate`: Performs URL, JobID, and Role-based similarity checks.
- `GET /companies`: Returns a list of all known companies for autocomplete.
- `POST /jobs/{id}/documents`: Upload and vectorize PDF/Text documents.
- `DELETE /documents/{doc_id}`: Remove a document from the system and vector store.
- `POST /jobs/{id}/steps`: Add a new interview step (auto-creates `StepType`).
- `PUT /jobs/steps/{step_id}`: Update interview step details (Name, Date, Status, Notes).

### AI (`/api/ai`)
- `POST /ai/chat`: LangGraph-driven interactive chat with RAG.
- `POST /ai/extract-url`: Scrape and extract job data from a webpage.
- `POST /ai/extract-text`: Process raw text into a structured job.
- `POST /ai/extract-pdf`: Process uploaded PDF into a structured job.

### Settings (`/api/settings`)
- `GET /settings`: Retrieve global app configuration.
- `PUT /settings`: Update AI providers, models, and UI theme.
- `POST /settings/rebuild-vectors`: Wipe and re-ingest all data into the vector store.
- `POST /settings/test-llm`: Verify connectivity for a chosen LLM provider.

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
- **Contextual Metadata**: In addition to the description, the system extracts the company, role, location, salary, internal Job ID, posted date, and application deadline.
- **Extraction Strategies**: Supports two modes of operation:
  - **Single-Agent**: Fast, one-pass extraction for powerful cloud models.
  - **Multi-Agent**: Parallelized, granular extraction using dedicated agents for each field. Uses `asyncio.gather` with a concurrency semaphore (default: 2) to optimize speed on local/small models without overwhelming hardware.
- **Streaming & Progress UI**: Extraction tasks support real-time progress updates via Server-Sent Events (SSE). The frontend displays a news-ticker style status bar inside the extraction button, showing exactly what part of the URL or text is being processed and which fields are being extracted.
- **Cancellation & Safety**: Extraction tasks can be aborted via `AbortController` in the UI. Cancellation is strictly enforced on the backend; if the connection is closed or the "Stop" button is clicked, the system explicitly cancels the background AI processing to stop LLM calls immediately.
- **Reliability & Timeouts**: Field extractions have a per-agent timeout of 300 seconds (5 minutes) to ensure completion of complex tasks while preventing permanent hangs.
- **Selective Context & Fallback**:
    - **Fixed Context**: Standardized `num_ctx` to 9,000 tokens for all extraction tasks to optimize performance on local Ollama hardware.
    - **Raw Pass (Job Description)**: Specifically skips structured JSON extraction for the description field, using a direct verbatim retrieval prompt for maximum reliability and speed.
    - **Structured Pass (Metadata)**: Continues to use JSON schema enforcement for small fields like Company, Role, and ID.
    - **JSON-LD Support**: Prioritizes `application/ld+json` script tags (Schema.org `JobPosting`) for metadata extraction. This ensures high-fidelity results for modern, client-side rendered job boards (e.g., Workday/Moderna) where the primary page content is dynamic.

### 6. Document Ingestion
Supports PDF and plain text. PDFs are parsed using `pypdf` and split into chunks before vectorization.

### 7. Centralized Navigation Guard
The system uses a global navigation guard managed within `ViewContext.tsx`. This pattern protects against accidental data loss:
- **Dirty State Tracking**: Components (like `JobDetailView` and `SettingsPage`) report their "dirty" status and a contextual warning message to the `ViewContext`. This includes job info edits, existing interview step edits, and **unsaved data in the '+ Add Step' form**.
- **Action Interception**: All disruptive actions (view changes, job selection, opening modals) are wrapped in a `requestAction` call.
- **Global Prompt**: If the system is dirty, a centralized `ConfirmDialog` in `AppShell.tsx` intercepts the action and prompts the user to either discard changes or stay on the current page.

### 8. Interview Timeline & Step Editing
The interview pipeline supports full CRUD and inline editing:
- **Incremental Addition**: Users can add steps with custom names (automagically linked to `StepType`) and dates.
- **Inline Editing**: Existing steps can be fully modified (Name, Date, Status, Notes). Renaming a step triggers a backend lookup/creation for the new `StepType`.
- **Dark Mode Compatibility**: Native form elements (select, date, etc.) are globally styled to ensure high contrast and readability across all themes.

### 9. Modal State Management
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
