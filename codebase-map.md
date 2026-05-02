# 🗺️ Lard - Lazy AI-Powered Resume Database (v0.68.0)
Last Updated: 2026-05-02T02:00:00Z

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
- **Icons**: Lucide React & Custom Brand Logo (`/logo.png`)
- **API Pattern**: Next.js API Proxy (Route Handlers) & Server Actions
- **API Client**: Axios (Proxied) & Fetch (Proxied SSE)

---

### 🛠️ Infrastructure
- **Persistence**: Consolidated project-root `/data` directory (shared by Local Dev and Docker).
  - `data/db/`: Relational Data (SQLite).
  - `data/chroma_db/`: Vector Data.
  - `data/uploads/`: Original Documents.
  - `data/huggingface/`: AI Model Cache.
  - `data/tmp/`: Temporary AI Diagnostic Logs.
- **Containerization**: 
  - `backend`: Multi-stage Python 3.14 + `uv`. High isolation.
  - `frontend`: 3-stage Next.js Standalone. Secure API Proxying.
- **Deployment Port**: 3030 (Frontend) / 8000 (Backend)

---

## 📂 File Structure

### Root
- `/backend`: Core API and AI logic.
- `/frontend`: Next.js web application.
- `/assets`: Documentation images and brand assets.
- `.agents/rules/`: Operational rules and roles for AI completion.

### Backend (`/backend`)
- `main.py`: Application entry point. Uses a `create_app()` factory and a `lifespan` handler for database initialization to ensure non-blocking, optimized startup.
- `config.py`: Settings management (env vars + `app_settings.json`).
- `routers/`:
  - `jobs.py`: 
    *   `Company`: Represents a company/organization. Ensures consistency.
    *   `JobApplication`: Tracks job details, status, and linked documents/steps. Linked to `Company`.
    *   `InterviewStep`: Individual process steps (e.g., "Phone Screen").
  - `ai.py`: AI Assistant chat and data extraction endpoints. Includes SSE streaming for progress updates.
  - `settings.py`: Application configuration endpoints.
- `database/`:
  - `models.py`: SQLAlchemy relational models.
  - `relational.py`: Database engine and session setup.
  - `vector_store.py`: ChromaDB integration for RAG. Uses Docling for high-fidelity extraction of `.docx` and `.html` files. Employs lazy initialization for the `PersistentClient` and `HuggingFaceEmbeddings`.
- `ai/`:
  - `assistant.py`: LangGraph-based conversational agent logic. Uses lazy loading for the vector store manager.
  - `llm_factory.py`: Multi-provider support (Ollama, OpenAI, Anthropic).
  - `chains.py`: Specific LangChain sequences (e.g., for extraction).
  - `debug.py`: Custom diagnostics, including the `DebugLLMCallbackHandler` to capture raw inputs/outputs to `data/tmp`.
  - `graph.py`: LangGraph state machine definitions.
  - `status.py`: Synchronization primitives (Threading Events) for tracking heavy AI library loading during background startup.
  - `logger.py`: Standardized AI agent console logging.
- `uploads/`: Local storage for uploaded job documents.
- `test/`: Separate test scripts for backend API and logic verification.
- `run.sh`: Unified startup script. Development mode uses a targeted `uvicorn` reloader that excludes large directories (like `.venv`) to minimize file system scanning and CPU usage.

