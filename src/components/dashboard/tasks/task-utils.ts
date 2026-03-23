export const TASK_INTERVAL_UNITS = [
  { label: 'Minutes', ms: 60_000 },
  { label: 'Hours', ms: 3_600_000 },
  { label: 'Days', ms: 86_400_000 },
] as const

export type ScheduledTaskType = 'one_off' | 'recurring'
export type TaskScheduleKind = 'interval' | 'weekday'
export type TaskWeekday =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
export type TaskExecutionStatus = 'completed' | 'failed' | 'running'

export const TASK_WEEKDAY_OPTIONS: Array<{
  value: TaskWeekday
  label: string
  shortLabel: string
}> = [
  { value: 'monday', label: 'Monday', shortLabel: 'Mon' },
  { value: 'tuesday', label: 'Tuesday', shortLabel: 'Tue' },
  { value: 'wednesday', label: 'Wednesday', shortLabel: 'Wed' },
  { value: 'thursday', label: 'Thursday', shortLabel: 'Thu' },
  { value: 'friday', label: 'Friday', shortLabel: 'Fri' },
  { value: 'saturday', label: 'Saturday', shortLabel: 'Sat' },
  { value: 'sunday', label: 'Sunday', shortLabel: 'Sun' },
]

export type ScheduledTaskListItem = {
  id: string
  prompt: string
  type: ScheduledTaskType
  scheduleKind: TaskScheduleKind | null
  intervalMs: number | null
  weekdays: Array<TaskWeekday>
  timeOfDay: string | null
  scheduleTimezone: string | null
  runAt: string | null
  nextRunAt: string | null
  lastRunAt: string | null
  lastResult: string | null
  lastLogId: string | null
  enabled: boolean
  createdAt: string
}

export type TaskExecutionLogSummary = {
  id: string
  startedAt: string
  completedAt: string | null
  status: TaskExecutionStatus
  stepCount: number
  toolsUsed: Array<string>
  result: string | null
  error: string | null
}

export type TaskExecutionLogDetail = {
  id: string
  taskId: string
  startedAt: string
  completedAt: string | null
  status: TaskExecutionStatus
  result: string | null
  error: string | null
  steps: Array<{
    stepIndex: number
    toolName: string
    toolCallId: string
    input: string
    output: string
    timestamp: string
  }>
}

export const TASK_LOG_STATUS_CLASS_NAMES: Record<TaskExecutionStatus, string> = {
  completed: 'bg-green-500/15 text-green-700 dark:text-green-400',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-400',
  running: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
}

export function formatTaskInterval(intervalMs: number) {
  if (intervalMs >= 86_400_000 && intervalMs % 86_400_000 === 0) {
    return `${intervalMs / 86_400_000}d`
  }
  if (intervalMs >= 3_600_000 && intervalMs % 3_600_000 === 0) {
    return `${intervalMs / 3_600_000}h`
  }
  return `${intervalMs / 60_000}m`
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

export function formatTaskTimeOfDay(timeOfDay: string) {
  const [hour, minute] = timeOfDay.split(':').map(Number)
  return new Date(Date.UTC(1970, 0, 1, hour, minute)).toLocaleTimeString(
    'en-US',
    {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    },
  )
}

export function formatTaskWeekdays(weekdays: Array<TaskWeekday>) {
  return joinWithAnd(
    TASK_WEEKDAY_OPTIONS.filter((option) => weekdays.includes(option.value)).map(
      (option) => option.label,
    ),
  )
}

export function formatTaskSchedule(task: ScheduledTaskListItem) {
  if (
    task.type === 'recurring' &&
    task.scheduleKind === 'weekday' &&
    task.weekdays.length > 0 &&
    task.timeOfDay
  ) {
    return `every ${formatTaskWeekdays(task.weekdays)} at ${formatTaskTimeOfDay(task.timeOfDay)}`
  }

  if (task.type === 'recurring' && task.intervalMs) {
    return `every ${formatTaskInterval(task.intervalMs)}`
  }

  return task.type
}
