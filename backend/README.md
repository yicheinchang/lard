# 🐱 Lard - Backend

FastAPI-based backend for the **Lard** (Lazy AI-powered Resume Database) application.

## 🚀 Getting Started

### 1. Prerequisites
- [uv](https://github.com/astral-sh/uv) (Extremely fast Python package & environment manager)
- Python 3.14+

### 2. Setup
```bash
uv sync
```

### 3. Development Mode
Optimized for instant reloads by targeting only source code directories.
```bash
chmod +x run.sh
./run.sh dev
```

### 4. Production Mode
Optimized for performance and concurrency (4 workers).
```bash
chmod +x run.sh
./run.sh prod
```

## 🧠 AI Extraction Engine

The core of **Lard** is its high-fidelity AI job extraction engine, powered by **LangGraph**. It is designed to handle everything from simple LinkedIn posts to complex enterprise career portals.

### 🔄 Sequential Fallback Strategy

The engine uses a two-phase process to ensure maximum accuracy:

1.  **Phase 1: JSON-LD (Strict Metadata)**:
    - Automatically detects and resolves Schema.org `JobPosting` metadata hidden in `<script>` tags.
    - Provides machine-precise structural data (Salary, Dates, Job ID, etc.) for high-traffic sites (e.g., Greenhouse, Workday).
2.  **Phase 2: Full-Text (Semantic Gap-Filling)**:
    - Triggered if metadata is missing or incomplete (e.g., "N/A" placeholders).
    - Leverages LLM reasoning to parse the raw page content and "fill in the gaps."
    - Merges results using JSON-LD as the primary source of truth.

### 🎭 Extraction Modes

- **Single-Agent**: Ideal for high-performance models (GPT-4o, Claude 3). Uses a single sophisticated call to extract all data.
- **Multi-Agent**: Orchestrates 8+ parallel agents (for Company, Role, Salary, etc.) to decompose tasks for smaller models (Gemma, Llama).
    - Includes **Job Post Verification** to halt immediately on non-job content.
    - Features **JSON Fragment Routing** to minimize token usage by sending only relevant snippets to specific agents.

### 🤖 The State Machine

```text
       [ Start ]
           |
           v
+-----------------------+
| Check Job Post (LLM)  | --(No)--> [ END (Error) ]
+-----------------------+
           |
           v
+-----------------------+
|    Extract Data       | <-----------+
| (JSON-LD or Text)     |             |
+-----------------------+             |
           |                          | (Retry / Fallback)
           v                          |
+-----------------------+             |
| Validate Description  | --(Fail)----+
|    (QA Node)          |
+-----------------------+
           |
      (Pass / Max)
           |
           v
        [ END ]
```

### ⚡ Verification & QA Loop

Each extraction is validated by a dedicated **QA Node** using a 3-retry circuit breaker:
- Ensures descriptions are formatted in clean Markdown.
- Detects and repairs AI hallucinations or truncation compared to the source.
- Flags "Potential Hallucination" in the UI if validation fails after 3 attempts.

## ⚡ Architecture & Optimization

### Lazy Loading
To achieve < 5s startup time, this project uses an `app_factory` pattern and lazy-loads all heavy AI dependencies (LangChain, OpenAI, etc.).

- **Main App**: `main.py`
- **AI Agent**: `ai/graph.py` (Deffered compilation)
- **Vector Store**: `database/vector_store.py` (Lazy client initialization)

### Reloader Flags
The development script uses highly targeted `--reload-dir` flags to prevent expensive scanning of the `.venv` directory.

## 📁 Directory Structure
- `ai/`: LangGraph agents and LLM chains.
- `database/`: SQLAlchemy models and ChromaDB vector store.
- `routers/`: API endpoint definitions.
- `uploads/`: Repository for uploaded PDFs.
