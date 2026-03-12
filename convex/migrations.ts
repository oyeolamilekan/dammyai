import { v } from 'convex/values'
import {
  internalMutation,
  internalAction,
  internalQuery,
} from './_generated/server'
import { internal } from './_generated/api'

const MAX_CORE_MEMORIES = 50

/**
 * Migrate a single user's `memories` rows into `coreMemories` with source: 'auto'.
 * Generates keys as `fact_{index}` and skips duplicates by content.
 */
export const migrateUserMemories = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('coreMemories')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .collect()

    if (existing.length >= MAX_CORE_MEMORIES) {
      return { migrated: 0, skipped: 0, reason: 'cap_reached' }
    }

    const existingValues = new Set(
      existing.map((r) => r.value.trim().toLowerCase()),
    )

    const memories = await ctx.db
      .query('memories')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .collect()

    const now = Date.now()
    let migrated = 0
    let skipped = 0
    let keyIndex = existing.length

    for (const memory of memories) {
      if (existing.length + migrated >= MAX_CORE_MEMORIES) break

      const value = memory.content.trim().slice(0, 200)
      if (!value || existingValues.has(value.toLowerCase())) {
        skipped += 1
        continue
      }

      keyIndex += 1
      await ctx.db.insert('coreMemories', {
        userId: args.userId,
        key: `fact_${keyIndex}`,
        value,
        category: memory.category,
        source: 'auto',
        createdAt: memory.createdAt ?? now,
        updatedAt: memory.updatedAt ?? now,
      })
      existingValues.add(value.toLowerCase())
      migrated += 1
    }

    return { migrated, skipped }
  },
})

/**
 * Run the migration for all users that have entries in the `memories` table.
 * Call this once via the Convex dashboard.
 */
export const migrateAllMemories = internalAction({
  args: {},
  handler: async (ctx) => {
    const userIds: Array<string> = await ctx.runQuery(
      internal.migrations.getDistinctMemoryUserIds,
    )

    const results: Array<{
      userId: string
      migrated: number
      skipped: number
    }> = []

    for (const userId of userIds) {
      const result = await ctx.runMutation(
        internal.migrations.migrateUserMemories,
        { userId },
      )
      results.push({ userId, ...result })
    }

    return results
  },
})

export const getDistinctMemoryUserIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('memories').collect()
    const userIds = [...new Set(rows.map((r) => r.userId))]
    return userIds
  },
})