### Frontend (`/frontend`)
- `src/app/`: Next.js routes (Layouts and Pages).
- `src/components/`: Reusable UI components:
  - `AppShell.tsx`: Main layout wrapper featuring a **Binary Snap Sidebar** (Fixed 160px expanded / 64px collapsed). Includes **Mobile Responsive Header** and **Hamburger Menu Drawer**.
  - `KanbanBoard.tsx`: Responsive drag-and-drop pipeline visualization. Features **Min-Width enforcement** (250px) for desktop with horizontal scrolling and a **Tabbed Mobile UI** (below 1024px) for focused single-column tracking. Supports independent vertical scrolling and dynamic counts.
  - `TableView.tsx`: Density-rich list view of applications. Includes **Portal-based Tooltips** for company and role cells to prevent truncation and container clipping.
  - `JobCard.tsx`: Individual job item in the Kanban board. Features **Portal-based Tooltips** and **Status text protection** (nowrap) for clean readability at any width. **Mobile Responsive**: Action buttons (Advance, Mark as...) are always visible on touch devices/small screens while remaining hover-only on desktop.
  - `Portal.tsx`: [NEW] Hydration-safe React Portal implementation for mounting overlays to `#portal-root`.
  - `Tooltip.tsx`: [NEW] Reusable Portal-based tooltip with viewport-aware positioning and horizontal overflow correction.

  - `JobDetailView.tsx`: Core component for job application management. Rendered via **React Portal** for global stacking. Features a **Centered Floating Modal** with a backdrop-blur overlay and a **Full-Screen Toggle**. Includes **Dynamic Default Tab Selection**: Defaults to "Job Details" for Wishlist/Applied status, and "Interview Process" for all other active stages. Consists of three tabs:
      *   **Interview Pipeline** (Default): Timeline events with full CRUD and inline editing.
      *   **Job Details**: Metadata management and document attachments. Features a **Zoomable Description** with levels from `prose-sm` to `prose-2xl` and a quick-reset toggle.
      *   **Application Notes**: Dedicated Markdown editor (`MdEditor`) for research and interview prep.
  - `DocumentPreview.tsx`: **Portal-based overlay** for high-fidelity viewing of PDF, Markdown, and plain text documents.
  - `Ticker.tsx`: News-ticker style progress bar for real-time AI extraction status.
  - `FilterPopover.tsx`: Advanced filtering UI for dashboard header. Features a **Portal-based Centered Modal** (constrained width) with a unified scrollable body containing both filters and action buttons to ensure visibility and reachability on all screen heights.
  - `ProcessingOverlay.tsx`: **Portal-based full-screen overlay** for tracking long-running AI tasks with SSE updates. Feature: **Auto-closes 1.5s after success** and theme-aware styling.
  - `AutoSaveIndicator.tsx`: Small, non-blocking status indicator for background AI vectorization during note taking.
  - `tooltip-box`: Theme-aware CSS utility in `globals.css` ensuring readable tooltips in both light and dark modes.
  - `AddJobModal.tsx`: Core form for new applications. Rendered via **React Portal**. Includes AI Auto-fill, Potential Hallucination Warning System, **Context Limit Warning System**, and **validation guards for required fields** (Company/Role).
  - `ConfirmDialog.tsx`: Multi-functional modal replacing native prompts. Rendered via **React Portal**. Supports **Date Inputs**, **File Uploads**, and **Combobox Text Inputs** (with custom `<datalist>`). Includes variant-based styling (`danger`, `success`, `default`).
  - `ChatAssistant.tsx`: Global **Portal-based side drawer** for the AI agent.
  - `SettingsPage.tsx`: Integrated configuration for LLMs and themes. Features a collapsible **Advanced AI Prompt Settings** subsection with:
      *   **Additive Guidance**: Field-specific instruction tabs for fine-tuning extraction.
      *   **Base System Prompts**: Independent sub-section for modifying core backend prompts (Extraction, JSON-LD, QA Validator) and granular field-level prompts for Multi-Agent mode (Text and JSON) with a dedicated reset handler. Features a nested tabbed UI for efficient management of 18 total base prompts. **Selective Filtering**: Prompts are filtered based on the active **Extraction Strategy** (Single vs. Multi-Agent). **Active Selection Sync**: Automatically synchronizes the active prompt tab when switching strategies or tabs to ensure only visible prompts are selected. Supports **Granular Resets** for each specific prompt to factory defaults. Enhanced readability with `rows={12}` text areas. Includes **Focus Persistence Fixes** and **Persistence Support** in the backend for reliable prompt engineering.
  - `src/lib/`:
  - `api.ts`: Centralized API client using Axios (configured with `/api/proxy` baseURL) and Server-Sent Events (SSE) for streaming. Proxies all calls to the backend.
  - `actions.ts`: Secure [Server Actions] for all non-streaming mutations (Jobs, Steps, Settings).
  - `ViewContext.tsx`: Global UI state including **Navigation Guards** for unsaved changes and sidebar state.
  - `SettingsContext.tsx`: Reactive theme and AI status.

