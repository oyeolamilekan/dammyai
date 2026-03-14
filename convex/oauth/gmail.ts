import { httpAction } from '../_generated/server'
import { getRequiredEnv } from '../lib/env'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ')

/**
 * Purpose: Starts the Gmail OAuth flow by redirecting the user to Google's consent screen with the current user ID in state.
 * Function type: httpAction
 * Args:
 * - _ctx: Convex action context
 * - request: Request
 */
export const gmailAuth = httpAction((_ctx, request) => {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  if (!userId) {
    return Promise.resolve(new Response('Missing userId', { status: 400 }))
  }

  const params = new URLSearchParams({
    client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: getRequiredEnv('GOOGLE_REDIRECT_URI'),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: userId,
  })

  return Promise.resolve(
    new Response(null, {
      status: 302,
      headers: {
        Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      },
    }),
  )
})

/**
 * Purpose: Completes the Gmail OAuth callback, exchanges the auth code for tokens, stores the integration, and redirects back to the dashboard.
 * Function type: httpAction
 * Args:
 * - ctx: Convex action context
 * - request: Request
 */
export const gmailCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const userId = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const frontendUrl = getRequiredEnv('FRONTEND_URL')

  if (error || !code || !userId) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${frontendUrl}/dashboard/integrations?error=gmail_denied`,
      },
    })
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: getRequiredEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: getRequiredEnv('GOOGLE_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${frontendUrl}/dashboard/integrations?error=gmail_token_failed`,
      },
    })
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
  }

  const { internal } = await import('../_generated/api')
  await ctx.runMutation(internal.integrations.upsertIntegrationInternal, {
    userId,
    provider: 'gmail',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${frontendUrl}/dashboard/integrations?success=gmail`,
    },
  })
})
