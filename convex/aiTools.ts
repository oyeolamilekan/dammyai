import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation, internalQuery } from './_generated/server'

const taskTypeValidator = v.union(v.literal('one_off'), v.literal('recurring'))
const now = () => Date.now()
const MIN_INTERVAL_MS = 60_000

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
      .collect()
    if (allRows.length >= 20) {
      return 'Cannot save: maximum of 20 core memories reached.'
    }

    await ctx.db.insert('coreMemories', {
      userId: args.userId,
      key,
      value,
      createdAt: now(),
      updatedAt: now(),
    })
    return `Saved core memory "${key}".`
  },
})

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

export const searchArchivalMemories = internalQuery({
  args: {
    userId: v.string(),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = args.query.trim().toLowerCase()
    if (!query) {
      return []
    }
    const limit = Math.min(20, Math.max(1, args.limit ?? 10))
    const rows = await ctx.db
      .query('archivalMemories')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .collect()
    return rows
      .filter((row) => {
        const content = row.content.toLowerCase()
        const tags = row.tags?.toLowerCase() ?? ''
        return content.includes(query) || tags.includes(query)
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map((row) => ({
        id: String(row._id),
        content: row.content,
        tags: row.tags ?? null,
      }))
  },
})

export const deleteArchivalMemory = internalMutation({
  args: {
    userId: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('archivalMemories')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .collect()
    const existing = rows.find((row) => String(row._id) === args.id)
    if (!existing) {
      return false
    }
    await ctx.db.delete('archivalMemories', existing._id)
    return true
  },
})

export const listScheduledTasks = internalQuery({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(30, Math.max(1, args.limit ?? 20))
    const rows = await ctx.db
      .query('scheduledTasks')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(limit)
    return rows.map((row) => ({
      id: String(row._id),
      prompt: row.prompt,
      type: row.type,
      enabled: row.enabled,
      runAt: row.runAt ?? null,
      nextRunAt: row.nextRunAt ?? null,
    }))
  },
})

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

export const updateScheduledTask = internalMutation({
  args: {
    userId: v.string(),
    id: v.string(),
    prompt: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('scheduledTasks')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .collect()
    const existing = rows.find((row) => String(row._id) === args.id)
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

export const deleteScheduledTask = internalMutation({
  args: {
    userId: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('scheduledTasks')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .collect()
    const existing = rows.find((row) => String(row._id) === args.id)
    if (!existing) {
      return false
    }
    await ctx.db.delete('scheduledTasks', existing._id)
    return true
  },
})

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
      const rows = await ctx.db
        .query('backgroundResearch')
        .withIndex('userId_createdAt', (q) => q.eq('userId', args.userId))
        .collect()
      const row = rows.find((entry) => String(entry._id) === args.id)
      target = row
        ? {
            _id: String(row._id),
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

    const rows = await ctx.db
      .query('backgroundResearch')
      .withIndex('userId_createdAt', (q) => q.eq('userId', args.userId))
      .collect()
    const row = rows.find((entry) => String(entry._id) === target._id)
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
