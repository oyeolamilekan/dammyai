# Convex backend module guide

This directory contains the backend for DammyAI: database schema, public APIs for the dashboard, internal AI actions, HTTP handlers, and integration tooling.

## Backend module map

| Module | Purpose | Key files |
| --- | --- | --- |
| Schema | Defines application tables and indexes | `schema.ts` |
| Auth | Convex-facing auth queries and Better Auth component wiring | `auth.ts`, `auth.config.ts`, `betterAuth/` |
| AI runtime | Assistant action entrypoints plus extracted orchestration, prompt, memory, and tool wiring modules | `aiActions.ts`, `ai/`, `aiStore.ts`, `aiTools.ts` |
| Tasks | Scheduled task CRUD, execution, and cron-driven processing | `tasks.ts`, `taskLogs.ts`, `crons.ts` |
| Research | Background research jobs and report delivery | `research.ts`, `lib/deepResearch.ts`, `lib/pdfApi.ts`, `lib/pdfGenerator.ts` |
| Memories | User-visible memory and conversation APIs | `memories.ts` |
| Soul settings | Per-user system prompt and model/search preferences | `soul.ts` |
| Integrations | Provider credential storage and Telegram linking | `integrations.ts`, `integrationStore.ts`, `telegramStore.ts` |
| Telegram transport | Bot webhook, outbound messages, document delivery | `telegram.ts`, `lib/telegramFormat.ts` |
| HTTP routes | Route registration for auth, Telegram, and OAuth callbacks | `http.ts` |
| OAuth handlers | Provider-specific auth and callback flows | `oauth/gmail.ts`, `oauth/googleCalendar.ts`, `oauth/todoist.ts`, `oauth/notion.ts` |
| External tools | AI-callable wrappers around provider APIs | `tools/` |
| Shared backend utilities | Session helpers, env helpers, provider helpers | `lib/session.ts`, `lib/env.ts`, `lib/google.ts` |

## Runtime boundaries

### Public functions

Files such as `tasks.ts`, `research.ts`, `memories.ts`, `integrations.ts`, `soul.ts`, and `auth.ts` expose public queries and mutations that are called by the frontend dashboard.

These functions should:

- validate arguments
- derive the current user from auth
- shape data for UI consumption

### Internal functions

Internal queries, mutations, and actions are used by the AI engine and background workflows.

Examples:

- `aiStore.ts`: internal memory/history access
- `aiTools.ts`: internal tool backing functions
- `tasks.ts`: task execution internals
- `research.ts`: research job processing internals
- `telegramStore.ts`: Telegram linkage lookups

### HTTP actions

Registered in `http.ts` and used for:

- Better Auth routes
- Telegram webhooks
- OAuth start/callback flows

## Important files

### `schema.ts`

The source of truth for the data model. Read this first before changing backend behavior.

Main tables:

- `integrations`
- `coreMemories`
- `archivalMemories`
- `messages`
- `souls`
- `scheduledTasks`
- `taskExecutionLogs`
- `backgroundResearch`

### `aiActions.ts`

Thin Convex action entrypoint for the assistant runtime.

Responsibilities:

- expose documented `internalAction` entrypoints
- delegate execution into the extracted AI helper modules

If you want to trace how DammyAI responds end-to-end, start here and then follow the imports into `ai/engine.ts`.

### `ai/`

Extracted AI runtime helpers.

Current structure:

- `engine.ts`: main execution flow for user-scoped AI prompts and direct replies
- `tools.ts`: AI SDK tool definitions and tool-output formatting
- `memory.ts`: auto-extraction and persistence of memories from conversations
- `config.ts`: assistant prompt defaults, model normalization, and prompt construction
- `types.ts`: shared runtime types used across the AI modules

### `aiStore.ts`

Internal data access layer for the AI runtime.

Responsibilities:

- load soul settings
- load conversation history
- load core memories
- persist messages
- upsert auto-extracted core memories

### `aiTools.ts`

Internal Convex functions backing model tool calls.

Responsibilities:

- save/search/delete memories
- create/list/update/delete scheduled tasks
- start/cancel research jobs
- enforce user ownership when string IDs are passed through tool calls

### `tasks.ts`

Scheduled task module.

Responsibilities:

- dashboard CRUD for scheduled tasks
- internal due-task lookup
- execution via the AI runtime
- result logging
- optional Telegram delivery

`TASK_SYSTEM_PROMPT` defines the tone for automated task messages.

### `taskLogs.ts`

Stores step-by-step execution traces for scheduled tasks so the dashboard can show what happened during each run.

### `research.ts`

Background research orchestration.

Responsibilities:

- create user research jobs
- process jobs via internal actions
- record progress checkpoints
- store generated reports
- send summaries to Telegram and render PDFs through the standalone PDF API when available

### `integrations.ts`

Owns integration records stored in the `integrations` table.

Responsibilities:

- list connections for the dashboard
- save/update tokens and API keys
- delete provider links
- generate Telegram linking URLs
- expose internal upsert helpers for OAuth callbacks

### `telegram.ts`

Telegram transport and webhook handler.

Responsibilities:

- receive inbound bot messages
- connect Telegram chat IDs to user accounts
- call the AI runtime for replies
- send formatted messages and files back to Telegram

### `http.ts`

Convex HTTP router registration point. If you need to expose a new webhook or callback endpoint, this is where it gets registered.

## Subdirectories

### `betterAuth/`

Convex component integration for Better Auth.

- schema additions
- auth adapter
- auth route/component wiring

### `oauth/`

Provider-specific OAuth entry and callback handlers.

Each file is responsible for:

- starting the OAuth flow
- validating callback params
- exchanging codes for credentials
- storing credentials through internal mutations

### `tools/`

AI-callable provider integrations.

Current categories:

- Gmail
- Google Calendar
- Todoist
- Notion
- Telegram
- Exa search
- Tavily search

These files are not the full AI runtime; they are focused provider adapters used by `aiActions.ts`.

### `lib/`

Shared backend helpers.

Important helpers:

- `session.ts`: auth/session helpers for deriving the current user
- `env.ts`: required/optional environment reads
- `deepResearch.ts`: long-running research workflow logic
- `pdfApi.ts`: standalone HTML-to-PDF service client
- `pdfGenerator.ts`: report PDF generation
- `telegramFormat.ts`: Telegram-safe formatting
- `google.ts`: shared Google provider helpers

## Cron jobs

Defined in `crons.ts`.

Current jobs:

- process due scheduled tasks
- process pending research jobs

Both run every minute.

## Contributor guidance

- Prefer using existing helpers in `lib/` before adding new ones.
- Keep external API calls in actions, HTTP handlers, or tool adapters rather than query functions.
- Avoid editing generated files in `_generated/`.
- When changing data shape, update `schema.ts` first and then adjust the public and internal modules that depend on it.
