import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation, internalQuery } from './_generated/server'
import type { MutationCtx } from './_generated/server'

const taskTypeValidator = v.union(v.literal('one_off'), v.literal('recurring'))
const now = () => Date.now()
const MIN_INTERVAL_MS = 60_000

const getArchivalMemoryForUser = async (
  ctx: MutationCtx,
  userId: string,
  id: string,
) => {
  const memoryId = ctx.db.normalizeId('archivalMemories', id)
  if (!memoryId) {
    return null
  }
  const existing = await ctx.db.get('archivalMemories', memoryId)
  if (!existing || existing.userId !== userId) {
    return null
  }
  return existing
}

const getScheduledTaskForUser = async (
  ctx: MutationCtx,
  userId: string,
  id: string,
) => {
  const taskId = ctx.db.normalizeId('scheduledTasks', id)
  if (!taskId) {
    return null
  }
  const existing = await ctx.db.get('scheduledTasks', taskId)
  if (!existing || existing.userId !== userId) {
    return null
  }
  return existing
}

const getResearchJobForUser = async (
  ctx: MutationCtx,
  userId: string,
  id: string,
) => {
  const researchId = ctx.db.normalizeId('backgroundResearch', id)
  if (!researchId) {
    return null
  }
  const existing = await ctx.db.get('backgroundResearch', researchId)
  if (!existing || existing.userId !== userId) {
    return null
  }
  return existing
}

/**
 * Purpose: Saves or updates a compact core memory fact on behalf of the AI agent.
 * Function type: internalMutation
 * Args:
 * - userId: v.string()
 * - key: v.string()
 * - value: v.string()
 */
export const saveCoreMemory = internalMutation({
  args: {
    userId: v.string(),
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const key = args.key.trim().slice(0, 50)
    const value = args.value.trim().slice(0, 200)
    if (!key || !value) {
      throw new Error('key and value are required')
    }

    const existing = await ctx.db
      .query('coreMemories')
      .withIndex('userId_key', (q) =>
        q.eq('userId', args.userId).eq('key', key),
      )
      .unique()

    if (existing) {
      await ctx.db.patch('coreMemories', existing._id, {
        value,
        updatedAt: now(),
      })
      return `Updated core memory "${key}".`
    }

    const allRows = await ctx.db
      .query('coreMemories')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .take(50)
    if (allRows.length >= 50) {
      return 'Cannot save: maximum of 50 core memories reached.'
    }

    await ctx.db.insert('coreMemories', {
      userId: args.userId,
      key,
      value,
      source: 'agent',
      createdAt: now(),
      updatedAt: now(),
    })
    return `Saved core memory "${key}".`
  },
})

/**
 * Purpose: Deletes one core memory fact by key for the AI agent.
 * Function type: internalMutation
 * Args:
 * - userId: v.string()
 * - key: v.string()
 */
export const deleteCoreMemory = internalMutation({
  args: {
    userId: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('coreMemories')
      .withIndex('userId_key', (q) =>
        q.eq('userId', args.userId).eq('key', args.key.trim().slice(0, 50)),
      )
      .unique()
    if (!existing) {
      return false
    }
    await ctx.db.delete('coreMemories', existing._id)
    return true
  },
})

/**
 * Purpose: Saves a longer archival note that the AI can search later.
 * Function type: internalMutation
 * Args:
 * - userId: v.string()
 * - content: v.string()
 * - tags: v.optional(v.string())
 */
export const saveArchivalMemory = internalMutation({
  args: {
    userId: v.string(),
    content: v.string(),
    tags: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const content = args.content.trim().slice(0, 2000)
    if (!content) {
      throw new Error('content is required')
    }
    const id = await ctx.db.insert('archivalMemories', {
      userId: args.userId,
      content,
      tags: args.tags?.trim() || undefined,
      createdAt: now(),
      updatedAt: now(),
    })
    return String(id)
  },
})

/**
 * Purpose: Searches a user's archival memories using lightweight keyword scoring.
 * Function type: internalQuery
 * Args:
 * - userId: v.string()
 * - query: v.string()
 * - limit: v.optional(v.number())
 */
