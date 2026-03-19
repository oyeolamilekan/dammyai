# Frontend module guide

This directory contains the TanStack Start frontend for DammyAI.

## Module map

| Module              | Purpose                                                                                                             | Key files                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `routes/`           | File-based route definitions and page-level UI                                                                      | `routes/__root.tsx`, `routes/index.tsx`, `routes/login.tsx`, `routes/dashboard.tsx`                                            |
| `routes/dashboard/` | Authenticated product surfaces for tasks, research, memories, integrations, soul settings, account, and preferences | `dashboard/tasks.tsx`, `dashboard/research.tsx`, `dashboard/memories.tsx`, `dashboard/integrations.tsx`, `dashboard/souls.tsx` |
| `components/`       | App-level reusable components, layout pieces, and navigation                                                        | `app-sidebar.tsx`, `site-header.tsx`, `nav-main.tsx`, `nav-user.tsx`, `data-table.tsx`                                         |
| `components/ui/`    | shadcn/ui-style primitives used across pages                                                                        | `button.tsx`, `card.tsx`, `dialog.tsx`, `sidebar.tsx`, `tabs.tsx`, `chart.tsx`                                                 |
| `lib/`              | Shared frontend helpers                                                                                             | `auth-client.ts`, `require-auth.ts`, `utils.ts`                                                                                |
| `hooks/`            | Small reusable React hooks                                                                                          | `use-mobile.ts`                                                                                                                |
| `styles/`           | Global app styling                                                                                                  | `styles/app.css`                                                                                                               |

## Entry points

### `router.tsx`

Creates the application router and connects:

- TanStack Router
- TanStack Query
- Convex QueryClient
- Better Auth provider

This is the main integration point between the frontend and Convex.

### `routes/__root.tsx`

Defines the HTML shell, metadata, theme bootstrapping, and global UI wrappers like the toaster.

## Route structure

### Public routes

- `routes/index.tsx`: simple landing page and auth-aware entrypoint
- `routes/login.tsx`: sign-in/sign-up screen using Better Auth

### Authenticated routes

- `routes/dashboard.tsx`: dashboard shell with sidebar, header, and auth gate
- `routes/dashboard/index.tsx`: quick summary view
- `routes/dashboard/tasks.tsx`: create, list, pause, delete, and inspect scheduled tasks
- `routes/dashboard/research.tsx`: browse research jobs and open generated reports
- `routes/dashboard/memories.tsx`: manage core memories, archival memories, and conversations
- `routes/dashboard/integrations.tsx`: connect OAuth providers and Telegram
- `routes/dashboard/souls.tsx`: edit the assistant's system prompt and preferences
- `routes/dashboard/account.tsx`: account details
- `routes/dashboard/preferences.tsx`: user-level preferences (model selection, search provider, research model)

## Auth and session helpers

### `lib/auth-client.ts`

Creates the Better Auth client and caches session lookups briefly to avoid repeated blocking checks during navigation.

### `lib/require-auth.ts`

Used by protected routes to redirect unauthenticated users before rendering dashboard pages.

## UI patterns

- Most data comes directly from Convex via `useQuery`.
- Mutations are triggered with `useMutation`.
- Many route files cast `api as any` to work around generated type friction in route files.
- Feedback is shown with `sonner` toasts.
- Shared layout is built around the app sidebar and top header.

## Data ownership by page

| Page           | Convex modules used                         |
| -------------- | ------------------------------------------- |
| Home           | `auth`                                      |
| Login          | Better Auth client only                     |
| Dashboard home | `auth`, `integrations`, `tasks`, `research` |
| Tasks          | `tasks`, `taskLogs`                         |
| Research       | `research`                                  |
| Memories       | `memories`                                  |
| Integrations   | `integrations`                              |
| Souls          | `soul`                                      |

## Generated files

- `routeTree.gen.ts` is generated by TanStack Router
- do not hand-edit generated route artifacts unless regeneration is intentional
