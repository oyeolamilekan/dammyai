# Copilot Instructions — DammyAI

## Build & Dev Commands

```bash
bun run dev          # Start Convex + Vite dev servers concurrently (port 3000)
bun run build        # Production build (vite build + tsc --noEmit)
bun run lint         # TypeScript check + ESLint
bun run format       # Prettier (no semi, single quotes, trailing commas)
bun run dev:pdf-api  # Run the standalone HTML-to-PDF worker locally
bun run deploy:pdf-api # Deploy the standalone HTML-to-PDF worker
```

There is no test suite configured.

## Architecture Overview

DammyAI is an AI personal assistant with a **React frontend** and **Convex backend**.

**Frontend** (`src/`): TanStack Start (SSR-capable) + TanStack Router (file-based routing) + Convex real-time subscriptions bridged through TanStack Query via `@convex-dev/react-query`.

**Backend** (`convex/`): Convex serverless functions — queries, mutations, and actions. AI agent logic runs in Convex actions using the Vercel AI SDK (`ai` package) with OpenAI models via an AI gateway.

**PDF worker** (`api/pdf/`): standalone Hono app deployed to Cloudflare Workers. It uses Cloudflare Browser Rendering via `@cloudflare/puppeteer` to convert HTML into high-fidelity PDFs outside the Convex runtime.

**Auth**: better-auth integrated as a Convex component (`convex/betterAuth/`). Auth routes are proxied from the frontend to Convex's HTTP endpoint. Client-side auth uses `getCachedSession()` from `src/lib/auth-client.ts` with a `requireAuth` guard in route `beforeLoad`.

**Data flow**: Frontend subscribes to Convex queries via `useQuery(api.module.fn)`. Convex subscriptions keep data fresh over WebSocket (React Query `staleTime: Infinity`). The router wraps the app in `ConvexBetterAuthProvider`.

## Key Patterns

### Frontend

- **Path alias**: `~/` maps to `src/` (configured in tsconfig `paths`).
- **Routing**: File-based with TanStack Router. Routes live in `src/routes/`. Dashboard pages are under `src/routes/dashboard/`. Use `createFileRoute` to define routes. Protected routes use `beforeLoad: requireAuth`.
- **Querying Convex**: Use `useQuery` from `convex/react` with `api.module.functionName`. Due to TypeScript generation quirks, the dashboard casts `api as any` before querying — follow this pattern in dashboard routes.
- **UI components**: shadcn/ui (new-york style) in `src/components/ui/`. App-level components in `src/components/`. Add new shadcn components via `bunx shadcn@latest add <component>`.
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` plugin. Global styles in `src/styles/app.css`.
- **Research report viewer**: `src/routes/dashboard/research.tsx` renders report HTML in-app through the themed `.research-report` container instead of an iframe-based viewer.

### Convex Backend

- **Public functions**: `query`, `mutation`, `action` — exposed to frontend via `api.module.fn`.
- **Internal functions**: `internalQuery`, `internalMutation`, `internalAction` — only callable server-side via `internal.module.fn`.
- **Always validate args** with `v.*` validators on every function.
- **Auth in backend functions**: Never accept `userId` as an argument. Derive it via `ctx.auth.getUserIdentity()` in public functions. Internal functions receive `userId` from trusted callers.
- **Indexed queries**: Use `.withIndex()` instead of `.filter()`. Index fields must be queried in definition order. Name indexes as `by_field1_and_field2` or `field1_field2`.
- **Bounded results**: Prefer `.take(n)` or `.paginate()` over `.collect()`.
- **Actions cannot access `ctx.db`** — call queries/mutations via `ctx.runQuery`/`ctx.runMutation` instead.
- **Node.js actions**: Add `"use node";` at file top only when Node built-ins are needed. Keep in separate files from queries/mutations.
- **Schema**: Defined in `convex/schema.ts`. Use `v.id('tableName')` for references. System fields `_id` and `_creationTime` are automatic.
- **PDF delivery**: `convex/research.ts` no longer renders PDFs directly for Telegram delivery. It wraps report HTML and sends it to the standalone PDF service through `convex/lib/pdfApi.ts`.

### Standalone PDF Worker

- **Location**: `api/pdf/`
- **App structure**: `src/app.ts` (routes), `src/request.ts` (request parsing), `src/render.ts` (browser rendering), `src/types.ts` (shared types), `src/index.ts` (entrypoint/exports)
- **Runtime**: Hono on Cloudflare Workers
- **Config**: `api/pdf/wrangler.jsonc` with `nodejs_compat`, browser binding `BROWSER`, and `remote: true` for local development
- **Routes**: `GET /`, `GET /health`, `POST /pdf`
- **Request shape**: `POST /pdf` accepts either JSON `{ html, title?, fileName? }` or raw HTML body with optional `title` / `fileName` query params
- **Rendering**: browser-based A4 PDF generation with background printing and CSS page sizing

### AI Agent

- AI logic is in `convex/aiActions.ts` (main entry), `convex/aiStore.ts` (data access), `convex/aiTools.ts` (tool implementations).
- Uses Vercel AI SDK `generateText()` with tool calling. Tools are defined in `convex/tools/` (one file per integration: gmail, googleCalendar, todoist, notion, telegram, exa, tavily).
- Tool factory pattern: each integration exports `create*Tool(ctx, userId)` functions that return AI SDK `tool()` instances.
- The agent has a memory system: core memories (key-value facts), archival memories (long notes), and auto-extracted conversation facts.
- Models are routed through an AI gateway (`AI_GATEWAY_API_KEY` env var). Model IDs use `provider/model` format (e.g., `openai/gpt-4o-mini`).

### Integrations

- OAuth flows for Gmail, Google Calendar, Todoist, and Notion are in `convex/oauth/`. HTTP routes registered in `convex/http.ts`.
- Telegram integration uses a webhook (`/api/telegram/webhook`).
- Integration credentials stored in the `integrations` table, keyed by `userId` + `provider`.

### Cron Jobs

- Defined in `convex/crons.ts`. Two jobs run every minute: scheduled task execution and pending research processing.

## Environment Notes

- `PDF_API_BASE_URL` is required by Convex when research PDFs are delivered through the standalone PDF worker.
- The standalone worker itself is configured through `api/pdf/wrangler.jsonc`.

## Formatting

Prettier config: no semicolons, single quotes, trailing commas. Run `bun run format` before committing.