---

## 🎨 Frontend Architecture & UI Logic

The frontend is a **Single Page Application (SPA)** built with Next.js 16, utilizing a "Master-Detail" pattern with a centered modal-based detailing system.

### 1. View Orchestration & Global State
The `AppShell` provides the persistent UI (sidebar and chat), while `src/app/page.tsx` acts as the main view switcher and global data manager.
- `page.tsx` centrally handles global state for `searchQuery`, `sortKey`, and `sortDir`. **Expanded Search**: Real-time filtering now includes Company, Role, Location, Job ID, Description, and both Application/Interview Notes.
- Transitioning between Dashboard (Kanban) and Table view is handled via the `ViewContext`, but the dataset filtering and sorting remain unified and preserved across views.

### 2. Job Detail System
Instead of separate routes, job details are shown in a reactive centered modal (`JobDetailView.tsx`). The component organizes data into three primary tabs:
- **Interview Pipeline**: Supports manual addition, **deletion**, and system events (e.g., virtual "Applied" marker). "Add Step" is disabled for items without an application date.
- **Job Details**: Editable metadata (Company, Role, Salary, Dates) and Markdown-driven description. Includes document management for Job Posts and Resumes.
- **Application Notes**: A dedicated Markdown editor for deep-dive research, synchronizing with the RAG system.

### 3. Advanced Lifecycle Guards
The system enforces strict status integrity in `JobDetailView.tsx` and `page.tsx`:
- **Wishlist Guard**: Blocks entering "Wishlist" status if an `applied_date` is set.
- **Applied Guard**: Automatically advanced when `applied_date` is set and no steps exist. Blocks "Applied" if interview steps exist.
- **Interviewing Guard**: Automatically advanced when an interview step is added. Blocks moving to "Interviewing" if zero steps exist.
- **Wishlist Movement**: Wishlist items (no date) can only move to "Closed" or "Discontinued" without providing a date.

### 4. Contextual AI Integration
The `ChatAssistant` is a global component accessible from any page. It maintains its own state and can be toggled via a floating action button or keyboard shortcuts.

### 5. Dynamic Theme Store
The UI uses Tailwind CSS 4 with `globals.css`: Global CSS containing theme variables, glassmorphism utilities, and the `@plugin "@tailwindcss/typography"` registration for Markdown rendering. These variables are updated dynamically by the `SettingsContext`, supporting instant theme switching between Dark/Light and customizable accent colors. Key components like `JobDetailView` and `KanbanBoard` are fully theme-aware, ensuring readability in both Light and Dark modes. **Standardized Brand Colors**: Primary action buttons across all views (Dashboard, Settings, Details, Filters) use the `--primary` brand color with high-contrast white text for consistent accessibility. **Sticky UI Components**: Modals and Filter Popovers use fixed footers to keep action buttons accessible without scrolling.

---

## 📦 Core Data Models

Shared structures used for API communication and state management.

### 1. Job Application (`Job`)
The central entity representing a job application.
- `id`: Unique identifier (Integer).
- `company` & `role`: Brand and position (Strings).
- `status`: Lifecycle stage (Wishlist ... Discontinued).
- `is_starred`: Boolean toggle for marking jobs as important.
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
- `custom_prompts`: Additive instructions for field extraction.
- `system_prompts`: Base core AI prompts (Extraction, Validation, JSON-LD) fully editable from the UI.
- `max_concurrency`: User-configurable parallelism for Multi-Agent extraction (Range: 1-10).
- `num_ctx`: User-configurable LLM context window (Range: 1k-128k+, Default: 8192) applied universally across all AI operations.
- `debug_mode`: Saves raw LLM input/output prompts to `data/tmp/` for deep troubleshooting.
- **Ollama Verification**: Automatic server verification and model discovery for the Ollama provider. Includes an animated status pulse and a datalist-based model selector.

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
  - `closed_date`: Optional date when the job listing was closed.
  - `last_operation`: Controlled vocabulary string for audit trails. Automatically managed by `update_job_status`.
