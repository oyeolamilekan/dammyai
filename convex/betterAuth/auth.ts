import { createClient } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth'
import { components } from '../_generated/api'
import authConfig from '../auth.config'
import schema from './schema'
import type { GenericCtx } from '@convex-dev/better-auth/utils'
import type { BetterAuthOptions } from 'better-auth'
import type { DataModel } from '../_generated/dataModel'

const env = (globalThis as any).process?.env ?? {}

/**
 * Purpose: Creates the Better Auth Convex component client used to register auth routes and access the adapter.
 * Value type: Better Auth component client
 */
export const authComponent = createClient<DataModel, typeof schema>(
  (components as { betterAuth: any }).betterAuth,
  {
    local: { schema },
    verbose: false,
  },
)

/**
 * Purpose: Builds the Better Auth options object for a given Convex context, including the Convex adapter and plugin wiring.
 * Function type: helper factory
 * Args:
 * - ctx: GenericCtx<DataModel>
 */
export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    appName: 'DammyAI',
    baseURL: env.SITE_URL ?? 'http://localhost:3000',
    secret:
      env.BETTER_AUTH_SECRET ??
      'dev-only-better-auth-secret-must-be-at-least-32-chars',
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [convex({ authConfig })],
  }) satisfies BetterAuthOptions

/**
 * Purpose: Provides a context-free Better Auth options object for static consumers that only need the configuration shape.
 * Value type: Better Auth options
 */
export const options = createAuthOptions({} as GenericCtx<DataModel>)

/**
 * Purpose: Instantiates the Better Auth server for the current Convex context.
 * Function type: helper factory
 * Args:
 * - ctx: GenericCtx<DataModel>
 */
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx))
}