export const searchArchivalMemories = internalQuery({
  args: {
    userId: v.string(),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const queryText = args.query.trim().toLowerCase()
    if (!queryText) {
      return []
    }
    const limit = Math.min(20, Math.max(1, args.limit ?? 10))
    const keywords = queryText.split(/\s+/).filter((w) => w.length > 0)

    const rows = await ctx.db
      .query('archivalMemories')
      .withIndex('userId_updatedAt', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(Math.min(100, Math.max(limit * 5, 25)))

    const scored = rows
      .map((row) => {
        const content = row.content.toLowerCase()
        const tags = row.tags?.toLowerCase() ?? ''
        const text = `${content} ${tags}`
        const matchCount = keywords.filter((kw) => text.includes(kw)).length
        return { row, matchCount }
      })
      .filter((entry) => entry.matchCount > 0)
      .sort(
        (a, b) =>
          b.matchCount - a.matchCount || b.row.updatedAt - a.row.updatedAt,
      )
      .slice(0, limit)

    return scored.map((entry) => ({
      id: String(entry.row._id),
      content: entry.row.content,
      tags: entry.row.tags ?? null,
    }))
  },
})

/**
 * Purpose: Deletes one archival memory by string ID after verifying ownership.
 * Function type: internalMutation
 * Args:
 * - userId: v.string()
 * - id: v.string()
 */
export const deleteArchivalMemory = internalMutation({
  args: {
    userId: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await getArchivalMemoryForUser(ctx, args.userId, args.id)
    if (!existing) {
      return false
    }
    await ctx.db.delete('archivalMemories', existing._id)
    return true
  },
})

/**
 * Purpose: Lists recent scheduled tasks for tool-driven task management in the AI layer.
 * Function type: internalQuery
 * Args:
 * - userId: v.string()
 * - limit: v.optional(v.number())
 * - type: v.optional(v.union(v.literal('one_off'), v.literal('recurring')))
 */
export const listScheduledTasks = internalQuery({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
    type: v.optional(v.union(v.literal('one_off'), v.literal('recurring'))),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(30, Math.max(1, args.limit ?? 20))
    const rows = await ctx.db
      .query('scheduledTasks')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(limit * 2) // over-fetch to account for type filtering
    const filtered = args.type ? rows.filter((r) => r.type === args.type) : rows
    return filtered.slice(0, limit).map((row) => ({
      id: String(row._id),
      prompt: row.prompt,
      type: row.type,
      enabled: row.enabled,
      runAt: row.runAt ?? null,
      nextRunAt: row.nextRunAt ?? null,
    }))
  },
})

/**
 * Purpose: Creates a scheduled task from an AI tool call.
 * Function type: internalMutation
 * Args:
 * - userId: v.string()
 * - prompt: v.string()
 * - type: taskTypeValidator
 * - intervalMs: v.optional(v.number())
 * - runAt: v.optional(v.number())
 */
