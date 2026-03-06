import { v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
import { getUserId, requireUserId } from './lib/session'

const providerValidator = v.union(
  v.literal('telegram'),
  v.literal('gmail'),
  v.literal('google_calendar'),
  v.literal('todoist'),
  v.literal('notion'),
  v.literal('exa'),
)

const now = () => Date.now()

export const listIntegrations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx)
    if (!userId) {
      return []
    }
    const docs = await ctx.db
      .query('integrations')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .collect()

    return docs.map((doc) => ({
      id: doc._id,
      provider: doc.provider,
      apiKey: doc.apiKey ?? null,
      accessToken: doc.accessToken ?? null,
      refreshToken: doc.refreshToken ?? null,
      tokenExpiresAt: doc.tokenExpiresAt ?? null,
      scope: doc.scope ?? null,
      telegramChatId: doc.telegramChatId ?? null,
      linkingCode: doc.linkingCode ?? null,
      createdAt: new Date(doc.createdAt).toISOString(),
      updatedAt: new Date(doc.updatedAt).toISOString(),
    }))
  },
})

export const upsertIntegration = mutation({
  args: {
    provider: providerValidator,
    apiKey: v.optional(v.string()),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    scope: v.optional(v.string()),
    telegramChatId: v.optional(v.string()),
    linkingCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const isApiKeyProvider =
      args.provider === 'telegram' || args.provider === 'exa'
    const isOauthProvider =
      args.provider === 'gmail' ||
      args.provider === 'google_calendar' ||
      args.provider === 'todoist' ||
      args.provider === 'notion'

    if (isApiKeyProvider && !args.apiKey && !args.telegramChatId) {
      throw new Error('apiKey is required for this provider')
    }
    if (isOauthProvider && !args.accessToken) {
      throw new Error('accessToken is required for this provider')
    }

    const existing = await ctx.db
      .query('integrations')
      .withIndex('userId_provider', (q) =>
        q.eq('userId', userId).eq('provider', args.provider),
      )
      .unique()

    const payload = {
      apiKey: args.apiKey,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiresAt: args.tokenExpiresAt,
      scope: args.scope,
      telegramChatId: args.telegramChatId,
      linkingCode: args.linkingCode,
      updatedAt: now(),
    }

    if (existing) {
      await ctx.db.patch('integrations', existing._id, payload)
      return existing._id
    }

    return await ctx.db.insert('integrations', {
      userId,
      provider: args.provider,
      ...payload,
      createdAt: now(),
    })
  },
})

export const deleteIntegration = mutation({
  args: {
    provider: providerValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const existing = await ctx.db
      .query('integrations')
      .withIndex('userId_provider', (q) =>
        q.eq('userId', userId).eq('provider', args.provider),
      )
      .unique()

    if (!existing) {
      throw new Error('Integration not found')
    }
    await ctx.db.delete('integrations', existing._id)
    return { success: true }
  },
})

export const createTelegramLink = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    let existing = await ctx.db
      .query('integrations')
      .withIndex('userId_provider', (q) =>
        q.eq('userId', userId).eq('provider', 'telegram'),
      )
      .unique()

    const linkingCode = crypto.randomUUID().slice(0, 8)
    const env = (globalThis as { process?: { env?: Record<string, string> } })
      .process?.env
    const botUsername = env?.TELEGRAM_BOT_USERNAME ?? 'ubtter'

    console.log(botUsername)

    if (existing) {
      await ctx.db.patch('integrations', existing._id, {
        linkingCode,
        updatedAt: now(),
      })
    } else {
      const id = await ctx.db.insert('integrations', {
        userId,
        provider: 'telegram',
        linkingCode,
        createdAt: now(),
        updatedAt: now(),
      })
      existing = await ctx.db.get('integrations', id)
    }

    return {
      linkingCode,
      telegramUrl: `https://t.me/${botUsername}?start=${linkingCode}`,
      integrationId: existing?._id ?? null,
    }
  },
})

/** Internal mutation used by OAuth callback HTTP actions (no auth context). */
export const upsertIntegrationInternal = internalMutation({
  args: {
    userId: v.string(),
    provider: providerValidator,
    apiKey: v.optional(v.string()),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('integrations')
      .withIndex('userId_provider', (q) =>
        q.eq('userId', args.userId).eq('provider', args.provider),
      )
      .unique()

    const payload = {
      apiKey: args.apiKey,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiresAt: args.tokenExpiresAt,
      scope: args.scope,
      updatedAt: now(),
    }

    if (existing) {
      if (!args.refreshToken && existing.refreshToken) {
        payload.refreshToken = existing.refreshToken
      }
      await ctx.db.patch('integrations', existing._id, payload)
      return existing._id
    }

    return await ctx.db.insert('integrations', {
      userId: args.userId,
      provider: args.provider,
      ...payload,
      createdAt: now(),
    })
  },
})
