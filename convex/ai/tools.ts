import { tool } from 'ai'
import { z } from 'zod'
import { internal } from '../_generated/api'
import {
  createCheckMailTool,
  createManageMailTool,
  createSendMailTool,
} from '../tools/gmail'
import {
  createCheckScheduleTool,
  createRemoveEventTool,
  createScheduleCallTool,
} from '../tools/googleCalendar'
import {
  createNotionDocumentTool,
  createSearchNotionTool,
  createUpdateNotionDocumentTool,
} from '../tools/notion'
import { createTavilySearchTool } from '../tools/tavily'
import { createSendTelegramMessageTool } from '../tools/telegram'
import { createCheckTodosTool, createUpdateTodoTool } from '../tools/todoist'
import { createWebSearchTool } from '../tools/exa'
import type { AILikeCtx } from './types'

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

/**
 * Purpose: Builds the AI SDK tool set for a specific user, wiring shared memory/task/research helpers together with provider integrations.
 * Function type: helper factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 * - searchProvider: string | undefined
 */
export const createAgentTools = (
  ctx: AILikeCtx,
  userId: string,
  searchProvider?: string,
) => {
  // Guard: only allow one background research per AI invocation
  let researchFired = false

  return {
  saveCoreMemory: tool({
    description:
      'Save a short, persistent fact about the user. USE when the user shares personal info like their name, timezone, job title, language, communication preferences, or bot nickname. Each key-value pair persists across all conversations. NOT for long notes — use saveArchivalMemory instead.',
    inputSchema: z.object({
      key: z
        .string()
        .min(1)
        .max(50)
        .describe('Fact label in lowercase, e.g. "timezone", "name", "job", "bot_name", "preferred_language"'),
      value: z.string().min(1).max(200).describe('The value to store. Keep concise — one fact per key.'),
    }),
    execute: async ({ key, value }) =>
      await ctx.runMutation(internal.aiTools.saveCoreMemory, {
        userId,
        key,
        value,
      }),
  }),
  deleteCoreMemory: tool({
    description: 'Delete a core memory entry by its key. USE when the user says "forget my X" or corrects a previously saved fact that should be removed entirely rather than updated.',
    inputSchema: z.object({
      key: z.string().min(1).max(50).describe('The key of the core memory to delete, e.g. "timezone", "name"'),
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
    description:
      'Save a longer note or detailed context to archival memory. USE for meeting notes, project briefs, multi-step instructions, research findings, or anything longer than a single fact. NOT for short facts (use saveCoreMemory) or shareable documents (use createNotionDocument).',
    inputSchema: z.object({
      content: z.string().min(1).max(2000).describe('The full text to archive. Can be multiple paragraphs.'),
      tags: z
        .string()
        .optional()
        .describe('Comma-separated tags for later search, e.g. "project,meeting,q1-planning"'),
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
    description:
      'Search archival memories by keyword or tags. USE when the user references past notes ("what did I say about…"), asks about a previous project, or when you need context from earlier conversations.',
    inputSchema: z.object({
      query: z.string().min(1).describe('Keyword or phrase to search for in archived notes'),
      limit: z.number().int().min(1).max(20).optional().describe('Max results to return (default 10)'),
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
    description: 'Delete an archival memory by its ID. The ID comes from searchArchivalMemory results (the value in square brackets).',
    inputSchema: z.object({
      id: z.string().min(1).describe('Archival memory ID from a previous searchArchivalMemory result, e.g. the value shown in [brackets]'),
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
      'Create a time-triggered task or reminder. USE when the user says "remind me to…", "at 3pm do…", "every morning send me…", or any request that should execute at a specific future time. For one_off: runAtIso is required. For recurring: intervalMinutes is required, runAtIso is optional (defaults to now + interval). NOT for Todoist tasks (use updateTodo) or calendar events (use scheduleCall).',
    inputSchema: z.object({
      prompt: z.string().min(1).describe(
        'The exact command to execute when this task fires. Write as a direct imperative — e.g. "Search BTC, SOL, ETH prices and top 3 crypto headlines, then send the result via Telegram" or "Check my inbox for unread emails and summarise them". ' +
        'IMPORTANT: Do NOT include scheduling language ("daily", "each morning", "every day", "at 07:00", "remind me") — those are already captured by runAtIso/intervalMinutes. ' +
        'The prompt is replayed verbatim at execution time, so it must read as an immediate "do this right now" instruction.',
      ),
      type: z.enum(['one_off', 'recurring']).describe('"one_off" for a single future execution, "recurring" for repeated execution at a fixed interval'),
      runAtIso: z
        .string()
        .optional()
        .describe(
          'UTC ISO 8601 datetime for when to run, e.g. "2026-03-05T08:00:00Z". Convert from user timezone to UTC using their timezone in core memory. Required for one_off.',
        ),
      intervalMinutes: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          'Repeat interval in minutes. Required for recurring. Common values: 60 = hourly, 1440 = daily, 10080 = weekly.',
        ),
    }),
    execute: async ({ prompt, type, runAtIso, intervalMinutes }) => {
      const runAt = parseRunAtIso(runAtIso)
      const intervalMs = intervalMinutes ? intervalMinutes * 60_000 : undefined
      await ctx.runMutation(internal.aiTools.createScheduledTask, {
        userId,
        prompt,
        type,
        runAt,
        intervalMs,
      })
      const scheduledFor = runAtIso
        ? new Date(runAtIso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
        : undefined
      const repeatInfo = intervalMinutes
        ? intervalMinutes >= 1440
          ? `every ${Math.round(intervalMinutes / 1440)} day(s)`
          : intervalMinutes >= 60
            ? `every ${Math.round(intervalMinutes / 60)} hour(s)`
            : `every ${intervalMinutes} minute(s)`
        : undefined
      return JSON.stringify({
        status: 'created',
        taskType: type,
        description: prompt,
        ...(scheduledFor && { scheduledFor }),
        ...(repeatInfo && { repeats: repeatInfo }),
      })
    },
  }),
  listScheduledTasks: tool({
    description:
      'List the user\'s scheduled tasks and reminders created via createScheduledTask. USE when the user asks "show my reminders", "what tasks are scheduled?", or "list my scheduled stuff". NOT for Todoist tasks (use checkTodos) or calendar events (use checkSchedule).',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(30).optional().describe('Max tasks to return (default 20)'),
      type: z
        .enum(['one_off', 'recurring'])
        .optional()
        .describe('Filter by task type: "one_off" for one-time reminders, "recurring" for repeating tasks. Omit for all.'),
    }),
    execute: async ({ limit, type }) => {
      const tasks = await ctx.runQuery(internal.aiTools.listScheduledTasks, {
        userId,
        limit,
        type,
      })
      if (tasks.length === 0) {
        return JSON.stringify({ status: 'empty', tasks: [] })
      }
      return JSON.stringify({
        status: 'ok',
        tasks: tasks.map((task) => ({
          id: task.id,
          description: task.prompt,
          type: task.type === 'recurring' ? 'recurring' : 'one_off',
          active: task.enabled,
        })),
      })
    },
  }),
  updateScheduledTask: tool({
    description: 'Update a scheduled task\'s description or enabled/disabled state. Get the task ID from listScheduledTasks first. USE to pause, resume, or edit an existing scheduled task.',
    inputSchema: z.object({
      id: z.string().min(1).describe('Task ID from listScheduledTasks results'),
      prompt: z.string().optional().describe('New task description. Omit to keep unchanged.'),
      enabled: z.boolean().optional().describe('Set true to enable (resume) or false to disable (pause) the task'),
    }),
    execute: async ({ id, prompt, enabled }) => {
      await ctx.runMutation(internal.aiTools.updateScheduledTask, {
        userId,
        id,
        prompt,
        enabled,
      })
      const changes: Record<string, unknown> = { status: 'updated' }
      if (prompt !== undefined) changes.newDescription = prompt
      if (enabled !== undefined) changes.active = enabled
      return JSON.stringify(changes)
    },
  }),
  deleteScheduledTask: tool({
    description: 'Permanently delete a scheduled task. Get the task ID from listScheduledTasks first. USE when the user wants to remove a reminder or recurring task entirely.',
    inputSchema: z.object({
      id: z.string().min(1).describe('Task ID from listScheduledTasks results'),
    }),
    execute: async ({ id }) =>
      (await ctx.runMutation(internal.aiTools.deleteScheduledTask, {
        userId,
        id,
      }))
        ? JSON.stringify({ status: 'deleted' })
        : JSON.stringify({ status: 'not_found' }),
  }),
  startBackgroundResearch: tool({
    description:
      'Start a deep background research job that runs asynchronously and delivers a comprehensive report. USE for complex questions needing multi-source analysis: market research, technical deep-dives, competitive analysis, "tell me everything about X", or any topic requiring 30+ minutes of human research. Results are delivered when ready (usually via Telegram). NOT for quick factual lookups (use webSearch instead).',
    inputSchema: z.object({
      prompt: z.string().min(1).describe('A detailed research question or brief. Be specific about what to investigate and what angles to cover.'),
    }),
    execute: async ({ prompt }) => {
      if (researchFired) {
        return 'Research already started — no need to start another one.'
      }
      researchFired = true
      await ctx.runMutation(
        internal.aiTools.startBackgroundResearch,
        {
          userId,
          prompt,
        },
      )
      return `Research kicked off — I'll dig into "${prompt}" and deliver the results when ready.`
    },
  }),
  cancelBackgroundResearch: tool({
    description:
      'Cancel an active background research job. If no ID is provided, cancels the most recent active job.',
    inputSchema: z.object({
      id: z.string().optional().describe('Research job ID to cancel. Omit to cancel the most recent active job.'),
    }),
    execute: async ({ id }) =>
      (await ctx.runMutation(internal.aiTools.cancelBackgroundResearch, {
        userId,
        id,
      }))
        ? 'Done — research canceled.'
        : 'No active research to cancel — it may have already finished.',
  }),
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
  }
}
