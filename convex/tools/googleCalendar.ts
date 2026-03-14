import { tool } from 'ai'
import { z } from 'zod'
import { getGoogleCalendarAccessToken } from '../lib/google'
import type { ActionCtx } from '../_generated/server'

interface CalendarEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: Array<{ email: string; responseStatus?: string }>
  htmlLink?: string
}

interface CalendarListResponse {
  items?: Array<CalendarEvent>
}

interface CalendarEventResponse {
  id: string
  htmlLink: string
  summary: string
}

type AILikeCtx = Pick<ActionCtx, 'runQuery' | 'runMutation'>

/**
 * Purpose: Creates the Google Calendar read tool for listing upcoming events or searching a date range.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createCheckScheduleTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      "Check the user's Google Calendar schedule. Can list upcoming events or search for events on a specific date.",
    inputSchema: z.object({
      date: z
        .string()
        .optional()
        .describe('Specific date in YYYY-MM-DD format. Defaults to today.'),
      daysAhead: z
        .number()
        .optional()
        .describe('Number of days ahead to look (default 1, max 30)'),
      maxResults: z
        .number()
        .optional()
        .describe('Maximum events to return (default 10, max 25)'),
      query: z
        .string()
        .optional()
        .describe('Free text search query to filter events'),
    }),
    execute: async ({ date, daysAhead, maxResults, query }) => {
      const accessToken = await getGoogleCalendarAccessToken(ctx, userId)
      if (!accessToken) {
        return 'Google Calendar is not connected. Please connect Google Calendar from the dashboard first.'
      }

      const now = new Date()
      const startDate = date ? new Date(`${date}T00:00:00`) : now
      const days = Math.min(daysAhead ?? 1, 30)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + days)

      const params = new URLSearchParams({
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        maxResults: String(Math.min(maxResults ?? 10, 25)),
        singleEvents: 'true',
        orderBy: 'startTime',
      })
      if (query) params.set('q', query)

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!res.ok) {
        const error = await res.text()
        return `Failed to fetch calendar events: ${error}`
      }

      const data = (await res.json()) as CalendarListResponse
      const events = data.items ?? []

      if (events.length === 0) {
        const dateStr = date ?? 'today'
        return `No events found for ${dateStr}${days > 1 ? ` (next ${days} days)` : ''}.`
      }

      return events
        .map((e) => {
          const start = e.start.dateTime
            ? new Date(e.start.dateTime).toLocaleString()
            : (e.start.date ?? 'Unknown')
          const end = e.end.dateTime
            ? new Date(e.end.dateTime).toLocaleString()
            : (e.end.date ?? '')
          const attendees = e.attendees?.map((a) => a.email).join(', ')
          const parts = [
            `📅 ${e.summary ?? '(No title)'}`,
            `   Time: ${start} → ${end}`,
          ]
          if (e.location) parts.push(`   Location: ${e.location}`)
          if (attendees) parts.push(`   Attendees: ${attendees}`)
          if (e.description)
            parts.push(`   Notes: ${e.description.slice(0, 100)}`)
          return parts.join('\n')
        })
        .join('\n\n')
    },
  })
}

/**
 * Purpose: Creates the Google Calendar scheduling tool for creating meetings or calls in the user's calendar.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createScheduleCallTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description: 'Schedule a call or meeting on Google Calendar.',
    inputSchema: z.object({
      participant: z
        .string()
        .describe('Name or email of the person to schedule with'),
      date: z.string().describe("Date for the call, e.g. '2026-02-15'"),
      time: z.string().describe("Time for the call, e.g. '14:00'"),
      durationMinutes: z
        .number()
        .optional()
        .describe('Duration in minutes (default 30)'),
      topic: z.string().optional().describe('Optional topic or agenda'),
    }),
    execute: async ({ participant, date, time, durationMinutes, topic }) => {
      const accessToken = await getGoogleCalendarAccessToken(ctx, userId)
      if (!accessToken) {
        return 'Google Calendar is not connected. Please connect Google Calendar from the dashboard first.'
      }

      const startDateTime = new Date(`${date}T${time}:00`)
      const duration = durationMinutes ?? 30
      const endDateTime = new Date(startDateTime.getTime() + duration * 60_000)

      const event = {
        summary: topic
          ? `${topic} with ${participant}`
          : `Call with ${participant}`,
        description: topic ?? undefined,
        start: { dateTime: startDateTime.toISOString() },
        end: { dateTime: endDateTime.toISOString() },
        attendees: participant.includes('@')
          ? [{ email: participant }]
          : undefined,
      }

      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        },
      )
      if (!res.ok) {
        const error = await res.text()
        return `Failed to schedule event: ${error}`
      }

      const created = (await res.json()) as CalendarEventResponse
      const agenda = topic ? ` — Topic: ${topic}` : ''
      return `✅ Call scheduled with ${participant} on ${date} at ${time} (${duration} min)${agenda}.\nCalendar link: ${created.htmlLink}`
    },
  })
}

/**
 * Purpose: Creates the Google Calendar delete tool that finds an event and removes it from the user's calendar.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createRemoveEventTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      "Remove/delete an event from the user's Google Calendar. Searches by name then deletes.",
    inputSchema: z.object({
      query: z.string().describe('Name or search text of the event to remove'),
      date: z
        .string()
        .optional()
        .describe('Date in YYYY-MM-DD format. Defaults to today.'),
      daysAhead: z
        .number()
        .optional()
        .describe('Days ahead to search (default 7, max 30)'),
    }),
    execute: async ({ query, date, daysAhead }) => {
      const accessToken = await getGoogleCalendarAccessToken(ctx, userId)
      if (!accessToken) {
        return 'Google Calendar is not connected. Please connect Google Calendar from the dashboard first.'
      }

      const now = new Date()
      const startDate = date ? new Date(`${date}T00:00:00`) : now
      const days = Math.min(daysAhead ?? 7, 30)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + days)

      const params = new URLSearchParams({
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        maxResults: '10',
        singleEvents: 'true',
        orderBy: 'startTime',
        q: query,
      })

      const searchRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!searchRes.ok) {
        const error = await searchRes.text()
        return `Failed to search events: ${error}`
      }

      const data = (await searchRes.json()) as CalendarListResponse
      const events = data.items ?? []

      if (events.length === 0) {
        return `Could not find any event matching "${query}".`
      }

      const target = events[0]
      const deleteRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${target.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      )
      if (!deleteRes.ok) {
        const error = await deleteRes.text()
        return `Failed to delete event: ${error}`
      }

      const start = target.start.dateTime
        ? new Date(target.start.dateTime).toLocaleString()
        : (target.start.date ?? '')
      return `🗑️ Deleted "${target.summary ?? query}" (${start}) from your calendar.`
    },
  })
}
