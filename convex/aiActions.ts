import { generateText, stepCountIs, tool } from 'ai'
import { v } from 'convex/values'
import { z } from 'zod'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import {
  createCheckMailTool,
  createManageMailTool,
  createSendMailTool,
} from './tools/gmail'
import {
  createCheckScheduleTool,
  createRemoveEventTool,
  createScheduleCallTool,
} from './tools/googleCalendar'
import { createCheckTodosTool, createUpdateTodoTool } from './tools/todoist'
import {
  createNotionDocumentTool,
  createSearchNotionTool,
  createUpdateNotionDocumentTool,
} from './tools/notion'
import { createSendTelegramMessageTool } from './tools/telegram'
import { createWebSearchTool } from './tools/exa'
import { createTavilySearchTool } from './tools/tavily'
import type { ActionCtx } from './_generated/server'

const DEFAULT_MODEL = 'openai/gpt-4o-mini'
const DEFAULT_MEMORY_MODEL = 'openai/gpt-4o-mini'
const DEFAULT_SYSTEM_PROMPT =
  'You are an intelligent personal assistant. Be direct, concise, and action-oriented. Think before acting — pick the right tool for the job. If a task is ambiguous, ask one clarifying question, not five.'
const MEMORY_INSTRUCTIONS = `
## Memory
Core memory (<core_memory>): persistent user facts — name, timezone, job, preferences.
Recent facts (<facts>): short facts from prior conversations.
Use memory tools to save/search/delete core and archival memory. Pull relevant context when the user references past sessions.
If the user's timezone is not in core memory, ask for it and save it (key: "timezone", value: IANA timezone e.g. "Africa/Lagos").

## Tools
Use tools directly when they help. Don't use a tool if you already know the answer.

- **Memory**: save, search, delete core and archival memory.
- **Tasks**: create/list/update/delete scheduled tasks. Always convert user times from their timezone to UTC for runAtIso.
- **Research**: start/cancel background research jobs.
- **Gmail**: check inbox, send/draft emails, archive/delete. Always show draft and confirm before sending.
- **Calendar**: check schedule, create/remove events. Confirm details (title, time, duration) before creating.
- **Todoist**: check todos, add/complete/remove tasks.
- **Notion**: create/update pages, search workspace.
- **Telegram**: send messages to user's linked Telegram.
- **Web search**: search for current info, news, live data. Cite sources. Summarize in your own words.
`.trim()

type AILikeCtx = Pick<ActionCtx, 'runQuery' | 'runMutation'>

type AIPromptArgs = {
  userId: string
  prompt: string
  systemPrompt?: string
  modelPreference?: string
}

type ExtractedFact = {
  content: string
  category?: string
}

const getEnv = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {}

const normalizeGatewayModelId = (modelPreference?: string) => {
  const raw =
    modelPreference?.trim() ||
    getEnv().AI_GATEWAY_MODEL ||
    getEnv().OPENAI_MODEL ||
    DEFAULT_MODEL
  return raw.includes('/') ? raw : `openai/${raw}`
}

const normalizeMemoryModelId = () => {
  const env = getEnv()
  const raw =
    env.AI_GATEWAY_MEMORY_MODEL ||
    env.OPENAI_MEMORY_MODEL ||
    DEFAULT_MEMORY_MODEL
  return raw.includes('/') ? raw : `openai/${raw}`
}

const buildSystemPrompt = (
  basePrompt: string,
  coreMemories: Array<{ key: string; value: string }>,
  facts: Array<{ content: string; category?: string }>,
) => {
  // Use user's timezone from core memory if available
  const tzEntry = coreMemories.find(
    (m) => m.key.toLowerCase() === 'timezone',
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
      .map((m) => `- ${m.key}: ${m.value}`)
      .join('\n')
    prompt += `\n\n<core_memory>\n${coreBlock}\n</core_memory>`
  }
  if (facts.length > 0) {
    const factsBlock = facts
      .map((m) => `- ${m.content}${m.category ? ` [${m.category}]` : ''}`)
      .join('\n')
    prompt += `\n\n<facts>\n${factsBlock}\n</facts>`
  }
  return prompt
}

