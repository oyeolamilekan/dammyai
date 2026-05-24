# DammyAI

DammyAI is an AI personal assistant built with a **TanStack Start + React** frontend and a **Convex** backend.

It combines:

- real-time Convex queries for dashboard data
- Better Auth for sign-in and session handling
- an AI agent powered by the Vercel AI SDK routed through an AI Gateway for multi-provider model access
- background workflows for scheduled tasks and research
- integrations with Telegram, Gmail, Google Calendar, Todoist, Notion, and provider-aware web search

## Tech stack

- Frontend: React 19, TanStack Start, TanStack Router, TanStack Query
- Backend: Convex
- Auth: Better Auth + `@convex-dev/better-auth`
- AI: Vercel AI SDK (`ai` v6) + AI Gateway for multi-provider model routing (OpenAI, Anthropic, etc.)
- Styling: Tailwind CSS + shadcn/ui
- Runtime/tooling: Bun, Vite, TypeScript

## Scripts

```bash
bun run dev
bun run build
bun run lint
bun run format
bun run dev:pdf-api
bun run deploy:pdf-api
```

## Architecture at a glance

### Frontend

The frontend lives in `src/` and uses TanStack Router file-based routes.

- `src/routes/` contains route entry points and dashboard pages (integrations, memories, preferences, research, tasks, souls)
- `src/components/dashboard/` contains page-specific components extracted into focused subdirectories
- `src/components/dashboard/shared/` holds reusable UI primitives (pagination controls, list skeletons)
- `src/components/ui/` contains shadcn/ui components and primitives
- `src/lib/` contains auth, API helpers, route protection, and error handling utilities
- `src/router.tsx` wires Convex into React Query and wraps the app in the auth provider

For frontend module details, see [`src/README.md`](./src/README.md).

### Backend

The backend lives in `convex/` and is split by capability.

- public queries and mutations power the dashboard
- internal queries, mutations, and actions power the AI agent and background jobs
- `convex/schema.ts` defines the application data model
- `convex/http.ts` exposes auth, Telegram, and OAuth callback routes
- `convex/aiActions.ts` is the main AI execution entrypoint
- `convex/ai/tools.ts` composes the runtime toolset from grouped factories in `convex/ai/toolDefinitions/`
- `convex/ai/config.ts` normalizes model IDs into the `provider/model` format expected by the AI Gateway (e.g. `openai/gpt-4o-mini`), provides the default model fallback, and builds the runtime system prompt from the base prompt, core memories, and timezone
- `convex/ai/engine.ts` is the main AI execution pipeline that loads user context, assembles the system prompt, calls `generateText` from the AI SDK with tools and step limiting, and persists the assistant response with auto-extracted memories
- `convex/ai/toolDefinitions/` houses focused tool factories for memory, integrations, research, and scheduled tasks
- `convex/ai/toolHelpers.ts` holds shared formatting and parsing helpers used across tool definitions
- `convex/ai/prompts.ts` centralizes system prompts, memory instructions, and task execution prompts
- `convex/memories.ts` exposes CRUD operations for core/archival memories, paginated conversation listing, and bulk deletion
- `convex/lib/pagination.ts` provides shared pagination helpers (`pageArgs`, `normalizePage`, `normalizeLimit`, `paginate`)
- `convex/lib/taskValidation.ts` validates task scheduling inputs including weekday-based recurrence and timezone handling
- `convex/lib/time.ts` provides `now()` and `MIN_TASK_INTERVAL_MS` shared across the backend
- `convex/tasks.ts` handles task claiming, execution, and recurring task scheduling
- `convex/research.ts` manages background research jobs and report delivery
- `convex/telegram.ts` processes Telegram bot commands, idempotency, and message routing

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
2. `convex/aiActions.ts` loads soul settings, conversation history (last 20 messages), and core memories.
3. The system prompt is assembled from the soul config (including timezone when set), centralized prompts in `convex/ai/prompts.ts`, and core memories. A configured timezone injects explicit timezone instructions into the prompt; when absent, UTC is used with a one-time suggestion to configure timezone in Settings.
4. `MEMORY_INSTRUCTIONS` in `convex/ai/prompts.ts` automatically routes broad or complex requests into `startBackgroundResearch`, while single-fact lookups use a single `webSearch` call.
5. The AI model is called via the Vercel AI SDK (`generateText`), which handles tool orchestration, multi-step execution (capped at 8 via `stepCountIs`), and step callbacks for persisting tool results. Tool access is composed from grouped factories in `convex/ai/toolDefinitions/` and wired together via `convex/ai/tools.ts`.
6. Search tools use the user's configured search provider from soul settings (`exa` or `tavily`).
7. If the query requires research, the model calls `startBackgroundResearch` once per invocation, enforced by a dedup guard in `createAgentTools`.
8. Messages, web-search provider metadata, and auto-extracted memories are persisted back into Convex.

