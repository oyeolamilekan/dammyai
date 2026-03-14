# DammyAI Architecture Guide

> Last Updated: March 2026
> This is a comprehensive guide to the DammyAI codebase structure, patterns, and conventions for context-aware development.

## Table of Contents
1. [Routing & Navigation](#routing--navigation)
2. [Convex Backend Architecture](#convex-backend-architecture)
3. [Frontend Patterns](#frontend-patterns)
4. [AI Integration](#ai-integration)
5. [Authentication Pattern](#authentication-pattern)
6. [Key Conventions](#key-conventions)
7. [Styling](#styling)
8. [State Management](#state-management)
9. [External Integrations](#external-integrations)
10. [Standalone PDF Worker](#standalone-pdf-worker)
11. [Project Organization](#project-organization)

---

## Routing & Navigation

### Routing Pattern
- **Framework**: TanStack Router (v1.158.1)
- **Pattern**: File-based routing with TanStack Router
- **Location**: `/src/routes/`
- **Generated**: Route tree is auto-generated to `src/routeTree.gen.ts`

### Route Structure
```
src/routes/
├── __root.tsx              # Root layout with HeadContent, Scripts, theme provider
├── index.tsx               # Home page (/) - redirects to /dashboard if authenticated
├── login.tsx               # Login/signup page with email+password auth
└── dashboard.tsx           # Dashboard layout wrapper with sidebar
    ├── index.tsx           # Dashboard overview page
    ├── integrations.tsx    # Integration management (Gmail, Calendar, Todoist, Notion, Telegram, Exa)
    ├── memories.tsx        # Memory management (core, archival, search)
    ├── souls.tsx           # AI soul/system prompt configuration
    ├── tasks.tsx           # Scheduled tasks (one-off & recurring)
    ├── research.tsx        # Background research job management
    ├── preferences.tsx     # User preferences
    └── account.tsx         # Account management
```

### Key Routing Details
- **Root Route**: `src/routes/__root.tsx` - Sets up HTML structure, theme script, Toaster, and ThemeProvider
- **Query Client Integration**: Router context includes `QueryClient` for TanStack Query
- **Auth Wrapping**: `ConvexBetterAuthProvider` wraps the app for authentication context
- **Protected Routes**: Use `requireAuth` guard from `src/lib/require-auth.ts` in `beforeLoad`
- **Route Params**: Search params validated via `validateSearch()` in route definitions (e.g., login redirect)
- **Preloading**: Default preload strategy is `'intent'` for faster navigation
- **Research Viewer**: `src/routes/dashboard/research.tsx` renders full report HTML in-app through the themed `.research-report` container

### Navigation Configuration
**Main sidebar navigation** (`AppSidebar` component):
- Overview → `/dashboard`
- Integrations → `/dashboard/integrations`
- Memories → `/dashboard/memories`
- Soul → `/dashboard/souls`
- Tasks → `/dashboard/tasks`
- Research → `/dashboard/research`
- Preferences → `/dashboard/preferences`
- Account → `/dashboard/account`

---

## Convex Backend Architecture

### Database Schema
**Location**: `convex/schema.ts`

#### Core Tables

**Authentication** (via better-auth):
- `user` - User profiles with email, name, image, timestamps
- `session` - Session tokens with expiration and user association
- `account` - OAuth provider accounts (Gmail, Google Calendar, etc.)
- `verification` - Email/phone verification tokens
- `passkey` - WebAuthn/passkey credentials
- `twoFactor`, `oauthApplication`, `oauthAccessToken` - Advanced auth features

**User Data**:
- `integrations` - OAuth & API key storage for external services
  - Providers: `telegram`, `gmail`, `google_calendar`, `todoist`, `notion`, `exa`
  - Indexed by: userId, userId+provider, provider+linkingCode
  
- `memories` - Short-form facts and recent information
  - `userId`, `content`, `category`, `createdAt`, `updatedAt`
  - Indexed by: userId, userId+updatedAt
  
- `coreMemories` - Persistent user facts (name, timezone, preferences)
  - `userId`, `key`, `value`, timestamps
  - Indexed by: userId, userId+key
  
- `archivalMemories` - Long-form notes and detailed context
  - `userId`, `content`, `tags`, timestamps
  - Indexed by: userId, userId+updatedAt

**Conversation & Tasks**:
- `messages` - Conversation history (user, assistant, tool messages)
  - Indexed by: userId+createdAt (for efficient retrieval)
  
- `souls` - AI configuration per user
  - `userId`, `systemPrompt`, `modelPreference`, `searchProvider`, `researchModelPreference`
  - Indexed by: userId
  
- `scheduledTasks` - One-off and recurring tasks
  - Types: `one_off`, `recurring`
  - Fields: `prompt`, `type`, `intervalMs`, `runAt`, `nextRunAt`, `enabled`
  - Indexed by: userId, enabled+nextRunAt (for scheduler)
  
- `taskExecutionLogs` - Execution history with step details
  - Indexed by: taskId, taskId+startedAt
  
- `backgroundResearch` - Research job tracking
  - Status: `pending`, `running`, `completed`, `failed`
  - Fields: `prompt`, `status`, `result`, `summary`, `checkpoints`
  - Indexed by: userId+createdAt, status+createdAt, userId+status+createdAt

### HTTP Routes
**Location**: `convex/http.ts`

**Auth Routes** (via better-auth component):
- `POST /api/auth/*` - All better-auth endpoints (sign-in, sign-up, sessions, etc.)

**Telegram Integration**:
- `POST /api/telegram/webhook` - Telegram bot webhook handler
- `POST /api/telegram/register-webhook` - Register webhook with Telegram
- `POST /api/telegram/unregister-webhook` - Unregister webhook

**OAuth Callbacks**:
- `GET /api/integrations/gmail/auth` - Initiate Gmail OAuth
- `GET /api/integrations/gmail/callback` - Gmail callback handler
- `GET /api/integrations/google-calendar/auth` - Initiate Google Calendar OAuth
- `GET /api/integrations/google-calendar/callback` - Google Calendar callback
- `GET /api/integrations/todoist/auth` - Initiate Todoist OAuth
- `GET /api/integrations/todoist/callback` - Todoist callback
- `GET /api/integrations/notion/auth` - Initiate Notion OAuth
- `GET /api/integrations/notion/callback` - Notion callback

### AI & Tools

#### `convex/aiActions.ts` - AI Execution Engine
**Purpose**: Orchestrates AI-powered task execution with tool calling

**Key Functions**:
- `executeAIPrompt` (internalAction) - Main AI execution with tool integration
  - Takes user prompt, system prompt override, model preference
  - Loads conversation history, core memories, and recent facts
  - Uses AI SDK with tool calling (max 8 steps)
  - Automatically extracts and saves memories after each turn
  - Calls `onToolCall` callback for tool execution tracking

- `generateAssistantReply` (internalAction) - Simple text generation without tools
  - Used for non-interactive AI responses
  - No tool calling, just text completion

**Tool Creation**:
- Memory tools: `saveCoreMemory`, `deleteCoreMemory`, `saveArchivalMemory`, `searchArchivalMemory`, `deleteArchivalMemory`
- Task tools: `createScheduledTask`, `listScheduledTasks`, `updateScheduledTask`, `deleteScheduledTask`
- Research tools: `startBackgroundResearch`, `cancelBackgroundResearch`
- Integration tools: Gmail, Google Calendar, Todoist, Notion, Telegram, Web Search (Exa or Tavily)

**Default Behavior**:
- Default model: `openai/gpt-4o-mini`
- Memory extraction model: `openai/gpt-4o-mini`
- System prompt includes memory instructions and tool documentation
- Timezone support: Reads user's timezone from core memory, converts times to UTC

#### `convex/aiStore.ts` - Data Access Layer for AI
**Internal queries & mutations**:
- `getSoulByUserId()` - Get AI configuration
- `getConversationHistory()` - Get recent messages (filters tool-only messages)
- `getUserMemories()` - Get recent facts
- `getCoreMemories()` - Get all core memories
- `saveMessage()` - Save conversation messages
- `saveExtractedMemories()` - Auto-save discovered facts

#### `convex/aiTools.ts` - AI Tool Definitions
**Purpose**: Individual tool implementations for AI agent

**Memory Tools**:
- CRUD operations for core and archival memories
- Search archival memories by keyword/tags

**Task Management Tools**:
- Create one-off and recurring tasks with timezone conversion
- List, update, delete tasks
- Validates recurring interval >= 1 minute

**Research Tools**:
- Start background research job (async)
- Cancel pending/running research

**Integration Tools** (created in separate modules):
- Email: check inbox, send mail (with draft confirmation), archive/delete
- Calendar: check schedule, schedule calls, remove events
- Todoist: check tasks, add/update/complete tasks
- Notion: create docs, update docs, search workspace
- Telegram: send messages to linked chat
- Web Search: Exa or Tavily provider (configurable per user)

### Authentication & Session Management

#### `convex/auth.ts`
- `getCurrentUser()` (query) - Get authenticated user via better-auth
- `getAuthUser` - Component-based auth method

#### `convex/auth.config.ts`
- Configures better-auth with email/password provider
- Enables convex database adapter plugin

#### `convex/betterAuth/` - Better-Auth Integration
**Files**:
- `auth.ts` - Creates auth client with Convex adapter
  - Database adapter: `authComponent.adapter(ctx)`
  - baseURL: `SITE_URL` or `http://localhost:3000`
  - Secret: `BETTER_AUTH_SECRET` (32+ chars)
  
- `schema.ts` - Defines auth tables (user, session, account, verification, 2FA, etc.)
- `adapter.ts` - Adapts Convex queries/mutations to better-auth interface

**Session Flow**:
1. Frontend calls `authClient.signIn.email()` or `authClient.signUp.email()`
2. better-auth HTTP handler processes request via `/api/auth/*`
3. Session token stored in HTTP cookie
4. Frontend caches session for 30 seconds to avoid blocking on navigation
5. Queries automatically include auth context via Convex adapter

#### `convex/lib/session.ts` - Helper Functions
- `getUserId()` - Get current user ID from auth context (returns null if unauthenticated)
- `requireUserId()` - Get user ID or throw Unauthorized error

### Integration Management

#### `convex/integrations.ts` - Integration CRUD
- `listIntegrations()` (query) - List all connected services
- `upsertIntegration()` (mutation) - Save OAuth tokens or API keys
- `deleteIntegration()` (mutation) - Disconnect a service
- `createTelegramLink()` (mutation) - Generate linking code for Telegram bot
- `upsertIntegrationInternal()` (internalMutation) - Used by OAuth callbacks

### Task Execution & Scheduling

#### `convex/tasks.ts` - Task Management & Execution
- `listTasks()` (query) - Paginated list of user's tasks
- `createTask()` (mutation) - Create one-off or recurring task
- `updateTask()` (mutation) - Update task prompt or enable/disable
- `deleteTask()` (mutation) - Delete task
- `runDueTasks()` (internalAction) - Scheduler action that runs due tasks every minute
- `executeTask()` (internalAction) - Single task execution via AI engine

**Task Schema**:
- **one_off**: Runs once at specified time (`runAt`)
- **recurring**: Runs every N minutes (`intervalMs`), with optional first run time

#### `convex/crons.ts` - Background Jobs
```typescript
crons.interval('process due scheduled tasks', { minutes: 1 }, internal.tasks.runDueTasks)
crons.interval('process pending research jobs', { minutes: 1 }, internal.research.processPendingResearch)
```

### Research & Deep Dive

#### `convex/research.ts` - Background Research
- `listResearch()` (query) - List background research jobs
- `createResearchTask()` (mutation) - Create new research job
- `getResearchReport()` (query) - Get detailed report with HTML/PDF
- `processResearchJob()` (internalAction) - Execute deep research with checkpoints
- `markResearchCompleted()`, `markResearchFailed()` - Status updates
- `addCheckpoint()` - Add progress checkpoint
- Sends wrapped report HTML to the standalone PDF API before Telegram PDF delivery

#### `convex/lib/deepResearch.ts` - Research Algorithm
- Multi-step research process with:
  - Web search (Exa or Tavily)
  - Content analysis
  - Synthesis & summarization
- Checkpoint tracking for progress visibility
- HTML report generation with sources

### Memory Management

#### `convex/memories.ts` - Memory CRUD
- `listMemories()` (query) - Paginated memories
- `createMemory()` (mutation) - Save manual memory
- `updateMemory()` (mutation) - Edit memory
- `deleteMemory()` (mutation) - Delete memory
- `coreMemories` - Separate CRUD for persistent facts (max 20 per user)

### Soul Configuration

#### `convex/soul.ts` - AI Personality
- `getSoul()` (query) - Get AI configuration
- `upsertSoul()` (mutation) - Update system prompt or model preferences

**Fields**:
- `systemPrompt` - Custom system prompt
- `modelPreference` - Override default model (e.g., "gpt-4-turbo")
- `searchProvider` - Choice of "exa" or "tavily" for web search
- `researchModelPreference` - Separate model for research tasks

### External Tool Implementations

#### `convex/tools/` Directory

**Gmail Integration** (`gmail.ts`):
- `createCheckMailTool()` - Read inbox with query filtering
- `createSendMailTool()` - Compose and send emails
- `createManageMailTool()` - Archive/delete/label emails

**Google Calendar** (`googleCalendar.ts`):
- `createCheckScheduleTool()` - List upcoming events
- `createScheduleCallTool()` - Create calendar events
- `createRemoveEventTool()` - Delete events

**Todoist** (`todoist.ts`):
- `createCheckTodosTool()` - List tasks and projects
- `createUpdateTodoTool()` - Add/complete/remove tasks

**Notion** (`notion.ts`):
- `createNotionDocumentTool()` - Create new page
- `createUpdateNotionDocumentTool()` - Update content
- `createSearchNotionTool()` - Search workspace

**Telegram** (`telegram.ts`):
- `createSendTelegramMessageTool()` - Send message to linked chat

**Web Search**:
- `createWebSearchTool()` (exa.ts) - Search with Exa API
- `createTavilySearchTool()` (tavily.ts) - Search with Tavily API

### Library Functions

#### `convex/lib/`

**`google.ts`** - OAuth token management
- Refresh Google OAuth tokens when expired
- Get current access token for Gmail/Calendar

**`deepResearch.ts`** - Multi-step research algorithm
- Plan research steps
- Execute parallel searches
- Synthesize results into summary & HTML report
- Wrap report HTML with print-oriented PDF styles and pagination rules

**`pdfApi.ts`** - Standalone PDF API client
- Calls `${PDF_API_BASE_URL}/pdf`
- Used by Convex research delivery instead of local PDF rendering

**`pdfGenerator.ts`** - Legacy/local PDF generation
- Older in-repo PDF rendering helper
- Prefer the standalone `api/pdf` worker for current research PDF delivery

**`telegramFormat.ts`** - Markdown to Telegram HTML conversion
- Handles bold, italic, links, code blocks
- Escape special HTML characters

**`env.ts`** - Environment variable helpers
- `getRequiredEnv()` - Throws if missing
- `getOptionalEnv()` - Returns undefined if missing

**`session.ts`** - Auth context helpers (see above)

### Telegram Integration

#### `convex/telegram.ts` - Telegram Bot Handler
- `webhook()` - Handles incoming Telegram messages
- `registerWebhook()` - Register webhook with Telegram API
- `unregisterWebhook()` - Unregister webhook
- `sendTelegramMessage()` - Send formatted message to chat
- `sendChatAction()` - Send typing indicator

**Linking Flow**:
1. User clicks "Link Telegram" in integrations page
2. Creates linking code (8-char random)
3. User starts Telegram bot with `/start <code>`
4. Bot verifies code and saves chatId to integration record
5. AI can now send messages to user's private chat

---

## Frontend Patterns

### Component Organization

**Location**: `src/components/`

#### Structure
```
src/components/
├── ui/                          # Shadcn/Radix components
│   ├── button.tsx, input.tsx, card.tsx, dialog.tsx, etc.
│   └── sidebar.tsx, sheet.tsx, drawer.tsx (layout components)
├── app-sidebar.tsx              # Dashboard sidebar with navigation
├── site-header.tsx              # Header bar with breadcrumbs
├── nav-main.tsx                 # Main navigation links
├── nav-secondary.tsx            # Secondary actions (research, etc.)
├── nav-user.tsx                 # User menu (profile, logout)
├── nav-documents.tsx            # Document/research breadcrumb
├── data-table.tsx               # Reusable data table component
├── chart-area-interactive.tsx   # Interactive area chart (Recharts)
├── section-cards.tsx            # Card grid layout component
└── theme-{provider,toggle}.tsx  # Theme switching (light/dark)
```

#### Naming Conventions
- **Components**: PascalCase (e.g., `AppSidebar`, `NavMain`)
- **Files**: kebab-case (e.g., `app-sidebar.tsx`)
- **Directories**: lowercase (e.g., `components/ui/`)
- **Props**: Typed interfaces with optional spreading of standard props

### UI Component Library
- **Framework**: Radix UI with Shadcn customizations
- **Icons**: Lucide React + Tabler Icons
- **Tables**: TanStack Table (React Table) for data grids
- **Charts**: Recharts for interactive visualizations
- **Toasts**: Sonner for notifications
- **Theme**: next-themes for light/dark mode persistence

### Data Fetching Pattern

**Convex Hooks** (from `convex/react`):
```typescript
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'

const user = useQuery(api.auth.getCurrentUser)
const updateSoul = useMutation(api.soul.upsertSoul)
```

**TanStack Query Integration**:
- Router uses `ConvexQueryClient` from `@convex-dev/react-query`
- Convex subscriptions auto-update via WebSocket
- Stale time: `Infinity` (data kept fresh by subscriptions)
- Garbage collection: 10 minutes of non-use

**Pattern**:
1. Route defines `QueryClient` in context
2. `routerWithQueryClient()` integrates TQ with TRouter
3. Components use `useQuery()` hooks directly
4. Mutations auto-update cached data via Convex reactivity

### Custom Hooks

**Location**: `src/hooks/`

- `use-mobile.ts` - Responsive design hook for mobile breakpoint
  - Returns boolean, useful for showing/hiding mobile-specific UI

### Library Utilities

**Location**: `src/lib/`

- `auth-client.ts` - Better-auth client setup
  - `authClient` - Configured with Convex plugin
  - `getCachedSession()` - Caches session for 30 seconds
  - `clearSessionCache()` - Clears cache on sign-in/out
  
- `require-auth.ts` - Route guard
  - `requireAuth()` - beforeLoad guard that redirects to /login
  
- `utils.ts` - General utilities
  - Likely contains `cn()` for className merging (clsx + tailwind-merge)

### Form & Input Patterns

- **Uncontrolled inputs** in simple forms (login, create task)
- **Controlled components** for complex forms with validation
- **Toast notifications** for user feedback (`toast.success()`, `toast.error()`)
- **Dialog/modal** components for confirmations and editing
- **Loading states**: Disabled buttons, skeleton loaders, spinners

### List & Pagination Pattern

**Common in multiple pages** (memories, tasks, research):
```typescript
const [page, setPage] = useState(1)
const data = useQuery(api.memories.listMemories, { page, limit: 20 })
// data: { items, total, page, limit, totalPages }
```

---

## AI Integration

### AI SDK & Models

**Framework**: `ai` SDK (v6.0.107) by Vercel
- Provider: OpenAI via `@ai-sdk/openai`
- `generateText()` - Simple text completion
- `generateObject()` - Structured outputs
- Tool calling - Integrated with Zod schemas

### Model Configuration

**Default Models**:
- Chat/Tasks: `openai/gpt-4o-mini` (can be overridden)
- Memory Extraction: `openai/gpt-4o-mini` (separate model)
- Research: User can configure separate model preference

**Environment Variables**:
```
AI_GATEWAY_API_KEY        # Required for all AI operations
AI_GATEWAY_MODEL          # Default model for chat
AI_GATEWAY_MEMORY_MODEL   # Model for memory extraction
OPENAI_API_KEY           # Fallback (if AI_GATEWAY_* not set)
```

### Tool Architecture

**Zod Schemas** for validation:
```typescript
tool({
  description: 'What the tool does',
  inputSchema: z.object({
    key: z.string().describe('param description'),
  }),
  execute: async ({ key }) => {
    // Implementation
  },
})
```

**Tool Calling Flow**:
1. AI generates tool call with arguments
2. Tool executed with validated inputs
3. Output saved to conversation history
4. Next turn includes tool output as context

### Memory System

**3-Tier Memory Hierarchy**:

1. **Core Memory** (persistent facts)
   - Key-value pairs: timezone, name, job, preferences
   - Max 20 entries per user
   - Manually curated + auto-updated

2. **Archival Memory** (detailed notes)
   - Long-form content with tags
   - Searchable by keyword
   - Useful for meeting notes, project context

3. **Recent Facts** (temporary context)
   - Auto-extracted from conversations
   - Ephemeral, useful for current session
   - Forgotten after some time

**Auto-Extraction Process**:
- After each AI turn, extract new facts from conversation
- Compare against existing memories (avoid duplicates)
- Save with category (preference, contact, schedule, personal, work)

### Timezone Handling

**Convention**: 
- User's timezone stored in core memory (key: "timezone")
- Expressed as IANA timezone (e.g., "America/New_York", "Africa/Lagos")
- System prompt includes current time in user's timezone
- User specifies times naturally (e.g., "9am tomorrow")
- AI converts to UTC ISO 8601 for task scheduling

**Example**:
```typescript
// System prompt includes:
// "Current date/time: 03/12/2025 09:30:45 WAT"
// "User timezone: Africa/Lagos"
// User: "Schedule for tomorrow at 2pm"
// AI converts to: "2025-03-13T13:00:00Z" (13:00 UTC = 2pm WAT)
```

---

## Authentication Pattern

### Better-Auth Integration

**Framework**: `better-auth` (v1.4.9) with `@convex-dev/better-auth` adapter

**Providers**:
- Email/Password (enabled)
- OAuth (configured per integration)

**Database Adapter**:
- Uses Convex tables for persistence
- Automatic session management
- Token refresh handling

### Frontend Auth Client

```typescript
const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [convexClient()],
})

// Usage:
await authClient.signIn.email({ email, password })
await authClient.signUp.email({ name, email, password })
await authClient.signOut()
const session = await authClient.getSession()
```

### Session Management

**Caching**:
- Frontend caches session for 30 seconds
- Prevents redundant auth queries on navigation
- Cache auto-invalidates after timeout

**Middleware**:
- `requireAuth` beforeLoad guard on protected routes
- Redirects to `/login` with return URL if unauthenticated
- User checking query on dashboard renders

### OAuth Flow

**Pattern for Gmail, Google Calendar, Todoist, Notion**:
1. User clicks "Connect [Service]"
2. Frontend redirects to `/api/integrations/{service}/auth`
3. HTTP handler initiates OAuth2 authorization request
4. User approves scopes on provider's site
5. Provider redirects to `/api/integrations/{service}/callback`
6. Callback handler:
   - Exchanges auth code for access token
   - Saves to integrations table via `upsertIntegrationInternal()`
   - Redirects to frontend with success/error
7. Frontend updates integration list via `listIntegrations()` query

---

## Key Conventions

### Naming Conventions

**Files**:
- Components: kebab-case (e.g., `app-sidebar.tsx`)
- Routes: kebab-case (e.g., `/dashboard/integrations.tsx`)
- Convex functions: camelCase (e.g., `executeAIPrompt`)

**Types**:
- Interfaces: PascalCase with leading `I` optional (e.g., `AIPromptArgs`)
- Enums: PascalCase (e.g., `TaskType`)
- Const validators: lowercase with purpose suffix (e.g., `providerValidator`)

**Functions**:
- Public API: camelCase (e.g., `listMemories`)
- Internal helpers: underscore prefix (e.g., `_normalizeModelId()`)
- Tool creators: `createXyzTool()` pattern

### Data Patterns

**Timestamps**:
- Always `Date.now()` in milliseconds
- Converted to ISO strings for API responses
- Indexed for range queries (createdAt, updatedAt)

**IDs**:
- Convex: `Id<'table'>` type from `_generated/dataModel`
- Frontend: String conversion with `String(id)`

**Pagination**:
- Request: `{ page?: number, limit?: number }`
- Response: `{ items: T[], total: number, page: number, limit: number, totalPages: number }`

**Status Enums**:
- Tasks: `one_off` | `recurring`
- Research: `pending` | `running` | `completed` | `failed`
- Auth: status values from better-auth

### Error Handling

**Backend**:
- Throw `Error` for validation failures
- `requireUserId()` throws "Unauthorized" if not authenticated
- HTTP handlers return `json(error, status)` responses

**Frontend**:
- Use `toast.error()` for user-facing errors
- Try-catch blocks around async operations
- Show loading states during operations

### Validation

**Zod Schemas**:
- Tool inputs use Zod with descriptions
- Route search params validated via `validateSearch()`
- Database operations validate with `v.*` validators

### Query & Mutation Patterns

**Public Queries** (accessible with auth):
```typescript
export const getName = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx)
    // Can return null if unauthenticated
  },
})
```

**Protected Mutations** (require auth):
```typescript
export const updateName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx) // Throws if not auth
  },
})
```

**Internal Functions** (backend-only):
```typescript
export const internalFn = internalQuery({...})
export const internalFn = internalMutation({...})
export const internalFn = internalAction({...})
// Called via internal.<file>.<fn>()
```

---

## Styling

### CSS Framework
- **Tailwind CSS v4** with Vite plugin
- **Plugins**: `@tailwindcss/typography` for rich text
- **Custom variants**: Dark mode (`.dark` class)

### Theme System

**CSS Custom Properties** (in `src/styles/app.css`):
```css
:root {
  --radius: 0.625rem;
  --background: oklch(...);
  --foreground: oklch(...);
  --primary: oklch(...);
  /* ... color palette ... */
}

.dark {
  --background: oklch(...);
  /* ... dark mode overrides ... */
}
```

**Color Format**: OKLch for perceptually uniform colors
- Supports light/dark mode with single definition
- Good contrast and readability

**Layout**:
- Sidebar system with `SidebarProvider`, `Sidebar`, `SidebarInset`
- Responsive breakpoints: `md:` (768px+)
- Consistent spacing with Tailwind scale

### Component Styling

**Pattern**:
- Base styles on component elements
- Conditional styles via className merging
- Dark mode via `dark:` prefix
- Custom variant: `[@supports]` for feature detection

**Example**:
```tsx
<div className="bg-background text-foreground dark:bg-card">
  {/* automatically inverted in dark mode */}
</div>
```

### Icon System

**Lucide React**: Generic icons
- `Loader2`, `ChevronDown`, `X`, `Check`, etc.

**Tabler Icons**: Domain-specific icons
- `IconBrain`, `IconPlug`, `IconSparkles`, `IconCalendarEvent`
- More varied and specialized than Lucide

---

## State Management

### TanStack Query (React Query)

**Integration**:
```typescript
// src/router.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
      staleTime: Infinity,           // Convex keeps data fresh
      gcTime: 10 * 60 * 1000,        // 10 min garbage collection
    },
  },
})
```

**Pattern**:
- Convex queries generate cache keys automatically
- WebSocket subscriptions keep data fresh
- No manual refetch needed
- Navigation is instant due to infinite staleTime

### Convex React Hooks

```typescript
import { useQuery, useMutation } from 'convex/react'

// Reading data
const user = useQuery(api.auth.getCurrentUser)

// Writing data
const updateSoul = useMutation(api.soul.upsertSoul)
await updateSoul({ systemPrompt: '...' })
```

**Behavior**:
- `useQuery` returns undefined while loading, then data or null
- `useMutation` returns a callable function
- Automatic cache invalidation on mutation

### Local State

**React Hooks**: `useState` for component-local state
- Form inputs
- Modal open/closed state
- Loading flags during async operations

**Example**:
```typescript
const [isSubmitting, setIsSubmitting] = useState(false)
const [email, setEmail] = useState('')
```

### No Redux/Zustand

- State is kept minimal via Convex reactivity
- Page-specific state via local useState
- Auth state via better-auth session

---

## External Integrations

### Email (Gmail)

**Provider**: Google Cloud - Gmail API
**Scope**: `https://www.googleapis.com/auth/gmail.modify`

**Tools**:
- Check mail (list inbox with query filtering)
- Send mail (compose and send)
- Manage mail (archive, delete, label)

**Flow**:
1. User connects via OAuth at `/api/integrations/gmail/auth`
2. Access token stored in `integrations` table
3. Token auto-refreshed via `getGmailAccessToken()` helper
4. AI tool uses token to call Gmail API

### Calendar (Google Calendar)

**Provider**: Google Cloud - Google Calendar API
**Scope**: `https://www.googleapis.com/auth/calendar`

**Tools**:
- Check schedule (list upcoming events)
- Schedule call (create event with auto-linking)
- Remove event (delete event)

### Task Management (Todoist)

**Provider**: Todoist API (OAuth 2.0)
**Scope**: Task creation and completion

**Tools**:
- Check todos (list tasks grouped by project)
- Update todo (add new task or mark complete)

### Notes (Notion)

**Provider**: Notion API
**Auth**: OAuth 2.0 with workspace capability

**Tools**:
- Create Notion document (new page with template)
- Update Notion document (append blocks)
- Search Notion (query database or search all)

### Telegram Bot

**Provider**: Telegram Bot API

**Setup**:
```
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_BOT_USERNAME=<username>
```

**Linking**:
1. User generates code in integrations UI
2. User opens Telegram and does `/start <code>`
3. Bot webhook receives message
4. Bot verifies code and saves chatId
5. AI can send updates to user's chat

**Webhook**:
- `POST /api/telegram/webhook` - Receives all bot messages
- Registered with Telegram API
- Can be registered/unregistered via HTTP endpoints

### Web Search (Exa or Tavily)

**Exa** (default):
- API Key authentication
- Supports live crawl and result summarization
- Provider: `exa` (environment variable: `EXA_API_KEY`)

**Tavily**:
- API Key authentication  
- Specialized for research-grade searches
- Provider: `tavily` (environment variable: `TAVILY_API_KEY`)

**User Choice**:
- Stored in `souls.searchProvider`
- Configured per user
- Used in AI web search tool

### OAuth Callback Pattern

All OAuth callbacks (`convex/oauth/*.ts`) follow this pattern:
1. Extract auth code from URL params
2. Exchange code for access token via provider API
3. Call `upsertIntegrationInternal()` to save token
4. Redirect to frontend with success/error flag
5. Frontend navigates back to integrations page with feedback

---

## Standalone PDF Worker

### Overview
- **Location**: `api/pdf/`
- **Runtime**: Hono on Cloudflare Workers
- **Renderer**: Cloudflare Browser Rendering via `@cloudflare/puppeteer`
- **Purpose**: Convert HTML into high-fidelity PDFs outside Convex

### File Layout
```text
api/pdf/
├── src/app.ts         # Hono routes and error handling
├── src/index.ts       # Worker entrypoint and exports
├── src/render.ts      # Browser-based HTML -> PDF rendering
├── src/request.ts     # Request parsing and filename normalization
├── src/types.ts       # Shared worker types and constants
├── wrangler.jsonc     # Cloudflare Worker config
└── README.md          # Worker-specific docs
```

### API Contract
- `GET /` - Service metadata
- `GET /health` - Health check
- `POST /pdf` - Accepts HTML and returns a PDF

`POST /pdf` supports:
- JSON body: `{ html, title?, fileName? }`
- raw HTML body with optional `title` and `fileName` query params

### Operational Notes
- Use `bun run dev:pdf-api` for local worker development
- Use `bun run deploy:pdf-api` for deployment
- Worker config uses `nodejs_compat`
- Browser binding name is `BROWSER`
- Local development uses `remote: true`, so it depends on Cloudflare's remote browser runtime
- Convex integrates with this worker through `PDF_API_BASE_URL`

---

## Project Organization

### Directory Structure

```
dammyai/
├── api/
│   └── pdf/                       # Standalone HTML-to-PDF worker
│       ├── src/
│       │   ├── app.ts            # Hono app and routes
│       │   ├── index.ts          # Entrypoint and exports
│       │   ├── render.ts         # Browser rendering
│       │   ├── request.ts        # Request parsing
│       │   └── types.ts          # Shared types
│       ├── wrangler.jsonc        # Cloudflare worker config
│       └── README.md             # Local docs
│
├── public/                        # Static assets (favicons, etc.)
├── src/
│   ├── routes/                    # TanStack Router file-based routes
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   ├── login.tsx
│   │   ├── dashboard.tsx
│   │   └── dashboard/
│   │       ├── index.tsx, integrations.tsx, memories.tsx, etc.
│   ├── components/                # React components
│   │   ├── ui/                    # Shadcn UI components
│   │   └── [business components]  # app-sidebar, nav-main, etc.
│   ├── lib/                       # Utilities and helpers
│   │   ├── auth-client.ts         # better-auth setup
│   │   ├── require-auth.ts        # Route guard
│   │   └── utils.ts               # General utilities
│   ├── hooks/                     # Custom React hooks
│   │   └── use-mobile.ts
│   ├── styles/                    # Global CSS
│   │   └── app.css                # Tailwind + theme variables
│   ├── router.tsx                 # Router initialization
│   └── routeTree.gen.ts           # Auto-generated route tree
│
├── convex/                        # Backend
│   ├── schema.ts                  # Database schema
│   ├── auth.ts                    # Auth queries
│   ├── auth.config.ts             # Auth provider config
│   ├── http.ts                    # HTTP routes
│   ├── aiActions.ts               # AI orchestration
│   ├── aiStore.ts                 # AI data layer
│   ├── aiTools.ts                 # AI tool definitions
│   ├── integrations.ts            # Integration CRUD
│   ├── memories.ts                # Memory management
│   ├── soul.ts                    # AI personality
│   ├── tasks.ts                   # Task execution & scheduling
│   ├── research.ts                # Background research
│   ├── crons.ts                   # Background jobs
│   ├── telegram.ts                # Telegram bot handler
│   ├── telegramStore.ts           # Telegram data persistence
│   │
│   ├── tools/                     # AI tool implementations
│   │   ├── gmail.ts, googleCalendar.ts, todoist.ts, notion.ts
│   │   ├── telegram.ts, exa.ts, tavily.ts
│   │
│   ├── lib/                       # Utilities
│   │   ├── google.ts              # OAuth token refresh
│   │   ├── deepResearch.ts        # Research algorithm
│   │   ├── pdfApi.ts              # Standalone PDF API client
│   │   ├── pdfGenerator.ts        # Legacy/local PDF generation helper
│   │   ├── telegramFormat.ts      # Markdown to HTML
│   │   ├── env.ts                 # Environment variables
│   │   └── session.ts             # Auth helpers
│   │
│   ├── betterAuth/                # better-auth integration
│   │   ├── auth.ts                # Auth client
│   │   ├── schema.ts              # Auth tables
│   │   ├── adapter.ts             # Convex adapter
│   │   └── _generated/            # Generated types
│   │
│   ├── oauth/                     # OAuth callbacks
│   │   ├── gmail.ts, googleCalendar.ts, todoist.ts, notion.ts
│   │
│   ├── _generated/                # Generated types (auto)
│   │   ├── api.d.ts, server.d.ts, dataModel.d.ts
│   │
│   └── convex.config.ts           # Convex app setup

├── tsconfig.json                  # TypeScript config
├── package.json                   # Dependencies & scripts
├── vite.config.ts                 # Vite + TanStack config
├── components.json                # Shadcn component registry
└── .env.local                     # Environment variables
```

### Key Files to Know

**Frontend Entry Points**:
- `src/router.tsx` - Router setup with Convex + TQuery integration
- `src/routes/__root.tsx` - HTML layout and global providers
- `src/routes/login.tsx` - Auth entry point

**Backend Entry Points**:
- `convex/http.ts` - All HTTP endpoint definitions
- `convex/schema.ts` - Database schema (single source of truth)
- `convex/aiActions.ts` - AI execution engine

**Configuration**:
- `vite.config.ts` - Frontend build (Tailwind, TanStack, Nitro)
- `convex/convex.config.ts` - Convex app setup
- `.env.local` - Secrets and API keys

### Development Scripts

```bash
npm run dev              # Start dev server (web + convex)
npm run dev:web         # Just Vite frontend
npm run dev:convex      # Just Convex backend
npm run build           # Production build
npm run lint            # TypeScript + ESLint
npm run format          # Prettier
```

### Environment Variables

**Required**:
```
VITE_CONVEX_URL         # Convex deployment URL
VITE_CONVEX_SITE_URL    # Convex site URL (for OAuth)
BETTER_AUTH_SECRET      # Auth secret (32+ chars)
AI_GATEWAY_API_KEY      # OpenAI or compatible endpoint
PDF_API_BASE_URL        # Standalone PDF worker base URL for Convex delivery
```

**Optional**:
```
EXA_API_KEY             # For Exa web search
TAVILY_API_KEY          # For Tavily research
TELEGRAM_BOT_TOKEN      # For Telegram integration
TELEGRAM_BOT_USERNAME   # Bot username for linking
```

### Database & Schema Evolution

- Schema in `convex/schema.ts` is source of truth
- Indexes optimized for query patterns (userId, composite keys)
- Migrations handled automatically by Convex
- Table-specific index strategies documented in schema

---

## Summary: Architecture at a Glance

| Aspect | Technology | Pattern |
|--------|-----------|---------|
| **Routing** | TanStack Router | File-based routes in `/src/routes/` |
| **Frontend State** | TanStack Query + Convex React | Hooks with auto-invalidation |
| **Backend** | Convex | Queries, mutations, actions in `/convex/` |
| **Database** | Convex (MongoDB-compatible) | Schema-driven with indexes |
| **Auth** | better-auth + Convex adapter | Email/password + OAuth |
| **AI/LLM** | Vercel AI SDK | Tool calling with streaming |
| **External APIs** | OAuth 2.0, REST APIs | Tool modules in `/convex/tools/` |
| **Styling** | Tailwind CSS v4 + Shadcn | CSS variables + dark mode |
| **Build** | Vite + TanStack Start | SPA with server-side preload |

---

## Quick Start for New Features

### Adding a new Dashboard Page

1. **Create route file**: `src/routes/dashboard/newpage.tsx`
2. **Use auth guard**: `beforeLoad: requireAuth`
3. **Add navigation**: Update `AppSidebar` in `src/components/app-sidebar.tsx`
4. **Create API**: Add query/mutation in `convex/newpage.ts`
5. **Use hooks**: `useQuery()` and `useMutation()` in component

### Adding an AI Tool

1. **Create tool file**: `convex/tools/mytool.ts`
2. **Implement tool creator**: `export function createMyTool(ctx, userId) { return tool({...}) }`
3. **Register in AI actions**: Add to `createAgentTools()` in `convex/aiActions.ts`
4. **Test**: Trigger via chat and monitor tool calls

### Adding a New Integration

1. **Add to schema**: Add provider to `providerValidator` union in `convex/schema.ts`
2. **Create OAuth flow**: Add files in `convex/oauth/newservice.ts`
3. **Add HTTP route**: Register in `convex/http.ts`
4. **Create tool**: `convex/tools/newservice.ts` implementing tool functions
5. **Update UI**: Add connector definition in `src/routes/dashboard/integrations.tsx`

---

## Notes for Claude-Powered Development

- **Always check schema first** when working with data
- **Use internal mutations/queries** for backend-only operations
- **Timezone awareness**: Store as IANA string, convert user inputs to UTC ISO
- **Error messaging**: Specific errors in mutations, user-friendly in frontend
- **Async patterns**: Tools are async, use `await` for database operations
- **Testing**: Run `npm run lint` and `npm run build` before committing
- **Auth checks**: Always call `getUserId()` or `requireUserId()` in sensitive operations

---

**Document Version**: 1.0 | Last Updated: March 2025
