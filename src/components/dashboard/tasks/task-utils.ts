export const TASK_INTERVAL_UNITS = [
  { label: 'Minutes', ms: 60_000 },
  { label: 'Hours', ms: 3_600_000 },
  { label: 'Days', ms: 86_400_000 },
] as const

export type ScheduledTaskType = 'one_off' | 'recurring'
export type TaskExecutionStatus = 'completed' | 'failed' | 'running'

export type ScheduledTaskListItem = {
  id: string
  prompt: string
  type: ScheduledTaskType
  intervalMs: number | null
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