### Memory management

1. Core memories (`coreMemories`) store short, persistent key-value facts about the user (e.g. name, timezone, preferences) with a max of 50 entries.
2. Archival memories (`archivalMemories`) hold longer, tagged notes surfaced via the AI assistant.
3. `convex/memories.ts` provides public queries and mutations for CRUD operations on both memory types, paginated conversation history, and bulk deletion via `deleteAllMemories`.
4. The AI assistant auto-extracts core and archival memories through tool factories in `convex/ai/toolDefinitions/memory.ts`.
5. The dashboard memories page surfaces conversations, core memories, and archival memories with pagination, editing, and deletion controls.

### Integrations

1. The integrations dashboard page lists available connectors with their connection status: OAuth (Gmail, Google Calendar, Todoist, Notion), API key, and Telegram.
2. Connector definitions in `src/components/dashboard/integrations/connectors.ts` drive the UI: each connector renders a `ConnectorCard` and opens a `ConnectorDetailDialog` for setup.
3. OAuth connectors redirect to their provider via `convex/http.ts`, complete the OAuth flow, and store tokens in the `integrations` table.
4. Telegram connects via a bot link and is backed by `convex/telegram.ts` for message processing with idempotency guards.
5. The AI assistant accesses connected integrations through tool factories in `convex/ai/toolDefinitions/integrations.ts` (calendar, mail, messaging, search, todo, notion).
6. A calendar health check from `convex/http.ts` triggers token refresh for expiring Google OAuth grants via `convex/googleTokenRefresh.ts`.

### Scheduled task flow

1. A task is created in `scheduledTasks` as either:
   - a one-off task with a single `runAt`
   - a recurring task with either a fixed `intervalMs` or weekday-based recurrence (`weekdays` + `timeOfDay` + task timezone)
2. `convex/lib/taskValidation.ts` validates all task scheduling inputs: rejects invalid weekdays, enforces minimum interval (`MIN_TASK_INTERVAL_MS`), and computes the next run time with timezone awareness.
3. Cron jobs in `convex/crons.ts` check for due tasks every minute. Tasks are executed exclusively through this cron — there is no separate one-off scheduler trigger.
4. `convex/tasks.ts` atomically claims the task via `claimTaskForExecution` (disables one-off tasks or advances the next run time for recurring tasks) to prevent duplicate execution by overlapping cron ticks.
5. The stored prompt is wrapped as an execute-now command and run through the AI engine with `TASK_SYSTEM_PROMPT`, so scheduled runs execute the task instead of trying to reschedule or reconfigure it.
6. Task responses are intentionally short and conversational, and avoid exposing raw IDs, function names, timestamps, or backend metadata.
7. Execution logs are stored in `taskExecutionLogs`.
8. Results can be delivered to Telegram if linked.

### Research flow