const parseExtractedFacts = (text: string): Array<ExtractedFact> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  const facts: Array<ExtractedFact> = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const row = item as { content?: unknown; category?: unknown }
    if (typeof row.content !== 'string') continue
    facts.push({
      content: row.content,
      category: typeof row.category === 'string' ? row.category : undefined,
    })
  }
  return facts
}

const extractAndSaveMemories = async (
  ctx: AILikeCtx,
  args: { userId: string; userMessage: string; assistantMessage: string },
) => {
  const memories: Array<{ content: string }> = await ctx.runQuery(
    internal.aiStore.getUserMemories,
    {
      userId: args.userId,
      limit: 50,
    },
  )
  const knownFacts = memories.map((memory) => memory.content)

  const { text } = await generateText({
    model: normalizeMemoryModelId(),
    system: [
      'You extract important, long-lasting facts about the user from conversations.',
      'Return a JSON array of objects with {content, category} fields.',
      'Only extract NEW facts not already in the known facts list.',
      'Categories: preference, contact, schedule, personal, work.',
      'If there are no new facts worth remembering, return an empty array [].',
      'Only return the JSON array, nothing else.',
    ].join(' '),
    prompt: `Known facts:\n${JSON.stringify(knownFacts)}\n\nUser: ${args.userMessage}\nAssistant: ${args.assistantMessage}`,
  })

  const facts = parseExtractedFacts(text)
  if (facts.length === 0) {
    return 0
  }
  return await ctx.runMutation(internal.aiStore.saveExtractedMemories, {
    userId: args.userId,
    facts,
  })
}

