# Job Tracker AI - Backend

FastAPI-based backend for the Job Tracker AI application.

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
chmod +x start-backend.sh
./start-backend.sh
```

### 4. Production Mode
Optimized for performance and concurrency (4 workers).
```bash
chmod +x start-prod.sh
./start-prod.sh
```

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
