import { v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'

const roleValidator = v.union(
  v.literal('user'),
  v.literal('assistant'),
  v.literal('tool'),
)

export const getSoulByUserId = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('souls')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .unique()
  },
})

export const getConversationHistory = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, args.limit ?? 50))
    const scanLimit = Math.min(400, Math.max(limit * 4, 80))
    const rows = await ctx.db
      .query('messages')
      .withIndex('userId_createdAt', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(scanLimit)
    return rows
      .filter(
        (row) =>
          row.role !== 'tool' && !(row.role === 'assistant' && row.toolCallId),
      )
      .slice(0, limit)
      .reverse()
      .map((row) => ({
        role: row.role as 'user' | 'assistant',
        content: row.content,
      }))
  },
})

export const getUserMemories = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, args.limit ?? 20))
    const rows = await ctx.db
      .query('memories')
      .withIndex('userId_updatedAt', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(limit)
    return rows.map((row) => ({
      id: row._id,
      content: row.content,
      category: row.category,
    }))
  },
})

export const getCoreMemories = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('coreMemories')
      .withIndex('userId_key', (q) => q.eq('userId', args.userId))
      .collect()
    return rows.map((row) => ({ key: row.key, value: row.value }))
  },
})

export const saveMessage = internalMutation({
  args: {
    userId: v.string(),
    role: roleValidator,
    content: v.string(),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      userId: args.userId,
      role: args.role,
      content: args.content,
      toolName: args.toolName,
      toolCallId: args.toolCallId,
      createdAt: Date.now(),
    })
  },
})

export const saveExtractedMemories = internalMutation({
  args: {
    userId: v.string(),
    facts: v.array(
      v.object({
        content: v.string(),
        category: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existingRows = await ctx.db
      .query('memories')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .collect()
    const existingByContent = new Map(
      existingRows.map((row) => [row.content.trim().toLowerCase(), row]),
    )

    let changed = 0
    for (const fact of args.facts) {
      const content = fact.content.trim().slice(0, 500)
      if (!content) continue
      const key = content.toLowerCase()
      const existing = existingByContent.get(key)
      if (existing) {
        if ((existing.category ?? undefined) !== fact.category) {
          await ctx.db.patch('memories', existing._id, {
            category: fact.category,
            updatedAt: now,
          })
          changed += 1
        }
        continue
      }
      await ctx.db.insert('memories', {
        userId: args.userId,
        content,
        category: fact.category,
        createdAt: now,
        updatedAt: now,
      })
      changed += 1
    }

    return changed
  },
})
