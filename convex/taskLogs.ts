import { v } from 'convex/values'
import { internalMutation, internalQuery, query } from './_generated/server'
import { getUserId } from './lib/session'

const stepValidator = v.object({
  stepIndex: v.number(),
  toolName: v.string(),
  toolCallId: v.string(),
  input: v.string(),
  output: v.string(),
  timestamp: v.number(),
})

/**
 * Purpose: Creates a new execution log row before a scheduled task starts running.
 * Function type: internalMutation
 * Args:
 * - taskId: v.id('scheduledTasks')
 */
export const createExecutionLog = internalMutation({
  args: { taskId: v.id('scheduledTasks') },
  handler: async (ctx, args) => {
    return await ctx.db.insert('taskExecutionLogs', {
      taskId: args.taskId,
      startedAt: Date.now(),
      status: 'running',
      steps: [],
    })
  },
})

/**
 * Purpose: Appends a single tool-call step to an in-progress task execution log.
 * Function type: internalMutation
 * Args:
 * - logId: v.id('taskExecutionLogs')
 * - step: stepValidator
 */
export const appendLogStep = internalMutation({
  args: {
    logId: v.id('taskExecutionLogs'),
    step: stepValidator,
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get('taskExecutionLogs', args.logId)
    if (!log) return
    await ctx.db.patch('taskExecutionLogs', args.logId, {
      steps: [...log.steps, args.step],
    })
  },
})

/**
 * Purpose: Marks a task execution log as completed or failed and stores the final result.
 * Function type: internalMutation
 * Args:
 * - logId: v.id('taskExecutionLogs')
 * - status: v.union(v.literal('completed'), v.literal('failed'))
 * - result: v.optional(v.string())
 * - error: v.optional(v.string())
 */
export const completeExecutionLog = internalMutation({
  args: {
    logId: v.id('taskExecutionLogs'),
    status: v.union(v.literal('completed'), v.literal('failed')),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch('taskExecutionLogs', args.logId, {
      status: args.status,
      completedAt: Date.now(),
      result: args.result,
      error: args.error,
    })
  },
})

/**
 * Purpose: Loads one execution log by ID for internal task-processing workflows.
 * Function type: internalQuery
 * Args:
 * - logId: v.id('taskExecutionLogs')
 */
export const getExecutionLog = internalQuery({
  args: { logId: v.id('taskExecutionLogs') },
  handler: async (ctx, args) => {
    return await ctx.db.get('taskExecutionLogs', args.logId)
  },
})

/**
 * Purpose: Returns recent execution logs for a scheduled task during internal processing.
 * Function type: internalQuery
 * Args:
 * - taskId: v.id('scheduledTasks')
 * - limit: v.optional(v.number())
 */
export const getExecutionLogs = internalQuery({
  args: {
    taskId: v.id('scheduledTasks'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(50, Math.max(1, args.limit ?? 10))
    return await ctx.db
      .query('taskExecutionLogs')
      .withIndex('taskId_startedAt', (q) => q.eq('taskId', args.taskId))
      .order('desc')
      .take(limit)
  },
})

// --- Public queries for the UI ---

/**
 * Purpose: Lists recent execution summaries for a task that belongs to the signed-in user.
 * Function type: query
 * Args:
 * - taskId: v.id('scheduledTasks')
 * - limit: v.optional(v.number())
 */
export const listTaskLogs = query({
  args: {
    taskId: v.id('scheduledTasks'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx)
    if (!userId) return []

    const task = await ctx.db.get('scheduledTasks', args.taskId)
    if (!task || task.userId !== userId) return []

    const limit = Math.min(50, Math.max(1, args.limit ?? 10))
    const logs = await ctx.db
      .query('taskExecutionLogs')
      .withIndex('taskId_startedAt', (q) => q.eq('taskId', args.taskId))
      .order('desc')
      .take(limit)

    return logs.map((log) => ({
      id: log._id,
      startedAt: new Date(log.startedAt).toISOString(),
      completedAt: log.completedAt
        ? new Date(log.completedAt).toISOString()
        : null,
      status: log.status,
      stepCount: log.steps.length,
      toolsUsed: [...new Set(log.steps.map((s) => s.toolName))],
      result: log.result?.slice(0, 200) ?? null,
      error: log.error ?? null,
    }))
  },
})

/**
 * Purpose: Returns the full step-by-step detail for one task execution log in the dashboard.
 * Function type: query
 * Args:
 * - logId: v.id('taskExecutionLogs')
 */
export const getTaskLogDetail = query({
  args: { logId: v.id('taskExecutionLogs') },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx)
    if (!userId) return null

    const log = await ctx.db.get('taskExecutionLogs', args.logId)
    if (!log) return null

    const task = await ctx.db.get('scheduledTasks', log.taskId)
    if (!task || task.userId !== userId) return null

    return {
      id: log._id,
      taskId: log.taskId,
      startedAt: new Date(log.startedAt).toISOString(),
      completedAt: log.completedAt
        ? new Date(log.completedAt).toISOString()
        : null,
      status: log.status,
      result: log.result ?? null,
      error: log.error ?? null,
      steps: log.steps.map((s) => ({
        stepIndex: s.stepIndex,
        toolName: s.toolName,
        toolCallId: s.toolCallId,
        input: s.input,
        output: s.output,
        timestamp: new Date(s.timestamp).toISOString(),
      })),
    }
  },
})
