import { tool } from 'ai'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import type { AILikeCtx } from '../types'

/**
 * Purpose: Creates the tool that saves a short persistent fact about the user.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createSaveCoreMemoryTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      'Save a short, persistent fact about the user. USE when the user shares personal info like their name, timezone, job title, language, communication preferences, or bot nickname. Each key-value pair persists across all conversations. NOT for long notes — use saveArchivalMemory instead.',
    inputSchema: z.object({
      key: z
        .string()
        .min(1)
        .max(50)
        .describe(
          'Fact label in lowercase, e.g. "timezone", "name", "job", "bot_name", "preferred_language"',
        ),
      value: z
        .string()
        .min(1)
        .max(200)
        .describe('The value to store. Keep concise — one fact per key.'),
    }),
    execute: async ({ key, value }) =>
      await ctx.runMutation(internal.aiTools.saveCoreMemory, {
        userId,
        key,
        value,
      }),
  })
}

/**
 * Purpose: Creates the tool that deletes a previously saved core memory by key.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createDeleteCoreMemoryTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      'Delete a core memory entry by its key. USE when the user says "forget my X" or corrects a previously saved fact that should be removed entirely rather than updated.',
    inputSchema: z.object({
      key: z
        .string()
        .min(1)
        .max(50)
        .describe(
          'The key of the core memory to delete, e.g. "timezone", "name"',
        ),
    }),
    execute: async ({ key }) =>
      (await ctx.runMutation(internal.aiTools.deleteCoreMemory, {
        userId,
        key,
      }))
        ? 'Deleted core memory.'
        : 'Core memory not found.',
  })
}

/**
 * Purpose: Creates the tool that saves longer notes to archival memory.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createSaveArchivalMemoryTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      'Save a longer note or detailed context to archival memory. USE for meeting notes, project briefs, multi-step instructions, research findings, or anything longer than a single fact. NOT for short facts (use saveCoreMemory) or shareable documents (use createNotionDocument).',
    inputSchema: z.object({
      content: z
        .string()
        .min(1)
        .max(2000)
        .describe('The full text to archive. Can be multiple paragraphs.'),
      tags: z
        .string()
        .optional()
        .describe(
          'Comma-separated tags for later search, e.g. "project,meeting,q1-planning"',
        ),
    }),
    execute: async ({ content, tags }) => {
      const id = await ctx.runMutation(internal.aiTools.saveArchivalMemory, {
        userId,
        content,
        tags,
      })
      return `Saved archival memory (${id}).`
    },
  })
}

/**
 * Purpose: Creates the tool that searches archival memories by keyword or tags.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createSearchArchivalMemoryTool(
  ctx: AILikeCtx,
  userId: string,
) {
  return tool({
    description:
      'Search archival memories by keyword or tags. USE when the user references past notes ("what did I say about…"), asks about a previous project, or when you need context from earlier conversations.',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe('Keyword or phrase to search for in archived notes'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Max results to return (default 10)'),
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
  })
}

/**
 * Purpose: Creates the tool that deletes an archival memory by ID.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createDeleteArchivalMemoryTool(
  ctx: AILikeCtx,
  userId: string,
) {
  return tool({
    description:
      'Delete an archival memory by its ID. The ID comes from searchArchivalMemory results (the value in square brackets).',
    inputSchema: z.object({
      id: z
        .string()
        .min(1)
        .describe(
          'Archival memory ID from a previous searchArchivalMemory result, e.g. the value shown in [brackets]',
        ),
    }),
    execute: async ({ id }) =>
      (await ctx.runMutation(internal.aiTools.deleteArchivalMemory, {
        userId,
        id,
      }))
        ? 'Deleted archival memory.'
        : 'Archival memory not found.',
  })
}

/**
 * Purpose: Builds the grouped memory tool map consumed by the top-level AI tool composer.
 * Function type: helper factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createMemoryTools(ctx: AILikeCtx, userId: string) {
  return {
    saveCoreMemory: createSaveCoreMemoryTool(ctx, userId),
    deleteCoreMemory: createDeleteCoreMemoryTool(ctx, userId),
    saveArchivalMemory: createSaveArchivalMemoryTool(ctx, userId),
    searchArchivalMemory: createSearchArchivalMemoryTool(ctx, userId),
    deleteArchivalMemory: createDeleteArchivalMemoryTool(ctx, userId),
  }
}
