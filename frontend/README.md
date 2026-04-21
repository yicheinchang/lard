# 🐱 Lard - Frontend (v0.67.3)

Next.js-based high-performance frontend for the **Lard** (Lazy AI-powered Resume Database) application.

## 🚀 Tech Stack & Core Architecture

The frontend is built with a modern, high-isolation architecture designed for security and extreme performance.

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Runtime**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) (Using modern `@theme` variables)
- **Icons**: [Lucide React](https://lucide.dev/)
- **API Pattern**: 
    - **Secure Proxying**: All client-side requests are proxied via `src/app/api/proxy/` to isolate the backend from public exposure.
    - **Server Actions**: All mutations (Jobs, Steps, Settings) use Next.js Server Actions for secure, server-side execution.
    - **Streaming (SSE)**: Long-running AI tasks (Extraction, Vectorization) are streamed via Server-Sent Events for real-time progress updates.

---

## 📊 Key UI Components & Logic

### 1. Master-Detail Orchestration
The UI uses a **Centered Modal pattern** (`JobDetailView.tsx`) rather than separate page routes. This ensures a blazingly fast SPA feel while maintaining deep contextual data management.

### 2. Responsive Kanban Board
Features a dual-layout strategy:
- **Desktop**: High-density horizontal grid with min-width enforcement to prevent content squishing.
- **Mobile (< 1024px)**: Automatically switches to a **Tabbed UI (Segmented Control)**, allowing users to focus on one stage at a time with real-time job counts.

### 3. Navigation Guards
Managed via the `ViewContext.tsx`, the application protects against accidental data loss. If a user attempts to navigate away from an unsaved edit (Job Details, Interview Steps, or the "Add Step" form), a centralized interceptor prompts for confirmation.

### 4. Advanced Prompt Engineering UI
The Settings page includes a sophisticated sub-section for AI prompt management:
- **Granular Baseline Resets**: Restore any of the 18+ system prompts to factory defaults individually.
- **Context-Aware Filtering**: Automatically hides prompts irrelevant to the active Extraction Strategy (Single vs Multi-Agent).
- **Additive Guidance**: Field-specific instruction tabs for fine-tuning extraction without modifying core prompts.

---

## 🧪 Development & Verification

### Setup
```bash
cd frontend
npm install
npm run dev
```

### Manual Verification Checklist
As the AI assistant cannot access a browser, the following must be manually verified after any change:
1. **Theme Consistency**: Verify both Light and Dark modes (handled via `SettingsContext`).
2. **Responsive Layouts**: Check the Kanban tabbed UI on small screens and the sidebar collapse logic.
3. **Guard Logic**: Confirm that unsaved changes trigger the navigation interceptor.
4. **SSE Connectivity**: Ensure the `Ticker.tsx` and `ProcessingOverlay.tsx` receive real-time updates from the backend.

---
Built with ❤️ by Antigravity.
Final version synchronized with v0.67.3.
