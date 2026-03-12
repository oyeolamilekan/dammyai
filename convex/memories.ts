import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireUserId } from './lib/session'

const defaultPage = 1
const defaultLimit = 20

const pageArgs = {
  page: v.optional(v.number()),
  limit: v.optional(v.number()),
}

const normalizePage = (page?: number) => Math.max(1, page ?? defaultPage)
const normalizeLimit = (limit?: number) =>
  Math.min(50, Math.max(1, limit ?? defaultLimit))

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

/** @deprecated Kept as a stub so old frontend builds don't crash. Remove after redeploying. */
export const listMemories = query({
  args: pageArgs,
  handler: async (_ctx, args) => {
    const page = normalizePage(args.page)
    const limit = normalizeLimit(args.limit)
    return { items: [], total: 0, page, limit, totalPages: 1 }
  },
})

/** @deprecated Kept as a stub so old frontend builds don't crash. Remove after redeploying. */
export const deleteMemory = mutation({
  args: { id: v.id('memories') },
  handler: async () => {
    return { success: true }
  },
})

export const listConversations = query({
  args: pageArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const page = normalizePage(args.page)
    const limit = normalizeLimit(args.limit)

    const rows = await ctx.db
      .query('messages')
      .withIndex('userId_createdAt', (q) => q.eq('userId', userId))
      .collect()

    const sorted = rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        id: row._id,
        role: row.role,
        content: row.content,
        toolName: row.toolName ?? null,
        createdAt: new Date(row.createdAt).toISOString(),
      }))

    return paginate(sorted, page, limit)
  },
})

export const listCoreMemories = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const rows = await ctx.db
      .query('coreMemories')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .collect()

    return rows
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((row) => ({
        id: row._id,
        key: row.key,
        value: row.value,
        source: row.source ?? 'user',
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
      }))
  },
})

export const createOrUpdateCoreMemory = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const key = args.key.trim()
    const value = args.value.trim()
    const timestamp = Date.now()

    if (!key || !value) {
      throw new Error('key and value are required')
    }
    if (key.length > 50) {
      throw new Error('key must be 50 characters or less')
    }
    if (value.length > 200) {
      throw new Error('value must be 200 characters or less')
    }

    const existing = await ctx.db
      .query('coreMemories')
      .withIndex('userId_key', (q) => q.eq('userId', userId).eq('key', key))
      .unique()

    if (existing) {
      await ctx.db.patch('coreMemories', existing._id, {
        value,
        updatedAt: timestamp,
      })
      return existing._id
    }

    const allRows = await ctx.db
      .query('coreMemories')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .collect()
    if (allRows.length >= 50) {
      throw new Error('Maximum of 50 core memories reached')
    }

    return await ctx.db.insert('coreMemories', {
      userId,
      key,
      value,
      source: 'user',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  },
})

export const deleteCoreMemory = mutation({
  args: { id: v.id('coreMemories') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const existing = await ctx.db.get('coreMemories', args.id)
    if (!existing || existing.userId !== userId) {
      throw new Error('Not found')
    }
    await ctx.db.delete('coreMemories', args.id)
    return { success: true }
  },
})

export const listArchivalMemories = query({
  args: pageArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const page = normalizePage(args.page)
    const limit = normalizeLimit(args.limit)
    const rows = await ctx.db
      .query('archivalMemories')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .collect()

    const sorted = rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => ({
        id: row._id,
        content: row.content,
        tags: row.tags ?? null,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
      }))

    return paginate(sorted, page, limit)
  },
})

export const deleteArchivalMemory = mutation({
  args: { id: v.id('archivalMemories') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const existing = await ctx.db.get('archivalMemories', args.id)
    if (!existing || existing.userId !== userId) {
      throw new Error('Not found')
    }
    await ctx.db.delete('archivalMemories', args.id)
    return { success: true }
  },
})
