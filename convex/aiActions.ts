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
  'You are a helpful personal assistant. You are friendly, concise, and action-oriented.'
const MEMORY_INSTRUCTIONS = `
## Memory

### Core Memory (always visible in <core_memory>)
Persistent facts about the user — name, timezone, job, location, preferences.

### Recent Facts (visible in <facts>)
Short useful facts extracted from prior conversations.

## Available tools
- Manage memory: save/search/delete core and archival memory.
- Manage tasks: create/list/update/delete scheduled tasks. You can set a specific start time for tasks using ISO 8601 datetimes. Convert user phrases like "tomorrow at 9am" or "next Monday" to ISO timestamps based on the current date/time.
- Manage research: start and cancel background research jobs.
- Gmail: check inbox, send emails, archive/delete emails.
- Google Calendar: check schedule, schedule calls/meetings, remove events.
- Todoist: check todos, add/complete/remove tasks.
- Notion: create pages, update pages, search workspace.
- Telegram: send messages to the user via their linked Telegram.
- Web search: search the internet for up-to-date information.
Use tools directly when they help answer or execute the user's request.
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
  let prompt = basePrompt + `\n\nCurrent date/time: ${new Date().toISOString()}`
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
      'Create a scheduled task that runs at a specific time. For one_off: set runAtIso to when it should execute (required). For recurring: set intervalMinutes for repeat cadence and optionally runAtIso for the first execution time (e.g. "start tomorrow at 9am, repeat every 60 minutes"). Always convert user-specified times to ISO 8601 using the current date/time from the system prompt.',
    inputSchema: z.object({
      prompt: z.string().min(1).describe('What the task should do'),
      type: z.enum(['one_off', 'recurring']),
      runAtIso: z
        .string()
        .optional()
        .describe(
          'ISO 8601 datetime for when to run, e.g. "2026-03-05T09:00:00Z". Required for one_off. Optional for recurring (sets first run time).',
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
    description: 'List recent scheduled tasks.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(30).optional(),
    }),
    execute: async ({ limit }) => {
      const tasks = await ctx.runQuery(internal.aiTools.listScheduledTasks, {
        userId,
        limit,
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