const formatToolOutput = (value: unknown) => {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const createAgentTools = (
  ctx: AILikeCtx,
  userId: string,
  searchProvider?: string,
) => ({
  saveCoreMemory: tool({
    description: 'Save or update a core memory key/value pair.',
    inputSchema: z.object({
      key: z.string().min(1).max(50),
      value: z.string().min(1).max(200),
    }),
    execute: async ({ key, value }) =>
      await ctx.runMutation(internal.aiTools.saveCoreMemory, {
        userId,
        key,
        value,
      }),
  }),
  deleteCoreMemory: tool({
    description: 'Delete a core memory by key.',
    inputSchema: z.object({
      key: z.string().min(1).max(50),
    }),
    execute: async ({ key }) =>
      (await ctx.runMutation(internal.aiTools.deleteCoreMemory, {
        userId,
        key,
      }))
        ? 'Deleted core memory.'
        : 'Core memory not found.',
  }),
  saveArchivalMemory: tool({
    description: 'Save archival memory content with optional tags.',
    inputSchema: z.object({
      content: z.string().min(1).max(2000),
      tags: z.string().optional(),
    }),
    execute: async ({ content, tags }) => {
      const id = await ctx.runMutation(internal.aiTools.saveArchivalMemory, {
        userId,
        content,
        tags,
      })
      return `Saved archival memory (${id}).`
    },
  }),
  searchArchivalMemory: tool({
    description: 'Search archival memories by content or tags.',
    inputSchema: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async ({ query, limit }) => {
      const results = await ctx.runQuery(
        internal.aiTools.searchArchivalMemories,
        {
          userId,
          query,
          limit,
        },
      )
      if (results.length === 0) {
        return 'No archival entries found.'
      }
      return results.map((row) => `[${row.id}] ${row.content}`).join('\n\n')
    },
  }),
  deleteArchivalMemory: tool({
    description: 'Delete an archival memory by id.',
    inputSchema: z.object({
      id: z.string().min(1),
    }),
    execute: async ({ id }) =>
      (await ctx.runMutation(internal.aiTools.deleteArchivalMemory, {
        userId,
        id,
      }))
        ? 'Deleted archival memory.'
        : 'Archival memory not found.',
  }),
  createScheduledTask: tool({
    description:
      'Create a scheduled task. For one_off: set runAtIso (required). For recurring: set intervalMinutes and optionally runAtIso for first run. Convert user times from their timezone to UTC ISO 8601 (e.g. if user is Africa/Lagos UTC+1 and says "9am", that is "08:00:00Z").',
    inputSchema: z.object({
      prompt: z.string().min(1).describe('What the task should do'),
      type: z.enum(['one_off', 'recurring']),
      runAtIso: z
        .string()
        .optional()
        .describe(
          'UTC ISO 8601 datetime, e.g. "2026-03-05T08:00:00Z". Convert from user timezone to UTC. Required for one_off.',
        ),
      intervalMinutes: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          'Repeat interval in minutes. Required for recurring. E.g. 60 = hourly, 1440 = daily, 10080 = weekly.',
        ),
    }),
    execute: async ({ prompt, type, runAtIso, intervalMinutes }) => {
      const runAt = runAtIso ? new Date(runAtIso).getTime() : undefined
      if (runAtIso && Number.isNaN(runAt)) {
        throw new Error('Invalid runAtIso datetime')
      }
      const intervalMs = intervalMinutes ? intervalMinutes * 60_000 : undefined
      const id = await ctx.runMutation(internal.aiTools.createScheduledTask, {
        userId,
        prompt,
        type,
        runAt,
        intervalMs,
      })
      return `Created scheduled task (${id}).`
    },
  }),
  listScheduledTasks: tool({
    description:
      'List scheduled tasks. Optionally filter by type (one_off or recurring).',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(30).optional(),
      type: z
        .enum(['one_off', 'recurring'])
        .optional()
        .describe('Filter by task type.'),
    }),
    execute: async ({ limit, type }) => {
      const tasks = await ctx.runQuery(internal.aiTools.listScheduledTasks, {
        userId,
        limit,
        type,
      })
      if (tasks.length === 0) {
        return 'No scheduled tasks found.'
      }
      return tasks
        .map(
          (task) =>
            `[${task.id}] ${task.prompt} (${task.type}, enabled=${task.enabled})`,
        )
        .join('\n')
    },
  }),
  updateScheduledTask: tool({
    description: 'Update a scheduled task prompt or enabled flag.',
    inputSchema: z.object({
      id: z.string().min(1),
      prompt: z.string().optional(),
      enabled: z.boolean().optional(),
    }),
    execute: async ({ id, prompt, enabled }) => {
      await ctx.runMutation(internal.aiTools.updateScheduledTask, {
        userId,
        id,
        prompt,
        enabled,
      })
      return 'Scheduled task updated.'
    },
  }),
  deleteScheduledTask: tool({
    description: 'Delete a scheduled task by id.',
    inputSchema: z.object({
      id: z.string().min(1),
    }),
    execute: async ({ id }) =>
      (await ctx.runMutation(internal.aiTools.deleteScheduledTask, {
        userId,
        id,
      }))
        ? 'Scheduled task deleted.'
        : 'Scheduled task not found.',
  }),
  startBackgroundResearch: tool({
    description: 'Create and queue a background research job.',
    inputSchema: z.object({
      prompt: z.string().min(1),
    }),
    execute: async ({ prompt }) => {
      const id = await ctx.runMutation(
        internal.aiTools.startBackgroundResearch,
        {
          userId,
          prompt,
        },
      )
      return `Started background research (${id}).`
    },
  }),
  cancelBackgroundResearch: tool({
    description:
      'Cancel a background research job by id, or cancel the most recent active job.',
    inputSchema: z.object({
      id: z.string().optional(),
    }),
    execute: async ({ id }) =>
      (await ctx.runMutation(internal.aiTools.cancelBackgroundResearch, {
        userId,
        id,
      }))
        ? 'Background research canceled.'
        : 'No active background research job found.',
  }),
  // Integration tools
  checkMail: createCheckMailTool(ctx, userId),
  sendMail: createSendMailTool(ctx, userId),
  manageMail: createManageMailTool(ctx, userId),
  checkSchedule: createCheckScheduleTool(ctx, userId),
  scheduleCall: createScheduleCallTool(ctx, userId),
  removeEvent: createRemoveEventTool(ctx, userId),
  checkTodos: createCheckTodosTool(ctx, userId),
  updateTodo: createUpdateTodoTool(ctx, userId),
  createNotionDocument: createNotionDocumentTool(ctx, userId),
  updateNotionDocument: createUpdateNotionDocumentTool(ctx, userId),
  searchNotion: createSearchNotionTool(ctx, userId),
  sendTelegramMessage: createSendTelegramMessageTool(ctx, userId),
  webSearch:
    searchProvider === 'tavily'
      ? createTavilySearchTool()
      : createWebSearchTool(),
})

