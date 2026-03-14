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
) => ({
  saveCoreMemory: tool({
    description:
      'Save a persistent fact about the user (name, timezone, preferences). Use for info that should persist across all conversations.',
    inputSchema: z.object({
      key: z
        .string()
        .min(1)
        .max(50)
        .describe('Fact label, e.g. "timezone", "name", "job"'),
      value: z.string().min(1).max(200).describe('The value to store'),
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
    description:
      'Save a longer note or detailed info to archival memory. Use for meeting notes, project details, or anything too long for core memory.',
    inputSchema: z.object({
      content: z.string().min(1).max(2000),
      tags: z
        .string()
        .optional()
        .describe('Comma-separated tags for search, e.g. "project,meeting"'),
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
      'Search archival memories by keyword or tags. Use when the user references past notes, projects, or detailed context.',
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
      const runAt = parseRunAtIso(runAtIso)
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
    description:
      'Start a deep background research job. Use for complex questions needing extended web research. Results are delivered asynchronously.',
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
