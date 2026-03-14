import { query } from './_generated/server'
import { authComponent } from './betterAuth/auth'

export const { getAuthUser } = authComponent.clientApi()

/**
 * Purpose: Returns the currently authenticated user for the frontend session, or `null` when signed out.
 * Function type: query
 * Args: none
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return (await authComponent.safeGetAuthUser(ctx)) ?? null
  },
})
