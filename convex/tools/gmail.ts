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

async function getMessageDetail(accessToken: string, messageId: string) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`)
  return (await res.json()) as GmailMessageDetail
}

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

export function createCheckMailTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      "Check the user's Gmail inbox. Can filter by unread status or search by sender/keyword.",
    inputSchema: z.object({
      unreadOnly: z
        .boolean()
        .optional()
        .describe('If true, only return unread emails'),
      sender: z
        .string()
        .optional()
        .describe('Filter emails by sender name or address'),
      query: z
        .string()
        .optional()
        .describe('General search query (same as Gmail search box)'),
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

export function createSendMailTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      "Send an email via the user's Gmail account. Requires a recipient, subject, and body.",
    inputSchema: z.object({
      to: z.string().describe('Recipient email address'),
      subject: z.string().describe('Email subject line'),
      body: z.string().describe('Plain text email body'),
      cc: z.string().optional().describe('CC recipient email address'),
      bcc: z.string().optional().describe('BCC recipient email address'),
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

export function createManageMailTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      "Archive or delete emails from the user's Gmail. Can target emails by search query, sender, or subject.",
    inputSchema: z.object({
      action: z
        .enum(['archive', 'delete'])
        .describe("'archive' removes from inbox, 'delete' moves to trash"),
      query: z.string().optional().describe('Search query to find emails'),
      sender: z
        .string()
        .optional()
        .describe('Filter by sender name or address'),
      subject: z.string().optional().describe('Filter by subject keywords'),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe('Max emails to process (default 5, max 10)'),
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
