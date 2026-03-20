import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireUserId } from './lib/session'
import { normalizeLimit, normalizePage, pageArgs, paginate } from './lib/pagination'

/**
 * Purpose: Lists paginated conversation history for the signed-in user.
 * Function type: query
 * Args:
 * - page: v.optional(v.number())
 * - limit: v.optional(v.number())
 */
export const listConversations = query({
  args: pageArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const page = normalizePage(args.page)
    const limit = normalizeLimit(args.limit)

    const rows = await ctx.db
      .query('messages')
      .withIndex('userId_createdAt', (q) => q.eq('userId', userId))
      .order('desc')
      .collect()

    const sorted = rows.map((row) => ({
      id: row._id,
      role: row.role,
      content: row.content,
      toolName: row.toolName ?? null,
      modelId: row.modelId ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
    }))

    return paginate(sorted, page, limit)
  },
})

/**
 * Purpose: Returns all core memory facts for the signed-in user.
 * Function type: query
 * Args: none
 */
export const listCoreMemories = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const rows = await ctx.db
      .query('coreMemories')
      .withIndex('userId_key', (q) => q.eq('userId', userId))
      .collect()

    return rows.map((row) => ({
      id: row._id,
      key: row.key,
      value: row.value,
      source: row.source ?? 'user',
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }))
  },
})

/**
 * Purpose: Creates a new core memory or updates an existing one by key for the signed-in user.
 * Function type: mutation
 * Args:
 * - key: v.string()
 * - value: v.string()
 */
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
      .take(50)
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

/**
 * Purpose: Deletes a single core memory owned by the signed-in user.
 * Function type: mutation
 * Args:
 * - id: v.id('coreMemories')
 */
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

/**
 * Purpose: Lists paginated archival memories for the signed-in user, newest first.
 * Function type: query
 * Args:
 * - page: v.optional(v.number())
 * - limit: v.optional(v.number())
 */
export const listArchivalMemories = query({
  args: pageArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const page = normalizePage(args.page)
    const limit = normalizeLimit(args.limit)
    const rows = await ctx.db
      .query('archivalMemories')
      .withIndex('userId_updatedAt', (q) => q.eq('userId', userId))
      .order('desc')
      .collect()

    const sorted = rows.map((row) => ({
      id: row._id,
      content: row.content,
      tags: row.tags ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }))

    return paginate(sorted, page, limit)
  },
})

/**
 * Purpose: Deletes one archival memory owned by the signed-in user.
 * Function type: mutation
 * Args:
 * - id: v.id('archivalMemories')
 */
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
