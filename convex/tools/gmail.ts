import { tool } from 'ai'
import { z } from 'zod'
import { getGmailAccessToken } from '../lib/google'
import type { ActionCtx } from '../_generated/server'

interface GmailMessage {
  id: string
  threadId: string
}

interface GmailMessageDetail {
  id: string
  snippet: string
  labelIds: Array<string>
  payload: {
    headers: Array<{ name: string; value: string }>
  }
}

/**
 * Purpose: Lists Gmail message IDs for the current mailbox using the provided Gmail search query.
 * Function type: helper
 * Args:
 * - accessToken: string
 * - query: string
 * - maxResults: number
 */
async function listMessages(
  accessToken: string,
  query: string,
  maxResults = 10,
) {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    ...(query && { q: query }),
  })
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`)
  const data = (await res.json()) as { messages?: Array<GmailMessage> }
  return data.messages ?? []
}

/**
 * Purpose: Loads the metadata for a single Gmail message so tool responses can show sender, subject, and preview text.
 * Function type: helper
 * Args:
 * - accessToken: string
 * - messageId: string
 */
async function getMessageDetail(accessToken: string, messageId: string) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`)
  return (await res.json()) as GmailMessageDetail
}

/**
 * Purpose: Archives a Gmail message by removing the INBOX label while leaving the message in the mailbox.
 * Function type: helper
 * Args:
 * - accessToken: string
 * - messageId: string
 */
async function archiveMessage(accessToken: string, messageId: string) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
    },
  )
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`)
}

/**
 * Purpose: Moves a Gmail message to trash.
 * Function type: helper
 * Args:
 * - accessToken: string
 * - messageId: string
 */
async function trashMessage(accessToken: string, messageId: string) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`)
}

/**
 * Purpose: Builds a base64url-encoded raw RFC 822 email payload for the Gmail send-message endpoint.
 * Function type: helper
 * Args:
 * - to: string
 * - subject: string
 * - body: string
 * - cc: string | undefined
 * - bcc: string | undefined
 */
function buildRawEmail(
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
) {
  const lines = [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ]
  // Use base64url encoding
  const raw = btoa(lines.join('\r\n'))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return raw
}

type AILikeCtx = Pick<ActionCtx, 'runQuery' | 'runMutation'>

