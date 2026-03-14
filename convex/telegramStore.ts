import { v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'

const roleValidator = v.union(
  v.literal('user'),
  v.literal('assistant'),
  v.literal('tool'),
)

/**
 * Purpose: Finds a pending Telegram integration by its short-lived linking code.
 * Function type: internalQuery
 * Args:
 * - linkingCode: v.string()
 */
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

/**
 * Purpose: Resolves a Telegram chat ID back to the linked user integration record.
 * Function type: internalQuery
 * Args:
 * - chatId: v.string()
 */
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

/**
 * Purpose: Loads the Telegram integration for a user so background jobs can deliver messages.
 * Function type: internalQuery
 * Args:
 * - userId: v.string()
 */
export const getIntegrationByUserId = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('integrations')
      .withIndex('userId_provider', (q) =>
        q.eq('userId', args.userId).eq('provider', 'telegram'),
      )
      .unique()
  },
})

/**
 * Purpose: Loads a user's soul settings for Telegram conversations.
 * Function type: internalQuery
 * Args:
 * - userId: v.string()
 */
export const getSoulByUserId = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('souls')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .unique()
  },
})

/**
 * Purpose: Finalizes Telegram account linking by attaching the bot chat ID to the integration record.
 * Function type: internalMutation
 * Args:
 * - integrationId: v.id('integrations')
 * - chatId: v.string()
 */
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

/**
 * Purpose: Persists a Telegram conversation message into the shared messages history table.
 * Function type: internalMutation
 * Args:
 * - userId: v.string()
 * - role: roleValidator
 * - content: v.string()
 * - toolName: v.optional(v.string())
 * - toolCallId: v.optional(v.string())
 */
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
