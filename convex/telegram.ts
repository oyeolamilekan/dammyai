import { internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { executeAIPromptImpl } from './ai/engine'
import { markdownToTelegramHtml } from './lib/telegramFormat'

/**
 * Purpose: Safely retrieves process.env in the Convex serverless runtime.
 * Returns an empty object when process.env is unavailable.
 */
const getEnv = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {}

/**
 * Purpose: Builds a JSON HTTP response with the correct Content-Type header.
 * Args:
 * - body: unknown — response payload to serialize
 * - status: number — HTTP status code (default 200)
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Purpose: Extracts the linking code from a /start command.
 * Returns null if the text isn't a /start command, an empty string for bare /start,
 * or the code string for /start <code>.
 * Args:
 * - text: string — the raw message text from Telegram
 */
const parseStartCode = (text: string) => {
  if (!text.startsWith('/start')) return null
  const rest = text.replace('/start', '').trim()
  return rest.length > 0 ? rest : ''
}

/**
 * Convert common Markdown produced by the AI into Telegram-safe HTML.
 * Handles: bold, italic, inline code, code blocks, links, and HTML escaping.
 */
// Re-exported from lib/telegramFormat.ts — kept here for backward compat
export { markdownToTelegramHtml } from './lib/telegramFormat'

/**
 * Purpose: Sends a text message to a Telegram chat, converting Markdown to Telegram-safe HTML.
 * No-ops silently when TELEGRAM_BOT_TOKEN is not configured.
 * Args:
 * - chatId: string — the Telegram chat to send to
 * - text: string — Markdown-formatted message content
 */
export const sendTelegramMessage = async (chatId: string, text: string) => {
  const env = getEnv()
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: markdownToTelegramHtml(text),
      parse_mode: 'HTML',
    }),
  })
}

/**
 * Purpose: Sends a chat action indicator (e.g. "typing") to a Telegram chat.
 * No-ops silently when TELEGRAM_BOT_TOKEN is not configured.
 * Args:
 * - chatId: string — the Telegram chat to send the action to
 * - action: 'typing' | 'upload_document' — the action type (default 'typing')
 */
export const sendChatAction = async (
  chatId: string,
  action: 'typing' | 'upload_document' = 'typing',
) => {
  const env = getEnv()
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  })
}

/**
 * Purpose: Keeps the typing (or upload) indicator alive for long-running operations.
 * Telegram's typing status expires after ~5s, so this re-sends every 4s.
 * Returns a cleanup function that stops the interval.
 * Args:
 * - chatId: string — the Telegram chat to show the indicator in
 * - action: 'typing' | 'upload_document' — the action type (default 'typing')
 */
function keepTyping(
  chatId: string,
  action: 'typing' | 'upload_document' = 'typing',
) {
  void sendChatAction(chatId, action)
  const interval = setInterval(() => void sendChatAction(chatId, action), 4_000)
  return () => clearInterval(interval)
}

/**
 * Purpose: Sends a file (PDF or HTML) as a document attachment to a Telegram chat.
 * MIME type is inferred from the file extension. No-ops when TELEGRAM_BOT_TOKEN is missing.
 * Args:
 * - chatId: string — the Telegram chat to send the document to
 * - fileBuffer: ArrayBuffer — the raw file bytes
 * - fileName: string — the file name (used for MIME inference and display)
 * - caption: string (optional) — an optional caption shown alongside the document
 */
export const sendTelegramDocument = async (
  chatId: string,
  fileBuffer: ArrayBuffer,
  fileName: string,
  caption?: string,
) => {
  const env = getEnv()
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) return
  const formData = new FormData()
  formData.append('chat_id', chatId)
  const mimeType = fileName.endsWith('.pdf') ? 'application/pdf' : 'text/html'
  formData.append(
    'document',
    new Blob([fileBuffer], { type: mimeType }),
    fileName,
  )
  if (caption) formData.append('caption', caption)
  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: formData,
  })
}

/**
 * Purpose: Telegram webhook handler — the main entry point for incoming Telegram updates.
 * Flow:
 *   1. Validates the webhook secret header (if configured)
 *   2. Deduplicates via update_id (idempotency guard using telegramProcessedUpdates table)
 *   3. Handles /start commands for account linking (bare /start shows instructions,
 *      /start <code> completes the linking flow)
 *   4. For regular messages, looks up the linked user integration and runs the AI prompt
 *   5. Sends the AI response back, showing a typing indicator while processing
 * Function type: httpAction
 */