/**
 * Purpose: Creates the Gmail read tool for checking inbox messages with unread, sender, or free-text filters.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createCheckMailTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      'Read emails from the user\'s Gmail inbox. USE when the user asks "check my email", "any new mail?", "emails from John", or wants to see recent messages. Supports filtering by unread status, sender, or free-text Gmail search syntax.',
    inputSchema: z.object({
      unreadOnly: z
        .boolean()
        .optional()
        .describe('If true, only return unread emails. Default: false (all emails).'),
      sender: z
        .string()
        .optional()
        .describe('Filter by sender name or email address, e.g. "john@example.com" or "John"'),
      query: z
        .string()
        .optional()
        .describe('Gmail search query (same syntax as Gmail search box), e.g. "subject:invoice", "has:attachment", "after:2024/01/01"'),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe('Number of emails to return (default 5, max 10)'),
    }),
    execute: async ({ unreadOnly, sender, query, maxResults }) => {
      const accessToken = await getGmailAccessToken(ctx, userId)
      if (!accessToken) {
        return 'Gmail is not connected. Please connect Gmail from the dashboard first.'
      }

      const parts: Array<string> = []
      if (unreadOnly) parts.push('is:unread')
      if (sender) parts.push(`from:${sender}`)
      if (query) parts.push(query)
      const gmailQuery = parts.join(' ')
      const count = Math.min(maxResults, 10)

      const messages = await listMessages(accessToken, gmailQuery, count)
      if (messages.length === 0)
        return 'No emails found matching your criteria.'

      const details = await Promise.all(
        messages.map((m) => getMessageDetail(accessToken, m.id)),
      )

      return details
        .map((d) => {
          const from =
            d.payload.headers.find((h) => h.name === 'From')?.value ?? 'Unknown'
          const subject =
            d.payload.headers.find((h) => h.name === 'Subject')?.value ??
            '(no subject)'
          const isUnread = d.labelIds.includes('UNREAD')
          return `${isUnread ? '🔵' : '⚪'} From: ${from}\n   Subject: ${subject}\n   Preview: ${d.snippet}`
        })
        .join('\n\n')
    },
  })
}

/**
 * Purpose: Creates the Gmail send tool for composing and sending plain-text emails from the user's Gmail account.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createSendMailTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      'Send an email from the user\'s Gmail account. In interactive chat: show a draft summary (to, subject, first line of body) and ask the user to confirm before calling this tool. In scheduled task context: send directly without confirmation. USE when the user asks to send, compose, or reply to an email.',
    inputSchema: z.object({
      to: z.string().describe('Recipient email address, e.g. "john@example.com"'),
      subject: z.string().describe('Email subject line'),
      body: z.string().describe('Plain text email body. Use line breaks for paragraphs.'),
      cc: z.string().optional().describe('CC recipient email address (optional)'),
      bcc: z.string().optional().describe('BCC recipient email address (optional)'),
    }),
    execute: async ({ to, subject, body, cc, bcc }) => {
      const accessToken = await getGmailAccessToken(ctx, userId)
      if (!accessToken) {
        return 'Gmail is not connected. Please connect Gmail from the dashboard first.'
      }

      const raw = buildRawEmail(to, subject, body, cc, bcc)
      const res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        },
      )
      if (!res.ok) {
        const error = await res.text()
        return `Failed to send email: ${error}`
      }
      return `✅ Email sent to ${to} with subject "${subject}"`
    },
  })
}

/**
 * Purpose: Creates the Gmail management tool for archiving or deleting emails selected by search criteria.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createManageMailTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      'Archive or delete emails from Gmail. USE when the user says "clean up my inbox", "archive emails from X", "delete that email", or wants to manage email bulk. Requires at least one filter (query, sender, or subject) to target emails.',
    inputSchema: z.object({
      action: z
        .enum(['archive', 'delete'])
        .describe('"archive" removes from inbox but keeps the email; "delete" moves to trash'),
      query: z.string().optional().describe('Gmail search query to find target emails, e.g. "is:unread older_than:7d"'),
      sender: z
        .string()
        .optional()
        .describe('Filter by sender name or email address'),
      subject: z.string().optional().describe('Filter by subject keywords'),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe('Max emails to process in one call (default 5, max 10)'),
    }),
    execute: async ({ action, query, sender, subject, maxResults }) => {
      const accessToken = await getGmailAccessToken(ctx, userId)
      if (!accessToken) {
        return 'Gmail is not connected. Please connect Gmail from the dashboard first.'
      }

      const parts: Array<string> = []
      if (sender) parts.push(`from:${sender}`)
      if (subject) parts.push(`subject:${subject}`)
      if (query) parts.push(query)
      const gmailQuery = parts.join(' ')

      if (!gmailQuery) {
        return 'Please provide a search query, sender, or subject to find emails.'
      }

      const count = Math.min(maxResults, 10)
      const messages = await listMessages(accessToken, gmailQuery, count)
      if (messages.length === 0)
        return 'No emails found matching your criteria.'

      const details = await Promise.all(
        messages.map((m) => getMessageDetail(accessToken, m.id)),
      )

      const actionFn = action === 'archive' ? archiveMessage : trashMessage
      const actionLabel = action === 'archive' ? 'archived' : 'deleted'

      for (const d of details) {
        await actionFn(accessToken, d.id)
      }

      const summaries = details.map((d) => {
        const from =
          d.payload.headers.find((h) => h.name === 'From')?.value ?? 'Unknown'
        const subj =
          d.payload.headers.find((h) => h.name === 'Subject')?.value ??
          '(no subject)'
        return `• ${from} — ${subj}`
      })

      return `✅ ${details.length} email(s) ${actionLabel}:\n${summaries.join('\n')}`
    },
  })
}
