import { MIN_TASK_INTERVAL_MS, now } from './time'

/**
 * Validates scheduled-task creation args shared between the public mutation
 * (tasks.ts) and the internal AI-tool mutation (aiTools.ts).
 *
 * Throws an Error with a user-facing message on any validation failure.
 */
export function validateTaskArgs(args: {
  type: 'one_off' | 'recurring'
  intervalMs?: number
  runAt?: number
}) {
  if (args.type === 'recurring') {
    if (!args.intervalMs) {
      throw new Error('Interval is required for recurring tasks')
    }
    if (args.intervalMs < MIN_TASK_INTERVAL_MS) {
      throw new Error('Interval must be at least 1 minute')
    }
  }
  if (args.type === 'one_off') {
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
export function computeFirstRunAt(args: {
  type: 'one_off' | 'recurring'
  intervalMs?: number
  runAt?: number
}): number {
  const timestamp = now()
  if (args.type === 'one_off') {
    return args.runAt!
  }
  return args.runAt && args.runAt > timestamp
    ? args.runAt
    : timestamp + (args.intervalMs ?? 0)
}
