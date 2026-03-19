import { v } from 'convex/values'
import { internal } from './_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { executeAIPromptImpl } from './ai/engine'
import { getUserId, requireUserId } from './lib/session'
import { sendTelegramMessage } from './telegram'
import { TASK_SYSTEM_PROMPT } from './ai/prompts'
import type { Id } from './_generated/dataModel'
import type { ActionCtx } from './_generated/server'

const taskTypeValidator = v.union(v.literal('one_off'), v.literal('recurring'))

const normalizePage = (page?: number) => Math.max(1, page ?? 1)
const normalizeLimit = (limit?: number) =>
  Math.min(50, Math.max(1, limit ?? 20))
const now = () => Date.now()
const MIN_INTERVAL_MS = 60_000 // 1 minute

const formatToolOutputStr = (output: unknown): string => {
  if (typeof output === 'string') return output
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

const paginate = <T>(items: Array<T>, page: number, limit: number) => {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = (page - 1) * limit
  return {
    items: items.slice(start, start + limit),
    total,
    page,
    limit,
    totalPages,
  }
}

/**
 * Purpose: Lists the signed-in user's scheduled tasks with simple pagination metadata.
 * Function type: query
 * Args:
 * - page: v.optional(v.number())
 * - limit: v.optional(v.number())
 */
export const listTasks = query({
  args: {
    page: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx)
    const page = normalizePage(args.page)
    const limit = normalizeLimit(args.limit)
    if (!userId) {
      return paginate([], page, limit)
    }

    const rows = await ctx.db
      .query('scheduledTasks')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .order('desc')
      .collect()

    const sorted = rows.map((row) => ({
      id: row._id,
      prompt: row.prompt,
      type: row.type,
      intervalMs: row.intervalMs ?? null,
      runAt: row.runAt ? new Date(row.runAt).toISOString() : null,
      nextRunAt: row.nextRunAt ? new Date(row.nextRunAt).toISOString() : null,
      lastRunAt: row.lastRunAt ? new Date(row.lastRunAt).toISOString() : null,
      lastResult: row.lastResult ?? null,
      lastLogId: row.lastLogId ?? null,
      enabled: row.enabled,
      createdAt: new Date(row.createdAt).toISOString(),
    }))

    return paginate(sorted, page, limit)
  },
})

/**
 * Purpose: Creates a one-off or recurring task for the signed-in user.
 * Function type: mutation
 * Args:
 * - prompt: v.string()
 * - type: taskTypeValidator
 * - intervalMs: v.optional(v.number())
 * - runAt: v.optional(v.number())
 */
