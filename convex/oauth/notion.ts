import { httpAction } from '../_generated/server'
import { getRequiredEnv } from '../lib/env'

export const notionAuth = httpAction(async (_ctx, request) => {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  if (!userId) {
    return new Response('Missing userId', { status: 400 })
  }

  const clientId = getRequiredEnv('NOTION_CLIENT_ID')
  const redirectUri = getRequiredEnv('NOTION_REDIRECT_URI')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    owner: 'user',
    state: userId,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://api.notion.com/v1/oauth/authorize?${params.toString()}`,
    },
  })
})

export const notionCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const userId = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const frontendUrl = getRequiredEnv('FRONTEND_URL')

  if (error || !code || !userId) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${frontendUrl}/dashboard/integrations?error=notion_denied`,
      },
    })
  }

  const clientId = getRequiredEnv('NOTION_CLIENT_ID')
  const clientSecret = getRequiredEnv('NOTION_CLIENT_SECRET')
  const redirectUri = getRequiredEnv('NOTION_REDIRECT_URI')

  const credentials = btoa(`${clientId}:${clientSecret}`)

  const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${frontendUrl}/dashboard/integrations?error=notion_token_failed`,
      },
    })
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string
    workspace_id: string
    bot_id: string
  }

  const { internal } = await import('../_generated/api')
  await ctx.runMutation(internal.integrations.upsertIntegrationInternal, {
    userId,
    provider: 'notion',
    accessToken: tokens.access_token,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${frontendUrl}/dashboard/integrations?success=notion`,
    },
  })
})