export const createScheduledTask = internalMutation({
  args: {
    userId: v.string(),
    prompt: v.string(),
    type: taskTypeValidator,
    intervalMs: v.optional(v.number()),
    runAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const prompt = args.prompt.trim()
    if (!prompt) {
      throw new Error('Prompt is required')
    }
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
      if (args.runAt <= now()) {
        throw new Error('Run time must be in the future')
      }
    }

    const timestamp = now()
    const firstRunAt =
      args.type === 'one_off'
        ? args.runAt!
        : args.runAt && args.runAt > timestamp
          ? args.runAt
          : timestamp + (args.intervalMs ?? 0)

    const id = await ctx.db.insert('scheduledTasks', {
      userId: args.userId,
      prompt,
      type: args.type,
      intervalMs: args.type === 'recurring' ? args.intervalMs : undefined,
      runAt: args.runAt,
      nextRunAt: firstRunAt,
      lastRunAt: undefined,
      lastResult: undefined,
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    if (args.type === 'one_off' && args.runAt) {
      await ctx.scheduler.runAt(args.runAt, internal.tasks.executeTask, { id })
    }
    return String(id)
  },
})

/**
 * Purpose: Updates a scheduled task selected by an AI tool call.
 * Function type: internalMutation
 * Args:
 * - userId: v.string()
 * - id: v.string()
 * - prompt: v.optional(v.string())
 * - enabled: v.optional(v.boolean())
 */
export const updateScheduledTask = internalMutation({
  args: {
    userId: v.string(),
    id: v.string(),
    prompt: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await getScheduledTaskForUser(ctx, args.userId, args.id)
    if (!existing) {
      throw new Error('Task not found')
    }

    const patch: {
      prompt?: string
      enabled?: boolean
      updatedAt: number
    } = { updatedAt: now() }

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
    await ctx.db.patch('scheduledTasks', existing._id, patch)
    return true
  },
})

/**
 * Purpose: Deletes a scheduled task selected by an AI tool call.
 * Function type: internalMutation
 * Args:
 * - userId: v.string()
 * - id: v.string()
 */
export const deleteScheduledTask = internalMutation({
  args: {
    userId: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await getScheduledTaskForUser(ctx, args.userId, args.id)
    if (!existing) {
      return false
    }
    await ctx.db.delete('scheduledTasks', existing._id)
    return true
  },
})

/**
 * Purpose: Creates a background research job from an AI tool call and enqueues processing.
 * Function type: internalMutation
 * Args:
 * - userId: v.string()
 * - prompt: v.string()
 */
export const startBackgroundResearch = internalMutation({
  args: {
    userId: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const prompt = args.prompt.trim()
    if (!prompt) {
      throw new Error('Prompt is required')
    }
    const id = await ctx.db.insert('backgroundResearch', {
      userId: args.userId,
      prompt,
      status: 'pending',
      result: undefined,
      error: undefined,
      createdAt: now(),
      completedAt: undefined,
    })
    await ctx.scheduler.runAfter(0, internal.research.processResearchJob, {
      id,
    })
    return String(id)
  },
})

/**
 * Purpose: Cancels a specific or most recent active research job for the AI layer.
 * Function type: internalMutation
 * Args:
 * - userId: v.string()
 * - id: v.optional(v.string())
 */
export const cancelBackgroundResearch = internalMutation({
  args: {
    userId: v.string(),
    id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let target: {
      _id: string
      status: 'pending' | 'running' | 'completed' | 'failed'
      userId: string
    } | null = null

    if (args.id) {
      const row = await getResearchJobForUser(ctx, args.userId, args.id)
      target = row
        ? {
            _id: row._id,
            status: row.status,
            userId: row.userId,
          }
        : null
      if (!target || target.userId !== args.userId) {
        return false
      }
      if (target.status !== 'pending' && target.status !== 'running') {
        return false
      }
    } else {
      const [latestPending, latestRunning] = await Promise.all([
        ctx.db
          .query('backgroundResearch')
          .withIndex('userId_status_createdAt', (q) =>
            q.eq('userId', args.userId).eq('status', 'pending'),
          )
          .order('desc')
          .take(1),
        ctx.db
          .query('backgroundResearch')
          .withIndex('userId_status_createdAt', (q) =>
            q.eq('userId', args.userId).eq('status', 'running'),
          )
          .order('desc')
          .take(1),
      ])
      const latestCandidates = []
      if (latestPending.length > 0) {
        latestCandidates.push(latestPending[0])
      }
      if (latestRunning.length > 0) {
        latestCandidates.push(latestRunning[0])
      }
      if (latestCandidates.length === 0) {
        target = null
      } else {
        latestCandidates.sort((a, b) => b._creationTime - a._creationTime)
        const latest = latestCandidates[0]
        target = {
          _id: String(latest._id),
          status: latest.status,
          userId: latest.userId,
        }
      }
    }

    if (!target) {
      return false
    }

    const row = await getResearchJobForUser(ctx, args.userId, target._id)
    if (!row) {
      return false
    }
    await ctx.db.patch('backgroundResearch', row._id, {
      status: 'failed',
      error: 'Canceled by user',
      completedAt: now(),
      checkpoints: [
        ...(row.checkpoints ?? []),
        {
          step: 'cancelled',
          message: 'Research cancelled by user',
          timestamp: now(),
          status: 'error' as const,
        },
      ],
    })
    return true
  },
})