export const generateAssistantReplyImpl = async (args: {
  prompt: string
  systemPrompt?: string
  modelPreference?: string
}) => {
  const env = getEnv()
  if (!env.AI_GATEWAY_API_KEY) {
    throw new Error('Missing AI_GATEWAY_API_KEY')
  }
  const { text } = await generateText({
    model: normalizeGatewayModelId(args.modelPreference),
    system: args.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT,
    prompt: args.prompt.trim(),
  })
  return text.trim()
}

export const executeAIPromptImpl = async (
  ctx: AILikeCtx,
  args: AIPromptArgs,
): Promise<string> => {
  const env = getEnv()
  if (!env.AI_GATEWAY_API_KEY) {
    throw new Error('Missing AI_GATEWAY_API_KEY')
  }

  const userPrompt = args.prompt.trim()
  if (!userPrompt) {
    throw new Error('Prompt is required')
  }

  const [soul, history, facts, coreMemories] = await Promise.all([
    ctx.runQuery(internal.aiStore.getSoulByUserId, { userId: args.userId }),
    ctx.runQuery(internal.aiStore.getConversationHistory, {
      userId: args.userId,
      limit: 50,
    }),
    ctx.runQuery(internal.aiStore.getUserMemories, {
      userId: args.userId,
      limit: 20,
    }),
    ctx.runQuery(internal.aiStore.getCoreMemories, { userId: args.userId }),
  ])

  const modelPreference = args.modelPreference?.trim() || soul?.modelPreference
  const modelId = normalizeGatewayModelId(modelPreference)
  const searchProvider = soul?.searchProvider
  const basePrompt =
    args.systemPrompt?.trim() || soul?.systemPrompt || DEFAULT_SYSTEM_PROMPT
  const systemPrompt = buildSystemPrompt(
    `${basePrompt}\n\n${MEMORY_INSTRUCTIONS}`,
    coreMemories,
    facts,
  )

  await ctx.runMutation(internal.aiStore.saveMessage, {
    userId: args.userId,
    role: 'user',
    content: userPrompt,
  })

  const result = await generateText({
    model: modelId,
    system: systemPrompt,
    messages: [...history, { role: 'user', content: userPrompt }],
    tools: createAgentTools(ctx, args.userId, searchProvider),
    stopWhen: stepCountIs(8),
    onStepFinish: async ({
      toolResults,
    }: {
      toolResults?: Array<{
        toolCallId?: string
        toolName?: string
        output?: unknown
      }>
    }) => {
      if (!toolResults || toolResults.length === 0) {
        return
      }
      for (const row of toolResults) {
        const toolName = row.toolName ?? 'tool'
        const content = formatToolOutput(row.output).slice(0, 4000)
        await ctx.runMutation(internal.aiStore.saveMessage, {
          userId: args.userId,
          role: 'tool',
          content,
          toolName,
          toolCallId: row.toolCallId,
        })
      }
    },
  })
  const assistantMessage =
    result.text.trim() || "I couldn't generate a response."

  await ctx.runMutation(internal.aiStore.saveMessage, {
    userId: args.userId,
    role: 'assistant',
    content: assistantMessage,
  })

  try {
    await extractAndSaveMemories(ctx, {
      userId: args.userId,
      userMessage: userPrompt,
      assistantMessage,
    })
  } catch (error) {
    console.error('[AI] Memory extraction failed:', error)
  }

  return assistantMessage
}

export const executeAIPrompt = internalAction({
  args: {
    userId: v.string(),
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
    modelPreference: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    return await executeAIPromptImpl(ctx, args)
  },
})

export const generateAssistantReply = internalAction({
  args: {
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
    modelPreference: v.optional(v.string()),
  },
  handler: async (_ctx, args): Promise<string> => {
    return await generateAssistantReplyImpl(args)
  },
})