1. A research job is created in `backgroundResearch`.
2. Convex cron picks up pending jobs every minute.
3. `convex/research.ts` atomically claims the job via `claimResearchJob`, then runs deep research using the user's configured `researchDepth` (1–4), `researchBreadth` (2–6), model preference, and search provider (`exa` or `tavily`) from soul settings.
4. `convex/lib/deepResearch.ts` dispatches searches through the selected provider, records progress checkpoints, and generates the final HTML report.
5. Reports are stored in Convex with research metadata (including the search provider used) and can optionally be delivered to Telegram as a PDF.

### Cron jobs

Three recurring cron jobs are defined in `convex/crons.ts`:

- **Every minute**: process due scheduled tasks
- **Every minute**: process pending research jobs
- **Every 30 minutes**: refresh expiring Google OAuth tokens (`convex/googleTokenRefresh.ts`)

## Directory map

```text
.
├── src/                                          # Frontend app
│   ├── routes/dashboard/                         # Dashboard pages (integrations, memories, preferences, research, tasks, souls)
│   └── components/dashboard/                     # Extracted page components
│       ├── integrations/                         # Connector cards, detail dialogs, connector definitions
│       ├── memories/                             # Conversation, core memory, and archival memory rows
│       ├── preferences/                          # Preference cards and utilities
│       ├── research/                             # Checkpoint timeline, report modal, job cards, status badges
│       ├── tasks/                                # Task list items, create-task dialog, execution logs, utilities
│       └── shared/                               # Pagination controls, list skeletons
├── api/pdf/              # Standalone Hono PDF API for Cloudflare Workers
├── convex/               # Convex backend
│   ├── ai/
│   │   └── toolDefinitions/  # Focused tool factories (memory, integrations, research, scheduledTasks)
│   └── lib/                  # Shared utilities (pagination, task validation, time)
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

- `integrations`: stores OAuth tokens, API keys, and connection status for Gmail, Google Calendar, Todoist, Notion, and Telegram
- `coreMemories`: short persistent key-value facts about the user (max 50 per user); each has a `source` field (`user` or `ai`)
- `archivalMemories`: longer tagged notes with creation/update timestamps
- `messages`: conversation history; records `role`, `content`, optional `modelId`, optional `searchProvider` for persisted web-search tool calls, and optional `toolName`
- `souls`: per-user AI configuration; includes `systemPrompt`, model/search preferences, `timezone`, `researchDepth`, and `researchBreadth`
- `scheduledTasks`: one-off tasks, interval-based recurring tasks, and weekday-based recurring tasks (selected weekdays + time of day + task timezone)
- `taskExecutionLogs`
- `backgroundResearch`: research jobs, progress checkpoints, report output, and the search provider used for the run
- `telegramProcessedUpdates`

## Environment notes

The app depends on Convex deployment configuration and multiple provider credentials, including:

- Convex frontend/backend URLs
- Better Auth configuration
- AI Gateway credentials (`AI_GATEWAY_API_KEY`, `AI_GATEWAY_MODEL`, `AI_GATEWAY_MEMORY_MODEL`)
- `PDF_API_BASE_URL` for the standalone HTML-to-PDF service
- Telegram bot credentials
- OAuth credentials for Gmail, Google Calendar, Todoist, and Notion
- search provider keys for Exa or Tavily

## Contributor notes

- Prefer reading `convex/schema.ts` first to understand the data model.
- Use `src/README.md` and `convex/README.md` to find the right module before editing.
- For AI tool changes, keep `convex/ai/tools.ts` as the composition layer and put grouped tool factories in `convex/ai/toolDefinitions/`.
- Dashboard route files should keep page-level orchestration in `src/routes/dashboard/*`, while extracted components in `src/components/dashboard/*` stay focused on rendering and small local UI concerns.
- Shared UI primitives (pagination controls, list skeletons) live in `src/components/dashboard/shared/`.
- Shared backend utilities (pagination helpers, task validation, time helpers) live in `convex/lib/`.
- Memory operations (core, archival, conversations, bulk delete) are exposed through `convex/memories.ts`.
- Avoid editing generated files such as `src/routeTree.gen.ts` and `convex/_generated/*` directly.