- `status`: Lifecycle stage (Wishlist, Applied, Interviewing, Offered, Rejected, Closed, Discontinued).
- `last_updated`: Refreshed on successful, meaningful application-related changes.
- `url`: (String) Application web link.
- `job_posted_date`, `application_deadline`: (DateTime)
- `company_job_id`, `location`, `salary_range`: (String)
- `description`: (Text, Markdown)
- `notes`: (Text, Markdown) User notes, automatically vectorized for RAG.
- `hr_email`, `hiring_manager_name`, `hiring_manager_email`, `headhunter_name`, `headhunter_email`: (String)
- `applied_date`: (DateTime, Nullable) The date the application was actually submitted. No default; null for Wishlist items. Clearing this date while steps exist is blocked. An entry here triggers an automatic move to "Applied" (or "Interviewing" if steps exist).
- `decision_date`: (DateTime, Nullable) The date when a final decision (Offered, Rejected, Discontinued) was made.
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
- `PUT /api/jobs/{id}/stream`: Streamed job info update.
- `PUT /api/jobs/{id}`: Standard (atomic) job info update.
- `DELETE /jobs/{id}`: Remove a job application and all associated data.
- `POST /jobs/check-duplicate`: Performs URL, JobID, and Role-based similarity checks.
- `GET /companies`: Returns a list of all known companies for autocomplete.
- `POST /jobs/{id}/documents`: Upload and vectorize PDF/Text documents.
- `DELETE /documents/{doc_id}`: Remove a document from the system and vector store.
- `POST /jobs/{id}/steps`: Add a new interview step (auto-creates `StepType`).
- `PUT /jobs/steps/{step_id}`: Update interview step details (Name, Date, Status, Notes).
- `DELETE /api/jobs/steps/{step_id}`: Permanently remove an interview step (triggers status recalculation).

### AI (`/api/ai`)
- `GET /ai/status`: Check if heavy AI libraries are fully loaded.
- `POST /ai/chat`: LangGraph-driven interactive chat with RAG. Blocks/waits for AI ready state.
- `POST /ai/extract-url`: Scrape and extract job data from a webpage. Blocks/waits for AI ready state.
- `POST /ai/extract-text`: Process raw text into a structured job.
- `POST /ai/extract-file-stream`: Process uploaded file into a structured job via SSE. Sends "Initializing" message if backend is still loading.

### Settings (`/api/settings`)
- `GET /settings`: Retrieve global app configuration.
- `PUT /settings`: Update AI providers, models, and UI theme.
- `POST /settings/rebuild-vectors`: Wipe and re-ingest all data into the vector store.
- `POST /settings/test-llm`: Verify connectivity for a chosen LLM provider.
- `GET /settings/ollama-models`: Fetch available models from an Ollama server (proxied).

---

## 🧠 Critical Logic & Patterns

### 1. Note Ingestion & RAG
When `JobApplication.notes` is updated via the integrated editor in the **Job Details** tab, the change triggers an automatic re-ingestion of the text into ChromaDB under the `job_notes` type. This ensures the AI Assistant can retrieve the user's personal thoughts and research during chat sessions.

### 2. Job Lifecycle & Automated Advancement
The system enforces strict status integrity based on the application's progress:
- **Wishlist**: Default state when `applied_date` is missing. "Add Step" is disabled. Can only move manually to "Discontinued".
- **Applied**: Automatically advanced when `applied_date` is set and no steps exist.
- **Interviewing**: Automatically advanced when an interview step is added.
- **Terminal Stages**: (Rejected, Offered, Discontinued, Closed). If a step is modified while in these stages, the UI prompts the user to decide whether to resume progress (move to Interviewing/Applied) or stay in the terminal stage.
- **Reversion**: Deleting the last interview step automatically moves the job back to "Applied". Clearing the `applied_date` (only if no steps remain) moves it back to "Wishlist".

