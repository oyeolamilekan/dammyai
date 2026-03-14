# DammyAI

DammyAI is an AI personal assistant built with a **TanStack Start + React** frontend and a **Convex** backend.

It combines:

- real-time Convex queries for dashboard data
- Better Auth for sign-in and session handling
- an AI agent powered by the Vercel AI SDK
- background workflows for scheduled tasks and research
- integrations with Telegram, Gmail, Google Calendar, Todoist, Notion, and web search providers

## Tech stack

- Frontend: React 19, TanStack Start, TanStack Router, TanStack Query
- Backend: Convex
- Auth: Better Auth + `@convex-dev/better-auth`
- AI: `ai` SDK + OpenAI-compatible gateway models
- Styling: Tailwind CSS + shadcn/ui
- Runtime/tooling: Bun, Vite, TypeScript

## Scripts

```bash
bun run dev
bun run build
bun run lint
bun run format
bun run dev:pdf-api
```

## Architecture at a glance

### Frontend

The frontend lives in `src/` and uses TanStack Router file-based routes.

- `src/routes/` contains route entry points and dashboard pages
- `src/components/` contains layout components and shared UI
- `src/lib/` contains auth and route protection helpers
- `src/router.tsx` wires Convex into React Query and wraps the app in the auth provider

For frontend module details, see [`src/README.md`](./src/README.md).

### Backend

The backend lives in `convex/` and is split by capability.

- public queries and mutations power the dashboard
- internal queries, mutations, and actions power the AI agent and background jobs
- `convex/schema.ts` defines the application data model
- `convex/http.ts` exposes auth, Telegram, and OAuth callback routes
- `convex/aiActions.ts` is the main AI execution entrypoint

For backend module details, see [`convex/README.md`](./convex/README.md).

## Core application flows

### Authentication

1. The frontend uses Better Auth through `src/lib/auth-client.ts`.
2. Protected dashboard routes validate auth in `beforeLoad`.
3. Convex HTTP auth routes are registered through `convex/http.ts`.
4. Backend functions derive the current user via Convex auth helpers in `convex/lib/session.ts`.

### Dashboard data flow

1. Route components call `useQuery(api.module.functionName)`.
2. `src/router.tsx` connects Convex to TanStack Query using `ConvexQueryClient`.
3. Convex subscriptions keep query data fresh over WebSocket.
4. UI updates automatically without manual polling.

### AI assistant flow

1. A user message arrives from the app or Telegram.
2. `convex/aiActions.ts` loads soul settings, memories, and conversation history.
3. The AI model is called with tool access from `convex/aiTools.ts`.
4. Tool implementations in `convex/tools/` call external providers.
5. Messages and auto-extracted memories are persisted back into Convex.

### Scheduled task flow

1. A task is created in `scheduledTasks`.
2. Cron jobs in `convex/crons.ts` check for due tasks every minute.
3. `convex/tasks.ts` executes the prompt through the AI engine.
4. Execution logs are stored in `taskExecutionLogs`.
5. Results can be delivered to Telegram if linked.

### Research flow

1. A research job is created in `backgroundResearch`.
2. Convex cron picks up pending jobs.
3. `convex/research.ts` runs deep research and records progress checkpoints.
4. Reports are stored in Convex and optionally delivered to Telegram as a PDF.

## Directory map

```text
.
├── src/                  # Frontend app
├── api/pdf/              # Standalone Hono PDF API for Cloudflare Workers
├── convex/               # Convex backend
├── public/               # Static assets
├── eslint.config.mjs     # ESLint config
├── vite.config.ts        # Vite + TanStack Start config
├── tsconfig.json         # TypeScript config
└── package.json          # Scripts and dependencies
```

## `api/pdf` standalone PDF service

`api/pdf/` is a separate Hono service deployed as a Cloudflare Worker.

It exists so PDF rendering stays outside Convex and can use Cloudflare Browser Rendering with `@cloudflare/puppeteer` for much better HTML/CSS fidelity than a lightweight PDF library.

### What it does

- accepts HTML input
- renders that HTML in a real browser
- returns a generated PDF response
- is called by Convex research delivery through `PDF_API_BASE_URL`

### Folder layout

```text
api/pdf/
├── src/app.ts         # Hono routes and error handling
├── src/index.ts       # Worker entrypoint and exports
├── src/render.ts      # Browser-based HTML -> PDF rendering
├── src/request.ts     # Request parsing and filename normalization
├── src/types.ts       # Shared worker types
└── wrangler.jsonc     # Cloudflare Worker config
```

### Local development

Run the worker locally with:

```bash
bun run dev:pdf-api
```

The Wrangler config uses a remote browser binding in local development, so this depends on Cloudflare Browser Rendering being enabled for your account.

### Deployment

Deploy the worker with:

```bash
bun run deploy:pdf-api
```

Current worker config lives in `api/pdf/wrangler.jsonc` and includes:

- `nodejs_compat`
- a `browser` binding named `BROWSER`
- `remote: true` for local development against Cloudflare's browser runtime

### API contract

The service exposes:

- `GET /health`
- `POST /pdf`

`POST /pdf` accepts either:

- JSON: `{ "html": "<h1>Hello</h1>", "title": "Hello", "fileName": "hello.pdf" }`
- raw HTML in the request body, with optional `title` / `fileName` query params

The response is a PDF with:

- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="..."`

The worker renders A4 output, prints backgrounds, respects CSS page sizing, and applies print-oriented pagination rules for cleaner section breaks.

### Convex integration

Convex calls this service from `convex/lib/pdfApi.ts`.

Set the base URL in your Convex environment:

```bash
PDF_API_BASE_URL=https://your-worker.your-subdomain.workers.dev
```

`convex/research.ts` sends wrapped report HTML to this service, receives the rendered PDF, and then uploads the returned file to Telegram when report delivery is enabled.

## Main data tables

Defined in `convex/schema.ts`:

- `integrations`
- `coreMemories`
- `archivalMemories`
- `messages`
- `souls`
- `scheduledTasks`
- `taskExecutionLogs`
- `backgroundResearch`

## Environment notes

The app depends on Convex deployment configuration and multiple provider credentials, including:

- Convex frontend/backend URLs
- Better Auth configuration
- AI gateway/model credentials
- `PDF_API_BASE_URL` for the standalone HTML-to-PDF service
- Telegram bot credentials
- OAuth credentials for Gmail, Google Calendar, Todoist, and Notion
- search provider keys for Exa or Tavily

## Contributor notes

- Prefer reading `convex/schema.ts` first to understand the data model.
- Use `src/README.md` and `convex/README.md` to find the right module before editing.
- Avoid editing generated files such as `src/routeTree.gen.ts` and `convex/_generated/*` directly.
