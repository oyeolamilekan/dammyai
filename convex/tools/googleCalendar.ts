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
      'View upcoming events on Google Calendar. USE when the user asks "what\'s on my calendar?", "am I free tomorrow?", "any meetings this week?", or wants to check availability. NOT for Todoist tasks (use checkTodos) or scheduled reminders (use listScheduledTasks).',
    inputSchema: z.object({
      date: z
        .string()
        .optional()
        .describe('Start date in YYYY-MM-DD format. Defaults to today. Interpret relative dates ("tomorrow", "next Monday") using current date/time from system prompt.'),
      daysAhead: z
        .number()
        .optional()
        .describe('Number of days to look ahead from the start date (default 1, max 30). Use 7 for "this week", 1 for "today".'),
      maxResults: z
        .number()
        .optional()
        .describe('Maximum events to return (default 10, max 25)'),
      query: z
        .string()
        .optional()
        .describe('Free-text search to filter events by title or description, e.g. "standup", "dentist"'),
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
    description: 'Create a meeting or call on Google Calendar. USE when the user says "schedule a meeting with…", "book a call with…", or "put X on my calendar". NOT for reminders/tasks (use createScheduledTask) or Todoist items (use updateTodo).',
    inputSchema: z.object({
      participant: z
        .string()
        .describe('Name or email of the participant. If email is provided (contains @), they will be added as an attendee.'),
      date: z.string().describe('Date for the event in YYYY-MM-DD format. Interpret relative dates ("tomorrow") using current date from system prompt.'),
      time: z.string().describe('Start time in 24-hour HH:MM format, e.g. "14:00", "09:30". This is interpreted as the user\'s local time.'),
      durationMinutes: z
        .number()
        .optional()
        .describe('Duration in minutes (default 30). Common: 15, 30, 60.'),
      topic: z.string().optional().describe('Meeting topic or agenda. Used in the event title as "Topic with Participant".'),
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
      'Delete an event from Google Calendar by searching for it. Finds the first matching event and removes it. USE when the user says "cancel my meeting with…", "remove the dentist appointment", or "delete that event".',
    inputSchema: z.object({
      query: z.string().describe('Search text to find the event — use the event title, participant name, or keywords, e.g. "standup", "call with John"'),
      date: z
        .string()
        .optional()
        .describe('Start date for search range in YYYY-MM-DD format. Defaults to today.'),
      daysAhead: z
        .number()
        .optional()
        .describe('Days ahead to search from start date (default 7, max 30). Use wider range if the event might be further out.'),
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