### 3. Multi-Provider AI
The system is designed to be model-agnostic. Through `llm_factory.py`, it can switch between:
- **Local**: Ollama (default: `gemma3:4b-it-qat`)
- **Cloud**: OpenAI (GPT-4o) or Anthropic (Claude 3)

### 4. Agent Operational Rules
The workspace uses a formalized rule system in `.agents/rules/workspace-role.md` to ensure:
- **No Browser Control**: Assistant has no ability to open, read, or control a Chrome browser. Frontend changes require manual user verification.
- **Backend Testing**: Verification scripts are maintained in `backend/tests/`.
- **Implementation Plans**: Mandatory for complex tasks before execution.
- **Micro Git Commits**: Atomic, granular commits for every stable change.
- **Synchronized Versioning**: Automated SemVer updates across backend and frontend.
- **Codebase Map Sync**: Mandatory updates to this document to maintain architectural context.
- **Extreme Backend Startup Optimization**: Sub-10s cold start even with heavy AI dependencies via:
    - **Background Eager Loading**: AI libraries (LangChain/PyTorch) and LangGraph workflows preloaded in background threads during FastAPI `lifespan`.
    - **Synchronized Initialization**: Incoming AI requests (Extraction, Chat) automatically wait for the background loading to complete using a global `Threading.Event`, preventing 500 errors caused by partial library imports.
    - **Global Embedding Cache**: HuggingFace instances cached to prevent PyTorch reloads.
    - **Decoupled Prompts**: Raw system prompts isolated in `backend/ai/prompts.py` to prevent library hangs during initial config.
    - **Targeted Reloader**: `uvicorn` watches only source directories, explicitly excluding `.venv` and `node_modules`.
    - **Deep Lazy Loading**: Heavy AI utilities imported strictly inside the call functions.
    - **Persistent Model Cache**: Models cached locally in `backend/chroma_db/models/` to bypass re-downloads.
    - **Production Ready**: Use `./run.sh prod` for optimized worker concurrency.
- **Git Tagging**: Automated tagging for every version.

### 5. State Management (LangGraph)
The AI assistant uses **LangGraph** to manage conversational state, enabling multi-turn workflows and tool-calling (e.g., querying the database vs. searching documents).

### 6. Dynamic Configuration
Settings are not just environment variables. They are persisted in `backend/app_settings.json`, allowing the user to change providers or themes at runtime via the UI without restarting the server.

### 7. AI Extraction & Preprocessing
The system uses a multi-stage pipeline to extract job details from URLs, PDFs, and text:
- **AI Extraction**: Multi-agent extraction pipeline (LangGraph) with a Sequential Fallback strategy. Uses **Docling v2.85** with in-memory **DocumentStream** processing for layout-aware Markdown conversion and **extruct** for robust JSON-LD metadata extraction.
- **Token Optimization**: Implements a "Clean HTML" strategy for metadata. All extracted metadata is decoded via `html.unescape()` and stripped of non-semantic CSS attributes (e.g., `style="..."`) before being passed to the LLM. This preserves structural guidance (tags like `<p>`, `<ul>`) while minimizing token waste.
- **Job Post Verification**: LangGraph-based `check_job_post_node` that confirms content is a job posting. Bypassed if JSON-LD is found. Features a **fail-fast** strategy that halts the workflow on negative results. **Resilient Decoupling**: Uses browser-standard headers with **Gzip/Deflate only** (Brotli disabled for reliability) to ensure consistent content decoding across all corporate portals.
- **Contextual Metadata**: Extracts Company, Role, Location, Salary, Job ID, and Dates.
- **JSON-LD First Strategy**: Prioritizes `application/ld+json` script tags for metadata. Features **Robust Identification Helpers**: Automatically maps non-standard corporate fields (e.g., `jobBenefits` for salary, `positionID` for Job ID) to the internal schema, minimizing unnecessary full-text fallbacks.
- **Optimized JSON-LD Multi-Agent Routing**: If JSON-LD is found and multi-agent mode is enabled, the system bypasses massive payload overhead by slicing the JSON and distributing specific fragments (e.g., `baseSalary`) only to the relevant agents. Missing fragments bypass the LLM completely, optimizing speed and reducing token limits.
- **Streaming & Progress UI**: Extraction tasks use Server-Sent Events (SSE). The frontend `Ticker.tsx` displays real-time status updates (e.g., "Extracting Salary Range...", "Finalizing Description..."). Implements a **15s SSE heartbeat mechanism** (comments) and increased Next.js proxy timeouts to ensure stability during long LLM processing on hardware-limited systems.
- **AI Validation & Completeness**: Uses:
    - **json_validator_node**: Specialized validator for JSON-LD data. Checks metadata for placeholders and performs a fidelity QA on the HTML-to-Markdown description conversion.
    - **text_validator_node**: Specialized validator for raw text data. Performs comprehensive QA on the isolated job description, checking for completeness, hallucinations, and boundary accuracy. Includes a **Fast Pass** mechanism: if a description was already verified by the JSON fidelity pass, it bypasses the text re-validation to prevent false-positive rejections on noisy pages.
