# AI Job Tracker Monorepo

Welcome to the AI-powered Job Application Tracker. This repository contains both the frontend (Next.js) and the backend (FastAPI) applications.

## Project Structure

- **/frontend**: A Next.js 16 web application using Tailwind CSS for a premium, responsive Kanban and Table UI.
- **/backend**: A FastAPI server managing job data with SQLite and providing AI extraction and file storage capabilities.

## Getting Started

### Backend
1. `cd backend`
2. Install dependencies: `uv sync` or `pip install -e .`
3. Start server: `uv run uvicorn main:app --reload --port 8000`

### Frontend
1. `cd frontend`
2. Install dependencies: `npm install`
3. Start dev server: `npm run dev -- -p 3000`

## Features

- **Kanban Board**: Visualize your job hunt with a responsive 4-column pipeline.
- **Table View**: Detailed list view with advanced sorting and filtering.
- **Document Management**: Attach resumes and job descriptions (PDF/Markdown) and preview them directly in the browser.
- **Interview Pipeline**: Track every step of your interview process with notes and automatic status updates.
- **AI Integration**: (In development) Automated job extraction and matching.

---
Built with ❤️ by Antigravity.
