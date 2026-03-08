import { httpAction } from '../_generated/server'
import { getRequiredEnv } from '../lib/env'

const SCOPES = 'data:read_write,data:delete'

export const todoistAuth = httpAction(async (_ctx, request) => {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  if (!userId) {
    return new Response('Missing userId', { status: 400 })
  }

  const clientId = getRequiredEnv('TODOIST_CLIENT_ID')

  const params = new URLSearchParams({
    client_id: clientId,
    scope: SCOPES,
    state: userId,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://app.todoist.com/oauth/authorize?${params.toString()}`,
    },
  })
})

export const todoistCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const userId = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const frontendUrl = getRequiredEnv('FRONTEND_URL')

  if (error || !code || !userId) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${frontendUrl}/dashboard/integrations?error=todoist_denied`,
      },
    })
  }

  const tokenRes = await fetch('https://api.todoist.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getRequiredEnv('TODOIST_CLIENT_ID'),
      client_secret: getRequiredEnv('TODOIST_CLIENT_SECRET'),
      code,
    }).toString(),
  })

  if (!tokenRes.ok) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${frontendUrl}/dashboard/integrations?error=todoist_token_failed`,
      },
    })
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string
    token_type: string
  }

  const { internal } = await import('../_generated/api')
  await ctx.runMutation(internal.integrations.upsertIntegrationInternal, {
    userId,
    provider: 'todoist',
    accessToken: tokens.access_token,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${frontendUrl}/dashboard/integrations?success=todoist`,
    },
  })
})
