import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { refreshGoogleAccessToken } from './lib/google'

/**
 * Purpose: Proactively refreshes all Google OAuth tokens (Gmail + Google Calendar)
 * that are expiring within the next 15 minutes. Called by a cron job every 30 minutes
 * to keep tokens warm so scheduled tasks and background jobs don't hit expired tokens.
 * Function type: internalAction
 */
export const refreshExpiringGoogleTokens = internalAction({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() + 15 * 60_000 // 15 minutes from now

    const expiring = await ctx.runQuery(
      internal.integrationStore.getExpiringGoogleIntegrations,
      { expiresBeforeMs: cutoff },
    )

    if (expiring.length === 0) return

    for (const record of expiring) {
      if (!record.refreshToken) continue

      try {
        const refreshed = await refreshGoogleAccessToken(record.refreshToken)
        if (refreshed) {
          await ctx.runMutation(
            internal.integrations.upsertIntegrationInternal,
            {
              userId: record.userId,
              provider: record.provider as 'gmail' | 'google_calendar',
              accessToken: refreshed.access_token,
              tokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
            },
          )
          console.log(
            `[TokenRefresh] Refreshed ${record.provider} token for user ${record.userId}`,
          )
        } else {
          console.error(
            `[TokenRefresh] Failed to refresh ${record.provider} token for user ${record.userId}`,
          )
        }
      } catch (error) {
        console.error(
          `[TokenRefresh] Error refreshing ${record.provider} token for user ${record.userId}:`,
          error instanceof Error ? error.message : error,
        )
      }
    }
  },
})
