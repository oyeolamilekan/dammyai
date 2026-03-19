import { tool } from 'ai'
import { z } from 'zod'
import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'

interface TodoistTask {
  id: string
  content: string
  description: string
  checked: boolean
  due?: { date: string; string: string } | null
  priority: number
  project_id: string
  labels: Array<string>
}

type AILikeCtx = Pick<ActionCtx, 'runQuery' | 'runMutation'>

async function getTodoistAccessToken(
  ctx: AILikeCtx,
  userId: string,
): Promise<string | null> {
  const record = await ctx.runQuery(internal.integrationStore.getIntegration, {
    userId,
    provider: 'todoist',
  })
  if (!record?.accessToken) return null
  return record.accessToken
}

async function todoistFetch(
  url: string,
  init?: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init)
    if (res.status !== 409 || attempt === maxRetries) return res
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)))
  }
  return fetch(url, init)
}

/**
 * Purpose: Creates the Todoist read tool for listing pending or completed tasks with optional filtering.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createCheckTodosTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      'View the user\'s Todoist task list. USE when the user asks "what are my tasks?", "show my to-do list", "what\'s overdue?", or wants to see pending/completed items. NOT for Google Calendar events (use checkSchedule) or scheduled reminders (use listScheduledTasks).',
    inputSchema: z.object({
      status: z
        .enum(['all', 'pending', 'completed'])
        .optional()
        .describe('Filter by task status. Default: "pending". Use "completed" to show recently finished tasks (last 2 weeks).'),
      filter: z
        .string()
        .optional()
        .describe(
          'Todoist filter expression. Examples: "today" (due today), "overdue" (past due), "p1" (priority 1 = urgent), "#Work" (project), "tomorrow", "next 7 days"',
        ),
    }),
    execute: async ({ status, filter }) => {
      const accessToken = await getTodoistAccessToken(ctx, userId)
      if (!accessToken) {
        return 'Todoist is not connected. Please connect Todoist from the dashboard first.'
      }

      const taskStatus = status ?? 'pending'

      if (taskStatus !== 'completed') {
        let res: Response
        if (filter) {
          const filterParams = new URLSearchParams({ query: filter })
          res = await todoistFetch(
            `https://api.todoist.com/api/v1/tasks/filter?${filterParams}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          )
        } else {
          res = await todoistFetch('https://api.todoist.com/api/v1/tasks', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        }

        if (!res.ok) {
          const error = await res.text()
          return `Failed to fetch todos: ${error}`
        }

        const data = (await res.json()) as { results?: Array<TodoistTask> }
        const tasks = data.results ?? []

        if (tasks.length === 0) return 'No pending todos found.'

        return tasks
          .map((t) => {
            const due = t.due?.string ? ` (due: ${t.due.string})` : ''
            const priority = t.priority > 1 ? ` [P${5 - t.priority}]` : ''
            const labels =
              t.labels.length > 0 ? ` {${t.labels.join(', ')}}` : ''
            return `⬜ ${t.content}${due}${priority}${labels}`
          })
          .join('\n')
      }

      const now = new Date()
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
      const params = new URLSearchParams({
        since: twoWeeksAgo.toISOString(),
        until: now.toISOString(),
        limit: '20',
      })
      const res = await todoistFetch(
        `https://api.todoist.com/api/v1/tasks/completed/by_completion_date?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )

      if (!res.ok) {
        const error = await res.text()
        return `Failed to fetch completed todos: ${error}`
      }

      const data = (await res.json()) as {
        items: Array<{ content: string; completed_at: string }>
      }

      if (data.items.length === 0) return 'No recently completed todos.'

      return data.items
        .map((t) => `✅ ${t.content} (completed: ${t.completed_at})`)
        .join('\n')
    },
  })
}

/**
 * Purpose: Creates the Todoist write tool for adding, completing, or removing tasks in the user's Todoist account.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createUpdateTodoTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      'Add, complete, or remove a Todoist task. USE when the user says "add a task", "mark X as done", "remove X from my list", or "I need to do X". NOT for time-triggered reminders (use createScheduledTask) or calendar events (use scheduleCall).',
    inputSchema: z.object({
      action: z
        .enum(['add', 'complete', 'remove'])
        .describe('"add" creates a new task, "complete" marks it done, "remove" deletes it permanently'),
      task: z
        .string()
        .describe('For "add": the task description. For "complete"/"remove": search text to find the existing task by name.'),
      due: z
        .string()
        .optional()
        .describe(
          'Due date for new tasks (only for "add"). Natural language or date: "today", "tomorrow", "next Monday", "2026-03-01"',
        ),
      priority: z
        .number()
        .optional()
        .describe('Priority 1-4 for new tasks (only for "add"). 4 = urgent (red), 3 = high (orange), 2 = medium (blue), 1 = low (default). Maps to Todoist p1-p4 display.'),
    }),
    execute: async ({ action, task, due, priority }) => {
      const accessToken = await getTodoistAccessToken(ctx, userId)
      if (!accessToken) {
        return 'Todoist is not connected. Please connect Todoist from the dashboard first.'
      }

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }

      switch (action) {
        case 'add': {
          const body: Record<string, unknown> = { content: task }
          if (due) body.due_string = due
          if (priority) body.priority = 5 - priority

          const res = await todoistFetch(
            'https://api.todoist.com/api/v1/tasks',
            {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
            },
          )

          if (!res.ok) {
            const error = await res.text()
            return `Failed to add task: ${error}`
          }

          const created = (await res.json()) as { content: string; url: string }
          return `✅ Added "${created.content}" to your to-do list.`
        }

        case 'complete':
        case 'remove': {
          const filterParams = new URLSearchParams({ query: task })
          const searchRes = await todoistFetch(
            `https://api.todoist.com/api/v1/tasks/filter?${filterParams}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          )

          let tasks: Array<{ id: string; content: string }> = []
          if (searchRes.ok) {
            const data = (await searchRes.json()) as {
              results?: Array<{ id: string; content: string }>
            }
            tasks = data.results ?? []
          }

          if (tasks.length === 0) {
            const allRes = await todoistFetch(
              'https://api.todoist.com/api/v1/tasks',
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              },
            )
            if (allRes.ok) {
              const data = (await allRes.json()) as {
                results?: Array<{ id: string; content: string }>
              }
              const allTasks = data.results ?? []
              const lower = task.toLowerCase()
              tasks = allTasks.filter((t) =>
                t.content.toLowerCase().includes(lower),
              )
            }
          }

          if (tasks.length === 0) {
            return `Could not find a task matching "${task}".`
          }

          const target = tasks[0]

          if (action === 'complete') {
            const res = await todoistFetch(
              `https://api.todoist.com/api/v1/tasks/${target.id}/close`,
              {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
              },
            )
            if (!res.ok) {
              const error = await res.text()
              return `Failed to complete task: ${error}`
            }
            return `✅ Marked "${target.content}" as complete.`
          }

          const res = await todoistFetch(
            `https://api.todoist.com/api/v1/tasks/${target.id}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          )
          if (!res.ok) {
            const error = await res.text()
            return `Failed to remove task: ${error}`
          }
          return `🗑️ Removed "${target.content}" from your to-do list.`
        }
      }
    },
  })
}
