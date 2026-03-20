import { v } from 'convex/values'
import { internalQuery } from './_generated/server'

const providerValidator = v.union(
  v.literal('telegram'),
  v.literal('gmail'),
  v.literal('google_calendar'),
  v.literal('todoist'),
  v.literal('notion'),
  v.literal('exa'),
)

/**
 * Purpose: Fetches a single stored integration record for an internal caller by user and provider.
 * Function type: internalQuery
 * Args:
 * - userId: v.string()
 * - provider: providerValidator
 */
export const getIntegration = internalQuery({
  args: {
    userId: v.string(),
    provider: providerValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('integrations')
      .withIndex('userId_provider', (q) =>
        q.eq('userId', args.userId).eq('provider', args.provider),
      )
      .unique()
  },
})

/**
 * Purpose: Finds all Google service integrations (gmail, google_calendar) whose access tokens
 * expire before the given cutoff timestamp. Used by the token refresh cron.
 * Function type: internalQuery
 * Args:
 * - expiresBeforeMs: v.number() — cutoff timestamp in ms; tokens expiring before this are returned
 */
export const getExpiringGoogleIntegrations = internalQuery({
  args: { expiresBeforeMs: v.number() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query('integrations').collect()
    return all.filter(
      (r) =>
        (r.provider === 'gmail' || r.provider === 'google_calendar') &&
        r.refreshToken &&
        r.tokenExpiresAt &&
        r.tokenExpiresAt < args.expiresBeforeMs,
    )
  },
})
