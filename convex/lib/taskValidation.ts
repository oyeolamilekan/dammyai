import { MIN_TASK_INTERVAL_MS, now } from './time'

export const TASK_WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

export type TaskWeekday = (typeof TASK_WEEKDAYS)[number]
export type TaskScheduleKind = 'interval' | 'weekday'

const TASK_WEEKDAY_INDEX: Record<TaskWeekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

type TaskScheduleArgs = {
  type: 'one_off' | 'recurring'
  intervalMs?: number
  runAt?: number
  weekdays?: Array<TaskWeekday>
  timeOfDay?: string
  scheduleTimezone?: string
}

type ZonedDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function getTaskScheduleKind(args: TaskScheduleArgs): TaskScheduleKind {
  if (args.weekdays?.length || args.timeOfDay || args.scheduleTimezone) {
    return 'weekday'
  }
  return 'interval'
}

export function normalizeTaskWeekdays(
  weekdays?: Array<TaskWeekday>,
): Array<TaskWeekday> {
  return [...new Set(weekdays ?? [])].sort(
    (left, right) => TASK_WEEKDAY_INDEX[left] - TASK_WEEKDAY_INDEX[right],
  )
}

function parseTimeOfDay(timeOfDay: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeOfDay)
  if (!match) {
    throw new Error('Weekday schedules require a valid time in HH:MM format')
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  }
}

function assertValidTimezone(timeZone: string) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
  } catch {
    throw new Error('Weekday schedules require a valid timezone')
  }
}

function getFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
}

function getZonedDateParts(timestamp: number, timeZone: string): ZonedDateParts {
  const parts = getFormatter(timeZone).formatToParts(new Date(timestamp))
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

function getTimeZoneOffsetMs(timestamp: number, timeZone: string) {
  const parts = getZonedDateParts(timestamp, timeZone)
  const timestampWithoutMs = Math.floor(timestamp / 1000) * 1000
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - timestampWithoutMs
  )
}

function addDays(
  year: number,
  month: number,
  day: number,
  dayOffset: number,
) {
  const date = new Date(Date.UTC(year, month - 1, day + dayOffset))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function zonedDateTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const localTimestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  let guess = localTimestamp

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offsetMs = getTimeZoneOffsetMs(guess, timeZone)
    const nextGuess = localTimestamp - offsetMs
    if (nextGuess === guess) {
      break
    }
    guess = nextGuess
  }

  return guess
}

function computeNextWeekdayRun(
  weekdays: Array<TaskWeekday>,
  timeOfDay: string,
  timeZone: string,
  referenceMs: number,
  inclusive: boolean,
) {
  const { hour, minute } = parseTimeOfDay(timeOfDay)
  const zonedReference = getZonedDateParts(referenceMs, timeZone)

  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const candidateDate = addDays(
      zonedReference.year,
      zonedReference.month,
      zonedReference.day,
      dayOffset,
    )
    const candidateWeekday =
      TASK_WEEKDAYS[
        new Date(
          Date.UTC(candidateDate.year, candidateDate.month - 1, candidateDate.day),
        ).getUTCDay()
      ]

    if (!weekdays.includes(candidateWeekday)) {
      continue
    }

    const candidateMs = zonedDateTimeToUtcMs(
      candidateDate.year,
      candidateDate.month,
      candidateDate.day,
      hour,
      minute,
      timeZone,
    )

    if (inclusive ? candidateMs >= referenceMs : candidateMs > referenceMs) {
      return candidateMs
    }
  }

  throw new Error('Unable to compute the next weekday run time')
}

/**
 * Validates scheduled-task creation args shared between the public mutation
 * (tasks.ts) and the internal AI-tool mutation (aiTools.ts).
 *
 * Throws an Error with a user-facing message on any validation failure.
 */
export function validateTaskArgs(args: TaskScheduleArgs) {
  if (args.type === 'recurring') {
    const scheduleKind = getTaskScheduleKind(args)

    if (scheduleKind === 'interval') {
      if (!args.intervalMs) {
        throw new Error('Interval is required for recurring tasks')
      }
      if (args.intervalMs < MIN_TASK_INTERVAL_MS) {
        throw new Error('Interval must be at least 1 minute')
      }
      if (args.weekdays?.length || args.timeOfDay || args.scheduleTimezone) {
        throw new Error(
          'Interval-based recurring tasks cannot include weekday schedule fields',
        )
      }
    } else {
      const weekdays = normalizeTaskWeekdays(args.weekdays)
      if (weekdays.length === 0) {
        throw new Error('Choose at least one weekday for weekday schedules')
      }
      if (!args.timeOfDay) {
        throw new Error('Weekday schedules require a time of day')
      }
      if (!args.scheduleTimezone?.trim()) {
      throw new Error('Weekday schedules require a timezone')
      }
      parseTimeOfDay(args.timeOfDay)
      assertValidTimezone(args.scheduleTimezone)
      if (args.intervalMs !== undefined) {
        throw new Error(
          'Weekday-based recurring tasks cannot include an interval',
        )
      }
    }
  }

  if (args.type === 'one_off') {
    if (args.weekdays?.length || args.timeOfDay || args.scheduleTimezone) {
      throw new Error(
        'One-off tasks cannot include weekday recurrence settings',
      )
    }
    if (!args.runAt) {
      throw new Error('Run time is required for one-off tasks')
    }
    if (args.runAt <= now()) {
      throw new Error('Run time must be in the future')
    }
  }
}

/**
 * Computes the first `nextRunAt` timestamp for a new scheduled task.
 * - One-off: use the provided `runAt`
 * - Recurring: use `runAt` if it's in the future, otherwise `now + intervalMs`
 */
export function computeFirstRunAt(args: TaskScheduleArgs): number {
  const timestamp = now()
  if (args.type === 'one_off') {
    return args.runAt!
  }

  const scheduleKind = getTaskScheduleKind(args)
  if (scheduleKind === 'weekday') {
    return computeNextWeekdayRun(
      normalizeTaskWeekdays(args.weekdays),
      args.timeOfDay!,
      args.scheduleTimezone!,
      Math.max(timestamp, args.runAt ?? timestamp),
      true,
    )
  }

  return args.runAt && args.runAt > timestamp
    ? args.runAt
    : timestamp + (args.intervalMs ?? 0)
}

/**
 * Computes the next `nextRunAt` timestamp after a recurring task has executed.
 * Returns `undefined` for one-off tasks.
 */
export function computeNextRunAt(
  args: TaskScheduleArgs,
  referenceMs: number,
): number | undefined {
  if (args.type !== 'recurring') {
    return undefined
  }

  const scheduleKind = getTaskScheduleKind(args)
  if (scheduleKind === 'weekday') {
    return computeNextWeekdayRun(
      normalizeTaskWeekdays(args.weekdays),
      args.timeOfDay!,
      args.scheduleTimezone!,
      referenceMs,
      false,
    )
  }

  return args.intervalMs ? referenceMs + args.intervalMs : undefined
}
