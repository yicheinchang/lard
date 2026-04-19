# 🐱 Lard - Frontend

Next.js-based frontend for the **Lard** (Lazy AI-powered Resume Database) application.
Serves as the **Secure Gateway** for the entire stack, utilizing an **API Proxy** for streaming and **Server Actions** for secure mutations.

## 🧪 Verified Development

> [!IMPORTANT]
> Because the AI assistant does not have access to a live browser, all frontend changes **must be manually verified** by the developer. Ensure that theme consistency (Light/Dark mode) and responsive layouts (Mobile/Desktop) are checked before marking a feature as stable.

## 📊 Component Highlights

### Responsive Kanban Board
The Kanban board features a dual-layout system for optimal productivity:
- **Desktop/Tablet**: High-density horizontal grid with a minimum column width of `250px`. Supports horizontal scrolling to prevent information squishing.
- **Mobile/Narrow Screens**: Integrated **Tabbed UI** (Segmented Control) that triggers below `1024px`. Automatically switches to a single-column focus with real-time job counts per stage.

## Manual Verification

To ensure the quality of the frontend, please perform the following checks after any UI changes:
1. **Responsive Design**: Verify the layout on mobile (375px), tablet (768px), and desktop (1440px) viewports.
2. **Theme Consistency**: Toggle between Light and Dark modes to ensure all components adhere to the Tailwind CSS theme configuration.
3. **Accessibility**: Run a Lighthouse audit or use a screen reader to verify that interactive elements are keyboard-accessible.

## 🌐 Configuration & Gateway

The frontend acts as the secure gateway for the **Lard** stack. It handles authentication (if configured), proxies streaming requests to the backend, and provides a unified Settings UI.

### Environment Variables
| Variable | Description | Default |
| :--- | :--- | :--- |
| `INTERNAL_BACKEND_URL` | The URL used by the server-side proxy to reach the FastAPI backend. | `http://localhost:8000` |
| `FRONTEND_PORT` | The port the application listens on (used by Docker). | `8081` |

### System Key Indicators
To ensure transparency while maintaining security, the Settings UI includes visual indicators for API keys:
- **System Default**: If a key is configured via environment variables (e.g., `LARD_OPENAI_API_KEY`), the UI displays a `System Default` badge and masks the value as `●●●●●●●● (System)`.
- **User Override**: If a user enters a new key in the UI, it overrides the system default for that installation and is persisted securely on the server.

---

## 🏗️ Architecture

- **API Proxy**: Located at `src/app/api/proxy/`, this route handler transparently forwards requests to the internal backend, supporting both standard JSON and Server-Sent Events (SSE).
- **Settings Context**: Manages theme state and reactive updates for application preferences.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
