import { httpAction } from '../_generated/server'
import { getOptionalEnv, getRequiredEnv } from '../lib/env'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

export const googleCalendarAuth = httpAction(async (_ctx, request) => {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  if (!userId) {
    return new Response('Missing userId', { status: 400 })
  }

  const redirectUri =
    getOptionalEnv('GOOGLE_CALENDAR_REDIRECT_URI') ??
    getRequiredEnv('GOOGLE_REDIRECT_URI').replace(
      '/gmail/',
      '/google-calendar/',
    )

  const params = new URLSearchParams({
    client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: userId,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    },
  })
})

export const googleCalendarCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const userId = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const frontendUrl = getRequiredEnv('FRONTEND_URL')

  if (error || !code || !userId) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${frontendUrl}/dashboard/integrations?error=google_calendar_denied`,
      },
    })
  }

  const redirectUri =
    getOptionalEnv('GOOGLE_CALENDAR_REDIRECT_URI') ??
    getRequiredEnv('GOOGLE_REDIRECT_URI').replace(
      '/gmail/',
      '/google-calendar/',
    )

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: getRequiredEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${frontendUrl}/dashboard/integrations?error=google_calendar_token_failed`,
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
    provider: 'google_calendar',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${frontendUrl}/dashboard/integrations?success=google_calendar`,
    },
  })
})
