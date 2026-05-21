# 🐱 Lard - Frontend (v0.86.2)

Next.js-based high-performance frontend for the **Lard** (Lazy AI-powered Resume Database) application.

## 🚀 Tech Stack & Core Architecture

The frontend is built with a modern, high-isolation architecture designed for security and extreme performance.

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Runtime**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) (Using modern `@theme` variables)
- **Icons**: [Lucide React](https://lucide.dev/)
- **API Pattern**: 
    - **Secure Proxying**: All client-side requests are proxied via `src/app/api/proxy/`. Utilizes **Next.js 16 `after()` hooks** for non-blocking audit logging to ensure maximum responsiveness.
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
Managed via the `ViewContext.tsx`, the application protects against accidental data loss. If a user attempts to navigate away from an unsaved edit, a centralized interceptor prompts for confirmation.

### 4. Stateful AI Assistant
The global `ChatAssistant.tsx` features:
- **Session History**: A dedicated drawer for navigating past conversations.
- **Normalization Layer**: Bridge the gap between LLM quirks and strict rendering. Fixes narrow no-break spaces (U+202F), cleans negative thin spaces (`\!`), and normalizes LaTeX delimiters into standard math tokens for KaTeX.
- **Persistence**: Remembers the active `session_id` using `localStorage`.
- **High-Fidelity Rendering**: Supports full Markdown and LaTeX math.
- **Adjustable Layout**: Persistent resizable width handle.

### 5. Advanced Prompt Engineering UI
The Settings page includes a sophisticated sub-section for AI prompt management:
- **Granular Baseline Resets**: Restore any of the 18+ system prompts to factory defaults individually.
- **Sync Guard**: Automatically pulls backend factory defaults via `/api/settings/defaults` to ensure logic consistency.
- **Validation Feedback**: Displays granular, field-level error messages (e.g., `[hiring_manager_email]: invalid format`) directly in the `AddJobModal` based on strict Pydantic v2 validation.
- **Modern File Support**: Synchronized support for **DOCX** and **HTML** files in both the `AddJobModal` (Auto-fill) and `JobDetailView` (Attachments).

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
1. **Theme Consistency**: Verify both Light and Dark modes.
2. **Responsive Layouts**: Check the Kanban tabbed UI on small screens.
3. **Guard Logic**: Confirm that unsaved changes trigger the navigation interceptor.
4. **SSE Connectivity**: Ensure the `Ticker.tsx` receives real-time updates.

---
Built with ❤️ by Antigravity.
Final version synchronized with v0.86.2.

---

## 📜 License
This project is licensed under the **MIT License**. See the [LICENSE](../LICENSE) file for more details.
