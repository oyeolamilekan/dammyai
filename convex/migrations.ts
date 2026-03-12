import {
  internalMutation,
} from './_generated/server'

const MAX_CORE_MEMORIES = 50

/**
 * Migrate all `memories` rows into `coreMemories` with source: 'auto'.
 * Processes every user in a single mutation. Call once via the Convex dashboard.
 */
export const migrateAllMemories = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allMemories = await ctx.db.query('memories').collect()
    if (allMemories.length === 0) {
      return { totalMigrated: 0, totalSkipped: 0, users: 0 }
    }

    const byUser = new Map<string, typeof allMemories>()
    for (const m of allMemories) {
      const list = byUser.get(m.userId) ?? []
      list.push(m)
      byUser.set(m.userId, list)
    }

    const now = Date.now()
    let totalMigrated = 0
    let totalSkipped = 0

    for (const [userId, memories] of byUser) {
      const existing = await ctx.db
        .query('coreMemories')
        .withIndex('userId', (q) => q.eq('userId', userId))
        .collect()

      if (existing.length >= MAX_CORE_MEMORIES) {
        totalSkipped += memories.length
        continue
      }

      const existingValues = new Set(
        existing.map((r) => r.value.trim().toLowerCase()),
      )
      let keyIndex = existing.length
      let userMigrated = 0

      for (const memory of memories) {
        if (existing.length + userMigrated >= MAX_CORE_MEMORIES) {
          totalSkipped += 1
          continue
        }

        const value = memory.content.trim().slice(0, 200)
        if (!value || existingValues.has(value.toLowerCase())) {
          totalSkipped += 1
          continue
        }

        keyIndex += 1
        await ctx.db.insert('coreMemories', {
          userId,
          key: `fact_${keyIndex}`,
          value,
          category: memory.category,
          source: 'auto',
          createdAt: memory.createdAt ?? now,
          updatedAt: memory.updatedAt ?? now,
        })
        existingValues.add(value.toLowerCase())
        userMigrated += 1
      }

      totalMigrated += userMigrated
    }

    return { totalMigrated, totalSkipped, users: byUser.size }
  },
})
