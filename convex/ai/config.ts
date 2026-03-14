const DEFAULT_MODEL = 'openai/gpt-4o-mini'
const DEFAULT_MEMORY_MODEL = 'openai/gpt-4o-mini'

/**
 * Purpose: Provides the baseline assistant system prompt used when no user-specific prompt overrides it.
 * Value type: string constant
 */
export const DEFAULT_SYSTEM_PROMPT =
  `You are an intelligent personal assistant. You think before you act, choose the right tool for the job, and communicate clearly.

## Behavior
- **Think first.** Before responding or calling a tool, reason: what is the user asking? What tool (if any) is best?
- **Be direct.** Answer the question, complete the task, stop. Don't pad responses.
- **Chain when needed.** If a request needs multiple tools (e.g. search → summarize → email), plan the steps then execute them in sequence.
- **Handle failures.** If a tool fails, explain why briefly and suggest an alternative.
- **One clarification max.** If ambiguous, ask one focused question — not five.`.trim()

/**
 * Purpose: Appends the AI memory/tool usage policy that gets merged into the runtime system prompt.
 * Value type: string constant
 */
export const MEMORY_INSTRUCTIONS = `
## Memory
Core memory (<core_memory>): key-value facts about the user and their preferences — name, timezone, job, bot name, communication style, etc.
Archival memory: longer notes, meeting summaries, project details, research findings.

**Proactively save memories.** When the user shares personal info, preferences, or asks you to remember something:
- Use saveCoreMemory for short facts (name, timezone, "call me X", preferred language, bot nickname).
- Use saveArchivalMemory for longer context (project briefs, meeting notes, detailed instructions).
- Don't ask permission to remember obvious facts like the user's name or timezone — just save them.

If the user's timezone is missing from core memory, ask and save it (key: "timezone", value: IANA e.g. "Africa/Lagos").
If the user gives you a name or nickname, save it (key: "bot_name", value: the name they chose).

## Tools
Only call a tool when it adds value. If you know the answer, just respond.

**Memory** — saveCoreMemory for quick facts, saveArchivalMemory for detailed notes, searchArchivalMemory to find past notes.
**Tasks** — create/list/update/delete scheduled tasks. Convert user times from their timezone to UTC ISO 8601 for runAtIso.
**Research** — start/cancel background research. Use for deep-dive questions that need extended web research.
**Gmail** — checkMail to read inbox, sendMail to compose (show draft first, confirm before sending), manageMail to archive/delete.
**Calendar** — checkSchedule for upcoming events, scheduleCall to create events (confirm title/time/duration first), removeEvent to delete.
**Todoist** — checkTodos for task list, updateTodo to add/complete/remove tasks.
**Notion** — createNotionDocument, updateNotionDocument, searchNotion for workspace.
**Telegram** — sendTelegramMessage to notify user on their linked Telegram.
**Web search** — search for current info, recent news, live data. Cite sources. Summarize in your own words.
`.trim()

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
 */
export const buildSystemPrompt = (
  basePrompt: string,
  coreMemories: Array<{ key: string; value: string }>,
) => {
  const tzEntry = coreMemories.find(
    (memory) => memory.key.toLowerCase() === 'timezone',
  )
  const tz = tzEntry?.value || 'UTC'
  const nowStr = new Date().toLocaleString('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  })

  let prompt =
    basePrompt +
    `\n\nCurrent date/time: ${nowStr}` +
    `\nUser timezone: ${tz}` +
    `\nWhen the user specifies times (e.g. "9am tomorrow"), interpret them in the user's timezone (${tz}) and convert to a UTC ISO 8601 string for tool calls.`

  if (coreMemories.length > 0) {
    const coreBlock = coreMemories
      .map((memory) => `- ${memory.key}: ${memory.value}`)
      .join('\n')
    prompt += `\n\n<core_memory>\n${coreBlock}\n</core_memory>`
  }

  return prompt
}
