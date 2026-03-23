import { tool } from 'ai'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import { parseRunAtIso } from '../toolHelpers'
import type { AILikeCtx } from '../types'

const taskWeekdaySchema = z.enum([
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
])

const TASK_WEEKDAY_LABELS: Record<
  z.infer<typeof taskWeekdaySchema>,
  string
> = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
}

function joinWithAnd(items: Array<string>) {
  if (items.length <= 1) {
    return items[0] ?? ''
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function formatWeekdaySchedule(
  weekdays: Array<z.infer<typeof taskWeekdaySchema>>,
  timeOfDay: string,
) {
  const time = new Date(`1970-01-01T${timeOfDay}:00Z`).toLocaleTimeString(
    'en-US',
    {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    },
  )

  return `every ${joinWithAnd(weekdays.map((weekday) => TASK_WEEKDAY_LABELS[weekday]))} at ${time}`
}

/**
 * Purpose: Formats the human-readable repeat interval summary returned after creating a recurring scheduled task.
 * Function type: helper
 * Args:
 * - intervalMinutes: number | undefined
 */
function formatRepeatInfo(intervalMinutes?: number) {
  if (!intervalMinutes) {
    return undefined
  }
  if (intervalMinutes >= 1440) {
    return `every ${Math.round(intervalMinutes / 1440)} day(s)`
  }
  if (intervalMinutes >= 60) {
    return `every ${Math.round(intervalMinutes / 60)} hour(s)`
  }
  return `every ${intervalMinutes} minute(s)`
}

/**
 * Purpose: Formats the human-readable scheduled date shown after creating a scheduled task.
 * Function type: helper
 * Args:
 * - runAtIso: string | undefined
 */
function formatScheduledFor(runAtIso?: string) {
  if (!runAtIso) {
    return undefined
  }
  return new Date(runAtIso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatTaskScheduleSummary({
  type,
  intervalMinutes,
  runAtIso,
  weekdays,
  timeOfDay,
}: {
  type: 'one_off' | 'recurring'
  intervalMinutes?: number
  runAtIso?: string
  weekdays?: Array<z.infer<typeof taskWeekdaySchema>>
  timeOfDay?: string
}) {
  if (type === 'one_off') {
    return formatScheduledFor(runAtIso)
  }

  if (weekdays?.length && timeOfDay) {
    return formatWeekdaySchedule(weekdays, timeOfDay)
  }

  return formatRepeatInfo(intervalMinutes)
}

/**
 * Purpose: Creates the tool that schedules a one-off or recurring task.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createScheduledTaskTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      'Create a time-triggered task or reminder. USE when the user says "remind me to…", "at 3pm do…", "every morning send me…", "every Tuesday…", or "on Mondays and Tuesdays…". For one_off: runAtIso is required. For recurring: use either intervalMinutes for interval-based schedules OR weekdays + timeOfDay for weekday-based schedules. NOT for Todoist tasks (use updateTodo) or calendar events (use scheduleCall).',
    inputSchema: z.object({
      prompt: z.string().min(1).describe(
        'The exact command to execute when this task fires. Write as a direct imperative — e.g. "Search BTC, SOL, ETH prices and top 3 crypto headlines, then send the result via Telegram" or "Check my inbox for unread emails and summarise them". ' +
          'IMPORTANT: Do NOT include scheduling language ("daily", "each morning", "every day", "at 07:00", "remind me") — those are already captured by runAtIso/intervalMinutes. ' +
          'The prompt is replayed verbatim at execution time, so it must read as an immediate "do this right now" instruction.',
      ),
      type: z
        .enum(['one_off', 'recurring'])
        .describe(
          '"one_off" for a single future execution, "recurring" for repeated execution at a fixed interval',
        ),
      runAtIso: z
        .string()
        .optional()
        .describe(
          'UTC ISO 8601 datetime for when to run, e.g. "2026-03-05T08:00:00Z". Convert from user timezone to UTC using their timezone in core memory. Required for one_off.',
        ),
      intervalMinutes: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          'Repeat interval in minutes for interval-based recurring schedules. Required only when the recurring task repeats by a fixed interval. Common values: 60 = hourly, 1440 = daily, 10080 = weekly.',
        ),
      weekdays: z
        .array(taskWeekdaySchema)
        .min(1)
        .optional()
        .describe(
          'Weekdays for weekday-based recurring schedules. Examples: ["tuesday"] or ["monday", "tuesday"]. Use together with timeOfDay.',
        ),
      timeOfDay: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .optional()
        .describe(
          '24-hour time for weekday-based recurring schedules, e.g. "09:00" or "18:30". Use the user timezone unless they explicitly asked for another timezone.',
        ),
      scheduleTimezone: z
        .string()
        .optional()
        .describe(
          'Optional IANA timezone like "Africa/Lagos" or "Europe/London" for weekday schedules. Omit to use the user\'s saved timezone, or UTC if none is set.',
        ),
    }),
    execute: async ({
      prompt,
      type,
      runAtIso,
      intervalMinutes,
      weekdays,
      timeOfDay,
      scheduleTimezone,
    }) => {
      const runAt = parseRunAtIso(runAtIso)
      const intervalMs = intervalMinutes ? intervalMinutes * 60_000 : undefined
      const userSoul =
        weekdays?.length && timeOfDay && !scheduleTimezone
          ? await ctx.runQuery(internal.aiStore.getSoulByUserId, { userId })
          : null

      await ctx.runMutation(internal.aiTools.createScheduledTask, {
        userId,
        prompt,
        type,
        runAt,
        intervalMs,
        weekdays,
        timeOfDay,
        scheduleTimezone:
          weekdays?.length && timeOfDay
            ? scheduleTimezone ?? userSoul?.timezone ?? 'UTC'
            : undefined,
      })
      const schedule = formatTaskScheduleSummary({
        type,
        intervalMinutes,
        runAtIso,
        weekdays,
        timeOfDay,
      })
      return JSON.stringify({
        status: 'created',
        taskType: type,
        description: prompt,
        ...(type === 'one_off' && schedule ? { scheduledFor: schedule } : {}),
        ...(type === 'recurring' && schedule ? { schedule } : {}),
      })
    },
  })
}

/**
 * Purpose: Creates the tool that lists the user's scheduled tasks.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createListScheduledTasksTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      'List the user\'s scheduled tasks and reminders created via createScheduledTask. USE when the user asks "show my reminders", "what tasks are scheduled?", or "list my scheduled stuff". NOT for Todoist tasks (use checkTodos) or calendar events (use checkSchedule).',
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe('Max tasks to return (default 20)'),
      type: z
        .enum(['one_off', 'recurring'])
        .optional()
        .describe(
          'Filter by task type: "one_off" for one-time reminders, "recurring" for repeating tasks. Omit for all.',
        ),
    }),
    execute: async ({ limit, type }) => {
      const tasks = await ctx.runQuery(internal.aiTools.listScheduledTasks, {
        userId,
        limit,
        type,
      })
      if (tasks.length === 0) {
        return JSON.stringify({ status: 'empty', tasks: [] })
      }
      return JSON.stringify({
        status: 'ok',
        tasks: tasks.map((task) => ({
          id: task.id,
          description: task.prompt,
          type: task.type === 'recurring' ? 'recurring' : 'one_off',
          active: task.enabled,
          schedule: formatTaskScheduleSummary({
            type: task.type,
            intervalMinutes: task.intervalMs
              ? Math.round(task.intervalMs / 60_000)
              : undefined,
            runAtIso: task.runAt ? new Date(task.runAt).toISOString() : undefined,
            weekdays: task.weekdays,
            timeOfDay: task.timeOfDay ?? undefined,
          }),
        })),
      })
    },
  })
}

/**
 * Purpose: Creates the tool that updates a scheduled task's description or enabled state.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createUpdateScheduledTaskTool(
  ctx: AILikeCtx,
  userId: string,
) {
  return tool({
    description:
      "Update a scheduled task's description or enabled/disabled state. Get the task ID from listScheduledTasks first. USE to pause, resume, or edit an existing scheduled task.",
    inputSchema: z.object({
      id: z.string().min(1).describe('Task ID from listScheduledTasks results'),
      prompt: z
        .string()
        .optional()
        .describe('New task description. Omit to keep unchanged.'),
      enabled: z
        .boolean()
        .optional()
        .describe('Set true to enable (resume) or false to disable (pause) the task'),
    }),
    execute: async ({ id, prompt, enabled }) => {
      await ctx.runMutation(internal.aiTools.updateScheduledTask, {
        userId,
        id,
        prompt,
        enabled,
      })
      const changes: Record<string, unknown> = { status: 'updated' }
      if (prompt !== undefined) changes.newDescription = prompt
      if (enabled !== undefined) changes.active = enabled
      return JSON.stringify(changes)
    },
  })
}

/**
 * Purpose: Creates the tool that deletes a scheduled task by ID.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createDeleteScheduledTaskTool(
  ctx: AILikeCtx,
  userId: string,
) {
  return tool({
    description:
      'Permanently delete a scheduled task. Get the task ID from listScheduledTasks first. USE when the user wants to remove a reminder or recurring task entirely.',
    inputSchema: z.object({
      id: z.string().min(1).describe('Task ID from listScheduledTasks results'),
    }),
    execute: async ({ id }) =>
      (await ctx.runMutation(internal.aiTools.deleteScheduledTask, {
        userId,
        id,
      }))
        ? JSON.stringify({ status: 'deleted' })
        : JSON.stringify({ status: 'not_found' }),
  })
}

/**
 * Purpose: Builds the grouped scheduled-task tool map consumed by the top-level AI tool composer.
 * Function type: helper factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createScheduledTaskTools(ctx: AILikeCtx, userId: string) {
  return {
    createScheduledTask: createScheduledTaskTool(ctx, userId),
    listScheduledTasks: createListScheduledTasksTool(ctx, userId),
    updateScheduledTask: createUpdateScheduledTaskTool(ctx, userId),
    deleteScheduledTask: createDeleteScheduledTaskTool(ctx, userId),
  }
}
