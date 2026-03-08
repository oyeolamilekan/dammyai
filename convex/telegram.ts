import { internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { executeAIPromptImpl } from './aiActions'
import { markdownToTelegramHtml } from './lib/telegramFormat'

const getEnv = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

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

const sendTelegramMessage = async (chatId: string, text: string) => {
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

// Keeps the typing indicator alive for long-running operations.
// Telegram's typing status expires after ~5s, so we re-send every 4s.
function keepTyping(
  chatId: string,
  action: 'typing' | 'upload_document' = 'typing',
) {
  void sendChatAction(chatId, action)
  const interval = setInterval(() => void sendChatAction(chatId, action), 4_000)
  return () => clearInterval(interval)
}

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
    message?: { chat?: { id?: number | string }; text?: string }
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
