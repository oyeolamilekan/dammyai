import { tool } from 'ai'
import { z } from 'zod'
import { internal } from '../_generated/api'
import { markdownToTelegramHtml } from '../telegram'
import type { ActionCtx } from '../_generated/server'

type AILikeCtx = Pick<ActionCtx, 'runQuery' | 'runMutation'>

const getEnv = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {}

/**
 * Purpose: Creates the Telegram messaging tool that sends proactive assistant messages to the user's linked Telegram chat.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createSendTelegramMessageTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      'Send a message to the user via their linked Telegram account. Use this to proactively notify, remind, or communicate with the user on Telegram.',
    inputSchema: z.object({
      message: z
        .string()
        .min(1)
        .describe(
          'The message text to send. Supports basic Markdown formatting.',
        ),
    }),
    execute: async ({ message }) => {
      const integration = await ctx.runQuery(
        internal.telegramStore.getIntegrationByUserId,
        { userId },
      )

      if (!integration || !integration.telegramChatId) {
        return 'Telegram is not connected. Please link Telegram from the dashboard first.'
      }

      const env = getEnv()
      const token = env.TELEGRAM_BOT_TOKEN
      if (!token) {
        return 'Telegram bot is not configured. Missing TELEGRAM_BOT_TOKEN.'
      }

      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: integration.telegramChatId,
            text: markdownToTelegramHtml(message),
            parse_mode: 'HTML',
          }),
        },
      )

      if (!res.ok) {
        const error = await res.text()
        return `Failed to send Telegram message: ${error}`
      }

      return '✅ Message sent to Telegram.'
    },
  })
}
