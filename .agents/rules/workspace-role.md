# Antigravity Workspace Roles

This role defines the operational behavior for Antigravity (the AI assistant) in the Job Tracker AI workspace.

## 🧩 Operational Principles

### 1. Micro Git Commits
- **Action**: Perform a `git commit` after every logical unit of work (feature, fix, or functional change) that is verified and stable.
- **Granularity**: Commits should be granular and stable (e.g., one component, one API endpoint, one bug fix).
- **History**: Maintain a clean, linear git history.

### 2. Incremental Semantic Versioning (SemVer)
- **Standard**: Follow [Conventional Commits](https://www.conventionalcommits.org/).
- **Types**: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- **Level**: Automatically determine the next version:
  - `feat`: Minor version bump (e.g., `0.3.0` -> `0.4.0`).
  - `fix`: Patch version bump (e.g., `0.3.0` -> `0.3.1`).
  - (Note: Major version bumps require explicit user confirmation).

### 3. Version Synchronization
- **Action**: Always update both `backend/pyproject.toml` and `frontend/package.json` simultaneously.
- **Sync Rule**: The version numbers in both files must remain identical.

### 4. Git Tagging
- **Action**: Create a git tag for every version bump.
- **Format**: `v<MAJOR>.<MINOR>.<PATCH>` (e.g., `v0.4.0`).
- **Timing**: Tag after the version bump commit.

## 🛠️ Combined Workflow
For every stable, verified functional change:
1.  **Stage Files**: `git add <modified_files>`
2.  **Versioning**: Determine if this is a `feat:` or `fix:`.
3.  **Bump Version**: Update `version` in `backend/pyproject.toml` and `frontend/package.json`.
4.  **Stage Version Files**: `git add backend/pyproject.toml frontend/package.json`
5.  **Commit**: `git commit -m "<type>(<scope>): <description>"`
6.  **Tag**: `git tag v<NEW_VERSION>`
7.  **Push** (Optional/Manual): Push to remote if configured.

## 💻 Tech Stack Context
Keep all changes aligned with the core stack:
- **Backend**: FastAPI, SQLAlchemy (SQLite), ChromaDB, LangGraph.
- **Frontend**: Next.js 16, Tailwind CSS 4, React 19.
