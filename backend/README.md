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

## 🧪 Testing

The backend follows a script-based verification strategy. All test scripts are maintained in [backend/tests](file:///home/Lard/backend/tests).

### Running Tests
To verify API endpoints or AI logic, use the provided test suite:
```bash
cd backend
uv run python -m tests.test_ai_extraction  # Example
```

---

## 🧠 AI Extraction Engine (The Routing Matrix)

**Lard** features a sophisticated AI extraction pipeline that adapts to both the model's capability and the source material's structure.

### 📊 Strategy vs. Input
The system automatically routes tasks based on the **Extraction Strategy** (configured in Settings) and the **Input Type** detected by the parser.

| Strategy | Input: JSON-LD (URL) | Input: Text (URL, PDF, Markdown) |
| :--- | :--- | :--- |
| **Single-Agent** | Monolithic prompt mapping Schema.org data to JobDetails. | Monolithic prompt with **Embedded Self-Verification** logic. |
| **Multi-Agent** | Parallelized fragment routing (Bypasses LLM for missing fields). | 8+ parallel field-specific agents with raw-pass description extraction. |

---

### 🚀 Strategy 1: Single-Agent (High-Performance)
Ideal for frontier models (GPT-4o, Claude 3). 
- **Monolithic Context**: A single sophisticated LLM call captures all metadata and the description.
- **Embedded Verification**: In Text mode, the prompt includes an internal verification block to confirm "is_job_post" and "detected_category" without a separate node call.
- **Strict Mapping**: Directly converts structured JSON-LD into the application's schema.

### 🎭 Strategy 2: Multi-Agent (Small-Model/Parallel)
Optimized for local models (Gemma, Llama) through task decomposition.
- **Verification Node**: A dedicated `check_job_post_node` runs as the first step to halt execution immediately on non-job content.
- **Parallel Fields**: Extracts Company, Role, Location, Salary, ID, Posted, Deadline, and Description concurrently using `asyncio.Semaphore`.
- **JSON Fragment Routing**: The system slices JSON-LD and only sends relevant snippets to specific agents (e.g., `baseSalary` goes only to the Salary agent). Fields missing in JSON-LD bypass the LLM phase for that attempt.
- **Raw-Pass Description**: The description field is extracted without a strict JSON schema to prevent truncation.

---

## 🔄 Common AI Logic

Regardless of strategy, the following core features ensure 100% extraction fidelity:

### 1. Sequential Fallback Strategy
The engine prioritizes structured data but falls back to semantic reasoning if needed:
- **Priority A (JSON-LD)**: Attempts to extract accurate data from Schema.org script tags first.
- **Full-Schema Heuristic Validation**: The system checks **every field** in the schema (Company, Role, Location, Salary, Job ID, Dates, Description). If any field is "N/A", a placeholder, or missing, a fallback is triggered for that specific field.
- **Priority B (Full Text)**: Re-parses the raw page content to fill gaps detected in the JSON-LD pass.
- **Result Merging**: Treating JSON-LD as the primary source of truth, it only replaces/fills fields that failed the heuristic check.

### 2. QA Validation Loop (Circuit Breaker)
Each extraction is validated by a dedicated **QA Node** with a 3-retry limit:
- **Scope**: Targeted primarily at the Description field for verbatim accuracy and completeness.
- **Feedback Injection**: If validation fails, the failure reason is injected into the prompt of the same extraction node for the next attempt.
- **UI Flagging**: If the circuit breaker trips after 3 attempts, the final output is preserved but flagged for manual review in the frontend.

---

## 📈 Visual Workflows

### AI Extraction Lifecycle
```mermaid
graph TD
    A["Start: URL/Text/File"] --> B{"Input Mode?"}
    
    B -- "JSON-LD Metadata Found" --> C["Initial Extraction<br/>(Priority A: Strict Map)"]
    B -- "Raw Text / PDF / No JSON" --> D["Full Text Extraction<br/>(Priority B: Semantic)"]
    
    C --> E{"Heuristic Check?<br/>(Any 'N/A' or Missing Fields?)"}
    
    E -- "Field(s) Fail" --> F["Targeted Fallback<br/>(Extracts ONLY failed fields from Text)"]
    E -- "All Fields Pass" --> G["QA Validation Node<br/>(Description QA)"]
    
    F --> G
    D --> G
    
    G -- "QA Fail < 3 Retries" --> H["Inject Feedback & Retry<br/>(Targeted Field Regeneration)"]
    H --> G
    
    G -- "Pass / Max Retries" --> I["Finalize & Save"]
```

### Multi-Agent Extraction (Parallel)
```mermaid
graph TD
    Source["Job Source Content"] --> Mode{"Initial Path?"}
    
    Mode -- "JSON-LD" --> Slicer["JSON Slicer<br/>(Extracts Strict Fragments)"]
    Slicer --> JAgentPool[["Job Agent Pool<br/>(Company, Role, Salary, etc.)"]]
    
    JAgentPool --> Heuristic{"Heuristic Check?<br/>(Per-Field Failure?)"}
    
    Heuristic -- "Field(s) Missing / 'N/A'" --> Fallback["Targeted Text Extraction<br/>(Extracts ONLY failed fields from Text)"]
    Heuristic -- "All Pass" --> Merger["Result Merger"]
    
    Mode -- "Full Text / PDF" --> Chunker["Text Chunker<br/>(Semantic Context)"]
    Chunker --> JAgentPool
    Fallback --> JAgentPool
    
    JAgentPool --> Merger
    Merger --> Final["Finalize & Save"]
```

---

## ⚡ Architecture & Optimization

### Lazy Loading & Startup
The backend reaches a "Ready" state in **< 5 seconds** through:
- **`app_factory` pattern**: Library imports are deferred until needed.
- **Targeted Reloader**: `uvicorn` watches only `/backend` source files, ignoring `.venv` and `uploads`.
- **Embedding Cache**: Local model cache for `sentence-transformers` to avoid cold-start downloads.

## 📁 Directory Structure
- `ai/`: LangGraph agents, LLM factory, and prompt definitions.
- `database/`: SQLAlchemy models and ChromaDB vector store.
- `routers/`: API endpoint definitions (REST & SSE).
- `tests/`: Verification scripts and backend test suite.
- `uploads/`: Repository for uploaded documents.
