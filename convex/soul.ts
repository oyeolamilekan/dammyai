import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireUserId } from './lib/session'

const DEFAULT_PROMPT =
  'You are a helpful personal assistant. You are friendly, concise, and action-oriented.'

/**
 * Purpose: Loads the current user's saved assistant configuration for the dashboard settings screen.
 * Function type: query
 * Args: none
 */
export const getSoul = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const row = await ctx.db
      .query('souls')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .unique()

    if (!row) {
      return null
    }

    return {
      id: row._id,
      systemPrompt: row.systemPrompt,
      modelPreference: row.modelPreference ?? null,
      researchModelPreference: row.researchModelPreference ?? null,
      searchProvider: row.searchProvider ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }
  },
})

/**
 * Purpose: Creates or updates the current user's assistant prompt, model, and search preferences.
 * Function type: mutation
 * Args:
 * - systemPrompt: v.string()
 * - modelPreference: v.optional(v.string())
 * - searchProvider: v.optional(v.union(v.literal('exa'), v.literal('tavily')))
 * - researchModelPreference: v.optional(v.string())
 */
export const upsertSoul = mutation({
  args: {
    systemPrompt: v.string(),
    modelPreference: v.optional(v.string()),
    searchProvider: v.optional(v.union(v.literal('exa'), v.literal('tavily'))),
    researchModelPreference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const systemPrompt = args.systemPrompt.trim() || DEFAULT_PROMPT
    const timestamp = Date.now()

    const existing = await ctx.db
      .query('souls')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .unique()

    if (existing) {
      await ctx.db.patch('souls', existing._id, {
        systemPrompt,
        modelPreference: args.modelPreference,
        searchProvider: args.searchProvider,
        researchModelPreference: args.researchModelPreference,
        updatedAt: timestamp,
      })
      return existing._id
    }

    return await ctx.db.insert('souls', {
      userId,
      systemPrompt,
      modelPreference: args.modelPreference,
      searchProvider: args.searchProvider,
      researchModelPreference: args.researchModelPreference,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  },
})
