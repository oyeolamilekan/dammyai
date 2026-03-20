const DEFAULT_MODEL = 'openai/gpt-4o-mini'
const DEFAULT_MEMORY_MODEL = 'openai/gpt-4o-mini'

// Re-export prompts so existing imports from './config' keep working
export { DEFAULT_SYSTEM_PROMPT, MEMORY_INSTRUCTIONS } from './prompts'

/**
 * Purpose: Reads environment variables from the current runtime without assuming a Node-only global shape.
 * Function type: helper
 * Args: none
 */
export const getEnv = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {}

/**
 * Purpose: Normalizes the primary assistant model ID into the provider/model format expected by the AI gateway.
 * Function type: helper
 * Args:
 * - modelPreference: string | undefined
 */
export const normalizeGatewayModelId = (modelPreference?: string) => {
  const raw =
    modelPreference?.trim() ||
    getEnv().AI_GATEWAY_MODEL ||
    getEnv().OPENAI_MODEL ||
    DEFAULT_MODEL
  return raw.includes('/') ? raw : `openai/${raw}`
}

/**
 * Purpose: Normalizes the memory-extraction model ID into the provider/model format expected by the AI gateway.
 * Function type: helper
 * Args: none
 */
export const normalizeMemoryModelId = () => {
  const env = getEnv()
  const raw =
    env.AI_GATEWAY_MEMORY_MODEL ||
    env.OPENAI_MEMORY_MODEL ||
    DEFAULT_MEMORY_MODEL
  return raw.includes('/') ? raw : `openai/${raw}`
}

/**
 * Purpose: Builds the final runtime system prompt by combining the base prompt, current time context, timezone guidance, and saved core memories.
 * Function type: helper
 * Args:
 * - basePrompt: string
 * - coreMemories: Array<{ key: string; value: string }>
 * - timezone: string (optional) — IANA timezone identifier (e.g. 'America/New_York')
 */
export const buildSystemPrompt = (
  basePrompt: string,
  coreMemories: Array<{ key: string; value: string }>,
  timezone?: string,
) => {
  const utcNow = new Date()
  let timeContext = `Current UTC time: ${utcNow.toISOString()}`

  if (timezone) {
    try {
      const localTime = utcNow.toLocaleString('en-US', { timeZone: timezone })
      timeContext += ` (User timezone: ${timezone}, local time: ${localTime})`
    } catch {
      // Invalid timezone — fall back to UTC only
    }
  }

  let prompt = basePrompt + `\n\n${timeContext}`

  if (coreMemories.length > 0) {
    const coreBlock = coreMemories
      .map((memory) => `- ${memory.key}: ${memory.value}`)
      .join('\n')
    prompt += `\n\n<core_memory>\n${coreBlock}\n</core_memory>`
  }

  return prompt
}