export const createTask = mutation({
  args: {
    prompt: v.string(),
    type: taskTypeValidator,
    intervalMs: v.optional(v.number()),
    runAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const prompt = args.prompt.trim()
    if (!prompt) {
      throw new Error('Prompt is required')
    }

    const timestamp = now()
    if (args.type === 'recurring') {
      if (!args.intervalMs) {
        throw new Error('Interval is required for recurring tasks')
      }
      if (args.intervalMs < MIN_INTERVAL_MS) {
        throw new Error('Interval must be at least 1 minute')
      }
    }
    if (args.type === 'one_off') {
      if (!args.runAt) {
        throw new Error('Run time is required for one-off tasks')
      }
      if (args.runAt <= timestamp) {
        throw new Error('Run time must be in the future')
      }
    }

    // For recurring: runAt is the optional first execution time, defaults to now + interval
    const firstRunAt =
      args.type === 'one_off'
        ? args.runAt!
        : args.runAt && args.runAt > timestamp
          ? args.runAt
          : timestamp + (args.intervalMs ?? 0)

    const taskId = await ctx.db.insert('scheduledTasks', {
      userId,
      prompt,
      type: args.type,
      intervalMs: args.type === 'recurring' ? args.intervalMs : undefined,
      runAt: args.runAt,
      nextRunAt: firstRunAt,
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    if (args.type === 'one_off' && args.runAt) {
      await ctx.scheduler.runAt(args.runAt, internal.tasks.executeTask, {
        id: taskId,
      })
    }
    return taskId
  },
})

/**
 * Purpose: Updates an existing task's prompt or enabled state for the signed-in user.
 * Function type: mutation
 * Args:
 * - id: v.id('scheduledTasks')
 * - prompt: v.optional(v.string())
 * - enabled: v.optional(v.boolean())
 */
export const updateTask = mutation({
  args: {
    id: v.id('scheduledTasks'),
    prompt: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const existing = await ctx.db.get('scheduledTasks', args.id)
    if (!existing || existing.userId !== userId) {
      throw new Error('Not found')
    }

    const patch: {
      prompt?: string
      enabled?: boolean
      updatedAt: number
    } = {
      updatedAt: now(),
    }

    if (args.prompt !== undefined) {
      const prompt = args.prompt.trim()
      if (!prompt) {
        throw new Error('Prompt cannot be empty')
      }
      patch.prompt = prompt
    }
    if (args.enabled !== undefined) {
      patch.enabled = args.enabled
    }

    await ctx.db.patch('scheduledTasks', args.id, patch)
    return { success: true }
  },
})

/**
 * Purpose: Deletes a scheduled task owned by the signed-in user.
 * Function type: mutation
 * Args:
 * - id: v.id('scheduledTasks')
 */
export const deleteTask = mutation({
  args: { id: v.id('scheduledTasks') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const existing = await ctx.db.get('scheduledTasks', args.id)
    if (!existing || existing.userId !== userId) {
      throw new Error('Not found')
    }
    await ctx.db.delete('scheduledTasks', args.id)
    return { success: true }
  },
})

/**
 * Purpose: Returns due tasks for cron processing based on the next run timestamp.
 * Function type: internalQuery
 * Args:
 * - now: v.number()
 * - limit: v.optional(v.number())
 */
export const getDueTasks = internalQuery({
  args: {
    now: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const due = await ctx.db
      .query('scheduledTasks')
      .withIndex('enabled_nextRunAt', (q) =>
        q.eq('enabled', true).lte('nextRunAt', args.now),
      )
      .take(Math.min(100, Math.max(1, args.limit ?? 20)))
    return due
  },
})

/**
 * Purpose: Loads a task by ID for the internal execution pipeline.
 * Function type: internalQuery
 * Args:
 * - id: v.id('scheduledTasks')
 */
export const getTaskById = internalQuery({
  args: { id: v.id('scheduledTasks') },
  handler: async (ctx, args) => {
    return await ctx.db.get('scheduledTasks', args.id)
  },
})

/**
 * Purpose: Applies execution results back onto a scheduled task after it finishes running.
 * Function type: internalMutation
 * Args:
 * - id: v.id('scheduledTasks')
 * - result: v.string()
 * - ranAt: v.number()
 * - nextRunAt: v.optional(v.number())
 * - enabled: v.boolean()
 * - lastLogId: v.optional(v.id('taskExecutionLogs'))
 */
export const applyTaskExecution = internalMutation({
  args: {
    id: v.id('scheduledTasks'),
    result: v.string(),
    ranAt: v.number(),
    nextRunAt: v.optional(v.number()),
    enabled: v.boolean(),
    lastLogId: v.optional(v.id('taskExecutionLogs')),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch('scheduledTasks', args.id, {
      lastRunAt: args.ranAt,
      lastResult: args.result,
      nextRunAt: args.nextRunAt,
      enabled: args.enabled,
      lastLogId: args.lastLogId,
      updatedAt: args.ranAt,
    })
  },
})

const executeTaskImpl = async (ctx: ActionCtx, id: Id<'scheduledTasks'>) => {
  const task = await ctx.runQuery(internal.tasks.getTaskById, { id })
  if (!task || !task.enabled) {
    return
  }

  // Claim the task immediately to prevent duplicate execution by the next cron tick.
  // For one_off: disable. For recurring: advance nextRunAt so cron won't re-pick it.
  const ranAt = now()
  const nextRunAt =
    task.type === 'recurring' && task.intervalMs
      ? ranAt + task.intervalMs
      : undefined

  await ctx.runMutation(internal.tasks.applyTaskExecution, {
    id,
    result: task.lastResult ?? '',
    ranAt,
    nextRunAt,
    enabled: task.type === 'recurring',
    lastLogId: task.lastLogId,
  })
  let stepIndex = 0

  // Create execution log
  const logId = await ctx.runMutation(internal.taskLogs.createExecutionLog, {
    taskId: id,
  })

  let result: string
  let failed = false
  try {
    result = await executeAIPromptImpl(ctx, {
      userId: task.userId,
      prompt: task.prompt,
      systemPrompt: TASK_SYSTEM_PROMPT,
      onToolCall: async (step) => {
        await ctx.runMutation(internal.taskLogs.appendLogStep, {
          logId,
          step: {
            stepIndex: stepIndex++,
            toolName: step.toolName,
            toolCallId: step.toolCallId,
            input: JSON.stringify(step.input).slice(0, 2000),
            output: formatToolOutputStr(step.output).slice(0, 4000),
            timestamp: Date.now(),
          },
        })
      },
    })
  } catch (error) {
    failed = true
    result = `Task execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
  }

  // Complete execution log
  await ctx.runMutation(internal.taskLogs.completeExecutionLog, {
    logId,
    status: failed ? 'failed' : 'completed',
    result: result.slice(0, 4000),
    error: failed ? result : undefined,
  })

  // Deliver result via Telegram (best-effort)
  try {
    const integration = await ctx.runQuery(
      internal.telegramStore.getIntegrationByUserId,
      { userId: task.userId },
    )
    if (integration?.telegramChatId) {
      await sendTelegramMessage(integration.telegramChatId, result)
    }
  } catch {
    // Telegram delivery is best-effort
  }

  // Update with actual result and log ID (nextRunAt/enabled already set by claim above)
  await ctx.runMutation(internal.tasks.applyTaskExecution, {
    id,
    result,
    ranAt,
    nextRunAt,
    enabled: task.type === 'recurring',
    lastLogId: logId,
  })
}

export const executeTask = internalAction({
  args: { id: v.id('scheduledTasks') },
  handler: async (ctx, args) => {
    await executeTaskImpl(ctx, args.id)
  },
})

export const runDueTasks = internalAction({
  args: {},
  handler: async (ctx) => {
    const dueTasks = await ctx.runQuery(internal.tasks.getDueTasks, {
      now: now(),
      limit: 20,
    })
    for (const task of dueTasks) {
      await executeTaskImpl(ctx, task._id)
    }
  },
})
