/**
 * Purpose: Converts arbitrary tool output into a string so it can be stored in message history and task logs.
 * Function type: helper
 * Args:
 * - value: unknown
 */
export const formatToolOutput = (value: unknown) => {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Purpose: Parses an optional UTC ISO datetime string into the millisecond timestamp expected by scheduled-task mutations.
 * Function type: helper
 * Args:
 * - runAtIso: string | undefined
 */
export const parseRunAtIso = (runAtIso?: string): number | undefined => {
  const value = runAtIso?.trim()
  if (!value) {
    return undefined
  }

  const parsed = new Date(value).getTime()
  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid runAtIso datetime')
  }

  return parsed
}