- **Guided AI Retries**: If validation fails, the specific feedback from the QA validator is injected into the next extraction prompt (Attempts 2 and 3), guiding the LLM to fix specifically identified issues like truncation or hallucinations. Features **robust variable injection** for `validation_feedback` and `custom_guidance` to support user-defined prompt overrides.
- **Fail-Safe UI Warnings**: If validation still fails after 3 retries, the system preserves the output but sets `hallucination_detected: True` and `hallucination_reasons` (using the final QA block), which triggers an amber warning banner. **Context-Aware Flagging**: If the active data source (JSON or Text) was truncated during the centralized pre-processing, the system sets `context_limit_reached: True`, triggering a violet Zap warning banner in the frontend `AddJobModal.tsx` to inform the user of limited validation completeness.
- **Cancellation & Safety**: Explicit support for `AbortController`. If a user cancels in the UI, the backend immediately terminates the background AI processing.
- **Selective Pass Logic**: Skips structured JSON extraction for the description field, using a direct verbatim retrieval prompt for speed and reliability, and defaults to generous 600s timeouts on hardware-limited setups.
- **Resilient Network Client**: Uses browser-standard headers to bypass anti-bot measures.
- **Sequential Fallback Strategy**: Implements a two-phase extraction pipeline. Attempt 1 (JSON-LD) targets structured data for speed and precision. If metadata fields (Company, Role, etc.) are missing, Attempt 2 (Full Text) is triggered. **State Preservation**: Successes from JSON-LD are preserved via `previous_json_results` and merged with Text Agent results to prevent data loss. Features **Heuristic Noise Detection**: If the extracted text has high link density (>60%) and is under 6,000 characters (common in CSR/SPA loading states), the system automatically treats it as noise and swaps it for the high-quality JSON-LD description field to ensure metadata agents have "substantive" content to work with.
- **Enhanced Entity Recognition**: Single-agent prompts are optimized to identify metadata in document headers/summaries, specifically targeting alphanumeric Job IDs (e.g., "REQ-12345").
- **Multi-line Diagnostic Logging**: The AI logger supports full, non-truncated multi-line output for fallback reasons and QA failures, providing high transparency for prompt engineering and debugging.
- **Extraction Prompt Safety**: Implements an `escape_braces` utility in `chains.py` that automatically escapes literal curly braces in all system prompts before they are passed to LangChain. This prevents template variable errors when prompts contain literal JSON examples, ensuring compatibility across all extraction strategies and models.
- **Robust Field Validation**: Specialized `json_validator_node` and `text_validator_node` perform targeted QA on the description field, with a **3-retry limit** that injects specific failure feedback into the next extraction attempt.
- **Fast Pass Logic**: If a description has already been verified by the JSON-LD fidelity pass, it skips redundant text-mode validation.

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
chmod +x run.sh
./run.sh dev   # Development
# OR
./run.sh prod  # Production
```

### Frontend
```bash
cd frontend
npm run dev
```
