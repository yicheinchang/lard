---
trigger: always_on
---

# Antigravity Workspace Roles

This role defines the operational behavior for Antigravity (the AI assistant) in the Lard - Lazy AI-Powered Resume Database workspace.

## 🧩 Operational Principles

### 0. Mandatory Context Lookup
- **Action**: Always read [codebase-map.md] at the beginning of a task or when context is needed.
- **Rule**: Prioritize the codebase map over manual directory scanning to improve efficiency and maintain a consistent mental model of the architecture.

### 1. No Browser Control
- **Constraint**: The assistant has no ability to open, read, or control a Chrome browser. 
- **Action**: UI/Frontend changes must be manually verified by the user. Do not attempt to use browser-related tools for verification.

### 2. Backend Verification
- **Strategy**: Leverage backend APIs and write separate test scripts to verify implementations.
- **Action**: Save all backend test scripts in [backend/test](backend/test).

### 3. Documentation Synchronization
- **Standard**: Always update root `README.md`, `codebase-map.md`, `backend/README.md`, and `frontend/README.md` when functional changes occur.
- **Requirement**: Properly document AI logic in `backend/README.md`.

### 4. Implementation Plans
- **Threshold**: For any complex task, always draft an implementation plan for the user to review.
- **Rule**: Wait for explicit user approval before proceeding to execution.

### 5. Micro Git Commits
- **Action**: Perform a `git commit` after every logical unit of work (feature, fix, or functional change) that is verified and stable.
- **Granularity**: Commits should be granular and stable (e.g., one component, one API endpoint, one bug fix).
- **History**: Maintain a clean, linear git history.

### 6. Incremental Semantic Versioning (SemVer)
- **Standard**: Follow [Conventional Commits](https://www.conventionalcommits.org/).
- **Types**: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- **Level**: Automatically determine the next version:
  - `feat`: Minor version bump (e.g., `0.3.0` -> `0.4.0`).
  - `fix`: Patch version bump (e.g., `0.3.0` -> `0.3.1`).
  - (Note: Major version bumps require explicit user confirmation).

### 7. Version Synchronization
- **Action**: Always update both `backend/pyproject.toml` and `frontend/package.json` simultaneously.
- **Sync Rule**: The version numbers in both files must remain identical.

### 8. Git Tagging
- **Action**: Create a git tag for every version bump.
- **Format**: `v<MAJOR>.<MINOR>.<PATCH>` (e.g., `v0.4.0`).
- **Timing**: Tag after the version bump commit.

### 9. Codebase Map Synchronization
- **Action**: Keep the `codebase-map.md` up-to-date.
- **Rule**: After any stable, functional change is implemented, update the map to reflect the latest codebase context (architecture, endpoints, data models, etc.).

### 10. Response Rule
- Read files first, Write complete solution. No over-engineering.
- Always propose a plan when code needs to be changes
- Never execute a plan or modify code without receiving a green lights from the user.

### 11. Coding Instruction
<!-- BEGIN:nextjs-agent-rules -->
- Next.js: ALWAYS read docs before coding: Before any Next.js work, find and read the relevant doc in `frontend/node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth. 
<!-- END:nextjs-agent-rules -->

## 🛠️ Combined Workflow
For every stable, verified functional change:
1.  **Stage Files**: `git add <modified_files>`
2.  **Map Synchronization**: Update `codebase-map.md` to reflect latest changes.
3.  **Versioning**: Determine if this is a `feat:` or `fix:`.
4.  **Bump Version**: Update `version` in `backend/pyproject.toml` and `frontend/package.json`.
5.  **Stage Version Files**: `git add backend/pyproject.toml frontend/package.json codebase-map.md .agents/rules/workspace-role.md`
6.  **Commit**: `git commit -m "<type>(<scope>): <description>"`
7.  **Tag**: `git tag v<NEW_VERSION>`
8.  **Push** (Optional/Manual): Push to remote if configured.