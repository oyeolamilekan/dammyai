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

The app schema merges Better Auth tables from `betterAuth/schema.ts` with DammyAI-specific tables from `schema.ts`.

#### Auth tables

- `user`: Better Auth user profile rows with email, display fields, phone metadata, and optional external `userId` linkage. Common indexes: `email_name`, `username`, `phoneNumber`, `userId`.
- `session`: session tokens keyed by `token` and user ownership, with expiry timestamps for cleanup and validation. Common indexes: `token`, `userId`, `expiresAt`.
- `account`: provider account links for auth/OAuth providers, including access/refresh tokens and expiry metadata. Common indexes: `accountId_providerId`, `providerId_userId`, `userId`.
- `verification`: verification codes/tokens keyed by `identifier` with expiry tracking. Common indexes: `identifier`, `expiresAt`.
- `twoFactor`: TOTP secrets and backup codes by user. Common index: `userId`.
- `passkey`: WebAuthn credentials by `credentialID` and `userId`.
- `oauthApplication`: Better Auth OAuth client registrations keyed by `clientId` and optional owner `userId`.
- `oauthAccessToken`: OAuth access/refresh tokens keyed by `accessToken`, `refreshToken`, `clientId`, and `userId`.
- `oauthConsent`: stored OAuth consent grants keyed by `clientId_userId`.
- `jwks`: public/private key material for JWT/JWK support.
- `rateLimit`: simple request throttling records keyed by `key`.

#### App tables

- `integrations`: user-owned external provider credentials and Telegram linking state.
  - Fields include `provider`, `apiKey`, OAuth tokens, token expiry, `telegramChatId`, and `linkingCode`.
  - Common indexes: `userId`, `userId_provider`, `provider_linkingCode`, `provider_telegramChatId`.
- `memories`: short-form user memories for dashboard-visible notes and recent facts.
  - Fields: `userId`, `content`, optional `category`, `createdAt`, `updatedAt`.
  - Common indexes: `userId`, `userId_updatedAt`.
- `coreMemories`: durable key/value facts used by the assistant for identity, preferences, and stable context.
  - Fields: `userId`, `key`, `value`, optional `category`, optional `source`, timestamps.
  - Common indexes: `userId`, `userId_key`.
- `archivalMemories`: longer-form notes stored as free text with optional tags.
  - Fields: `userId`, `content`, optional `tags`, timestamps.
  - Common indexes: `userId`, `userId_updatedAt`.
- `messages`: conversation history for the assistant.
  - Fields: `userId`, `role` (`user`, `assistant`, `tool`), `content`, optional tool metadata, `createdAt`.
  - Common index: `userId_createdAt`.
- `souls`: per-user AI configuration and preferences.
  - Fields: `systemPrompt`, optional `modelPreference`, optional `searchProvider`, optional `researchModelPreference`, timestamps.
  - Common index: `userId`.
- `scheduledTasks`: one-off and recurring automation tasks.
  - Fields: `prompt`, `type`, optional scheduling timestamps, optional last-run/result metadata, `enabled`, timestamps.
  - Common indexes: `userId`, `enabled_nextRunAt`.
- `taskExecutionLogs`: structured execution history for scheduled tasks.
  - Fields: `taskId`, `startedAt`, optional `completedAt`, `status`, optional `result` / `error`, and detailed `steps`.
  - Common indexes: `taskId`, `taskId_startedAt`.
- `backgroundResearch`: long-running research job tracking.
  - Fields: `prompt`, `status`, optional `result`, optional `summary`, optional `error`, optional `checkpoints`, `createdAt`, optional `completedAt`.
  - Common indexes: `userId_createdAt`, `status_createdAt`, `userId_status_createdAt`.

#### Index usage guidance

- Prefer the user-scoped indexes (`userId`, `userId_updatedAt`, `userId_createdAt`) for dashboard reads.
- Use composite indexes exactly in declared field order when calling `.withIndex()`.
- `enabled_nextRunAt` powers scheduled-task polling in cron workers.
- `status_createdAt` and `userId_status_createdAt` power research job processing and filtered user views.

#### Relationship map

Convex does not enforce SQL-style foreign keys here, but the schema has a few important application-level relationships:

- `user` is the root identity table for authenticated users.
- `session.userId`, `account.userId`, `twoFactor.userId`, and `passkey.userId` all belong to a `user` row from Better Auth.
- `integrations.userId` links external provider credentials and Telegram linkage to a user.
- `memories.userId`, `coreMemories.userId`, `archivalMemories.userId`, `messages.userId`, and `souls.userId` all belong to the same user-scoped assistant context.
- `scheduledTasks.userId` ties automations to a user, and `taskExecutionLogs.taskId` points to a `scheduledTasks` row.
- `scheduledTasks.lastLogId` optionally points back to the latest `taskExecutionLogs` row for quick task status display.
- `backgroundResearch.userId` ties research jobs to a user; the stored `result`, `summary`, and `checkpoints` belong to that user-owned job.
- `telegramProcessedUpdates` tracks processed Telegram `update_id` values for webhook idempotency, preventing duplicate processing of the same message.
- `integrations.provider` determines how the rest of the integration fields are interpreted. For example, Telegram uses `telegramChatId` / `linkingCode`, while OAuth providers use access and refresh tokens.
- `messages` and `coreMemories` / `archivalMemories` are indirectly related through shared `userId`: the AI runtime reads both to build context, but they are stored separately for different retention and UX needs.

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
- `tools.ts`: AI SDK tool definitions, tool-output formatting, and a per-invocation dedup guard for background research
- `memory.ts`: auto-extraction and persistence of memories from conversations
- `config.ts`: model normalization, prompt construction, and re-exports from `prompts.ts`
- `prompts.ts`: centralized prompt definitions for all agents (main assistant, scheduled tasks, deep research, memory extraction)
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
- claim-before-execute pattern to prevent duplicate execution by overlapping cron ticks
- execution via the AI runtime
- result logging
- optional Telegram delivery

Prompt constants for task execution live in `ai/prompts.ts` (imported as `TASK_SYSTEM_PROMPT`).

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