export const webhook = httpAction(async (ctx, request) => {
  const env = getEnv()
  const secret = env.TELEGRAM_WEBHOOK_SECRET
  if (secret) {
    const header = request.headers.get('x-telegram-bot-api-secret-token')
    if (header !== secret) {
      return json({ error: 'Unauthorized' }, 401)
    }
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400)
  }

  const update = payload as {
    update_id?: number
    message?: { chat?: { id?: number | string }; text?: string }
  }

  // Idempotency: skip if this update was already processed
  const updateId = update.update_id
  if (updateId !== undefined) {
    const alreadyProcessed = await ctx.runQuery(
      internal.telegramStore.hasProcessedUpdate,
      { updateId },
    )
    if (alreadyProcessed) {
      return json({ ok: true })
    }
    await ctx.runMutation(internal.telegramStore.markUpdateProcessed, {
      updateId,
    })
  }

  const text = update.message?.text?.trim()
  const chatIdRaw = update.message?.chat?.id
  if (!text || chatIdRaw === undefined) {
    return json({ ok: true })
  }

  const chatId = String(chatIdRaw)
  const startCode = parseStartCode(text)

  if (startCode !== null) {
    if (!startCode) {
      await sendTelegramMessage(
        chatId,
        '👋 Welcome! Generate a linking code in dashboard, then send /start <code>.',
      )
      return json({ ok: true })
    }

    const integration = await ctx.runQuery(
      internal.telegramStore.getIntegrationByLinkingCode,
      {
        linkingCode: startCode,
      },
    )

    if (!integration) {
      await sendTelegramMessage(
        chatId,
        '❌ Invalid or expired linking code. Generate a new one in dashboard.',
      )
      return json({ ok: true })
    }

    await ctx.runMutation(internal.telegramStore.completeTelegramLink, {
      integrationId: integration._id,
      chatId,
    })
    await sendTelegramMessage(
      chatId,
      '✅ Telegram linked successfully. Send any message to chat.',
    )
    return json({ ok: true })
  }

  const integration = await ctx.runQuery(
    internal.telegramStore.getIntegrationByChatId,
    {
      chatId,
    },
  )

  if (!integration) {
    await sendTelegramMessage(
      chatId,
      '🔗 Telegram not linked. Open dashboard and send /start <code> here.',
    )
    return json({ ok: true })
  }

  const stopTyping = keepTyping(chatId)
  try {
    const reply = await executeAIPromptImpl(ctx, {
      userId: integration.userId,
      prompt: text,
    })
    stopTyping()
    await sendTelegramMessage(chatId, reply)
  } catch (error) {
    stopTyping()
    await sendTelegramMessage(
      chatId,
      '⚠️ Something went wrong. Please try again.',
    )
  }
  return json({ ok: true })
})

/**
 * Purpose: Registers the Telegram webhook URL with the Telegram Bot API.
 * Derives the webhook URL from env vars (TELEGRAM_WEBHOOK_URL, CONVEX_SITE_URL)
 * or falls back to the incoming request origin. Optionally sets a secret_token for validation.
 * Function type: httpAction (POST only)
 */
export const registerWebhook = httpAction(async (_ctx, request) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405)
  }

  const env = getEnv()
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return json({ error: 'Missing TELEGRAM_BOT_TOKEN' }, 500)
  }

  // Derive the site base URL from the incoming request if not explicitly set
  const requestOrigin = new URL(request.url).origin
  const baseUrl =
    env.TELEGRAM_WEBHOOK_URL ?? env.CONVEX_SITE_URL ?? requestOrigin

  const url = `${baseUrl.replace(/\/$/, '')}/api/telegram/webhook`
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    }),
  })

  const data = await res.json()
  return json({ webhookUrl: url, telegram: data }, res.ok ? 200 : 500)
})

/**
 * Purpose: Removes the Telegram webhook registration via the Telegram Bot API.
 * Calls the deleteWebhook endpoint to stop receiving updates.
 * Function type: httpAction (POST only)
 */
export const unregisterWebhook = httpAction(async (_ctx, request) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405)
  }

  const env = getEnv()
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return json({ error: 'Missing TELEGRAM_BOT_TOKEN' }, 500)
  }

  const res = await fetch(
    `https://api.telegram.org/bot${token}/deleteWebhook`,
    {
      method: 'POST',
    },
  )
  const data = await res.json()
  return json({ telegram: data }, res.ok ? 200 : 500)
})
