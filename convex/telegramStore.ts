import { v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'

const roleValidator = v.union(
  v.literal('user'),
  v.literal('assistant'),
  v.literal('tool'),
)

export const getIntegrationByLinkingCode = internalQuery({
  args: { linkingCode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('integrations')
      .withIndex('provider_linkingCode', (q) =>
        q.eq('provider', 'telegram').eq('linkingCode', args.linkingCode),
      )
      .unique()
  },
})

export const getIntegrationByChatId = internalQuery({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('integrations')
      .withIndex('provider_telegramChatId', (q) =>
        q.eq('provider', 'telegram').eq('telegramChatId', args.chatId),
      )
      .unique()
  },
})

export const getIntegrationByUserId = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const integrations = await ctx.db
      .query('integrations')
      .filter((q) =>
        q.and(
          q.eq(q.field('userId'), args.userId),
          q.eq(q.field('provider'), 'telegram'),
        ),
      )
      .collect()
    // Return the one with a chatId (linked)
    return integrations.find((i) => i.telegramChatId) ?? null
  },
})

export const getSoulByUserId = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('souls')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .unique()
  },
})

export const completeTelegramLink = internalMutation({
  args: { integrationId: v.id('integrations'), chatId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch('integrations', args.integrationId, {
      telegramChatId: args.chatId,
      linkingCode: undefined,
      updatedAt: Date.now(),
    })
  },
})

export const saveTelegramMessage = internalMutation({
  args: {
    userId: v.string(),
    role: roleValidator,
    content: v.string(),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      userId: args.userId,
      role: args.role,
      content: args.content,
      toolName: args.toolName,
      toolCallId: args.toolCallId,
      createdAt: Date.now(),
    })
  },
})
