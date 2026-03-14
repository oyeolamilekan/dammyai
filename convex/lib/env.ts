const getEnvRecord = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {}

/**
 * Purpose: Reads a required environment variable and throws immediately when it is missing.
 * Function type: helper
 * Args:
 * - key: string
 */
export function getRequiredEnv(key: string): string {
  const value = getEnvRecord()[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

/**
 * Purpose: Reads an optional environment variable and returns `undefined` when it is unset.
 * Function type: helper
 * Args:
 * - key: string
 */
export function getOptionalEnv(key: string): string | undefined {
  return getEnvRecord()[key] || undefined
}
