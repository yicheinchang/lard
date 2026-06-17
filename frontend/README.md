# 🐱 Lard - Frontend (v0.91.1)

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
The UI uses a **Centered Modal pattern** (`JobDetailView.tsx`) rather than separate page routes. This ensures a blazingly fast SPA feel while maintaining deep contextual data management. It consists of two primary tabs (**Interview Process** and **Job Details**) and a conditional **Resume** tab. Turns the role name in the modal header into a direct hyperlink to the application page (when a URL is present) for easy accessibility. An expandable **Additional Notes** Markdown editor section is nested directly inside the Job Details tab alongside a **Quick Actions / Status Advance Tray** on the tabs header.

### 2. Responsive Kanban Board
Features a dual-layout strategy:
- **Desktop**: High-density horizontal grid with min-width enforcement to prevent content squishing.
- **Mobile (< 1024px)**: Automatically switches to a **Tabbed UI (Segmented Control)**, allowing users to focus on one stage at a time with real-time job counts.

### 3. Navigation & Validation Guards
Managed via the `ViewContext.tsx` and `JobDetailView.tsx`, the application enforces deep data integrity:
- **Navigation Interception**: Tracks unsaved changes across form fields and step additions, intercepting transitions to show a centralized confirmation dialog.
- **Timezone Shift Prevention**: Date inputs dynamically append `T12:00:00.000Z` to prevent local browser timezone offsets from causing date-shifting calendar errors.
- **Contractor Field Enforcement**: Enforces that the `agency` string field is populated whenever the role type is set to "Contractor".
- **Strict Lifecycle Stage Guards**: 
  - *Wishlist Guard*: Prevents transitioning to Wishlist if `applied_date` is present.
  - *Applied Guard*: Auto-advances to Applied upon date entry only if no steps exist, blocking Applied if interview steps are recorded.
  - *Interviewing Guard*: Auto-advances to Interviewing when steps are added, blocking Interviewing if steps are deleted back to zero.

### 4. Stateful AI Assistant
The global `ChatAssistant.tsx` features:
- **Session History**: A dedicated drawer for navigating past conversations.
- **Normalization Layer**: Replaces narrow no-break space (`\u202F`) and non-breaking space (`\u00A0`) with standard space, replaces non-breaking hyphen (`\u2011`) with standard hyphen, and cleans mathematical LaTeX blocks to prevent KaTeX rendering breaks.
- **Persistence**: Persists the active `session_id` as well as a resizable width handle in `localStorage` (`chat_assistant_width`).
- **High-Fidelity Rendering**: Full dynamic Markdown and LaTeX math parsing.

### 5. Advanced Prompt Engineering UI
The Settings page (`SettingsPage.tsx`) contains:
- **Granular Baseline Resets**: Restore any of the 18+ base system prompts to factory defaults individually.
- **Sync Guard**: Automatically pulls backend factory defaults via `/api/settings/defaults` to ensure logic consistency.
- **Validation Feedback**: Displays granular, field-level error messages (e.g., `[hiring_manager_email]: invalid format`) directly in the `AddJobModal` based on strict Pydantic v2 validation.
- **Modern File Support**: Ingests and previews **DOCX** and **HTML** files in addition to standard PDFs and text.

### 6. Document Ingestion & Viewing
- **DocumentViewer**: Extracted reusable component that handles inline document viewing. Supports PDF embeds with iframe fallback, HTML files inside isolated style sandboxes, Markdown/text using parsed markdown prose, and placeholder rendering for binary Word (`.docx`) files with instant download prompts.
- **Resume Tab**: Conditionally rendered tab in `JobDetailView.tsx` shown only when a candidate has uploaded resumes. Features tabbed pill controls for switching between multiple resume versions and displays resume documents inline.

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
Final version synchronized with v0.91.1.

---

## 📜 License
This project is licensed under the **MIT License**. See the [LICENSE](../LICENSE) file for more details.
