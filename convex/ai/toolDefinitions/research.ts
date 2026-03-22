import { tool } from 'ai'
import { z } from 'zod'
import { internal } from '../../_generated/api'
import type { AILikeCtx } from '../types'

type ClaimResearchStart = () => boolean

/**
 * Purpose: Creates the tool that starts a background research job while respecting the per-invocation research guard.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 * - claimResearchStart: ClaimResearchStart
 */
export function createStartBackgroundResearchTool(
  ctx: AILikeCtx,
  userId: string,
  claimResearchStart: ClaimResearchStart,
) {
  return tool({
    description:
      'Start a deep background research job that runs asynchronously and delivers a comprehensive report. USE for complex questions needing multi-source analysis: market research, technical deep-dives, competitive analysis, "tell me everything about X", or any topic requiring 30+ minutes of human research. Results are delivered when ready (usually via Telegram). NOT for quick factual lookups (use webSearch instead).',
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe(
          'A detailed research question or brief. Be specific about what to investigate and what angles to cover.',
        ),
    }),
    execute: async ({ prompt }) => {
      if (!claimResearchStart()) {
        return 'Research already started — no need to start another one.'
      }

      await ctx.runMutation(internal.aiTools.startBackgroundResearch, {
        userId,
        prompt,
      })
      return `Research kicked off — I'll dig into "${prompt}" and deliver the results when ready.`
    },
  })
}

/**
 * Purpose: Creates the tool that cancels an active background research job.
 * Function type: tool factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createCancelBackgroundResearchTool(
  ctx: AILikeCtx,
  userId: string,
) {
  return tool({
    description:
      'Cancel an active background research job. If no ID is provided, cancels the most recent active job.',
    inputSchema: z.object({
      id: z
        .string()
        .optional()
        .describe('Research job ID to cancel. Omit to cancel the most recent active job.'),
    }),
    execute: async ({ id }) =>
      (await ctx.runMutation(internal.aiTools.cancelBackgroundResearch, {
        userId,
        id,
      }))
        ? 'Done — research canceled.'
        : 'No active research to cancel — it may have already finished.',
  })
}

/**
 * Purpose: Builds the grouped research tool map consumed by the top-level AI tool composer.
 * Function type: helper factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 * - claimResearchStart: ClaimResearchStart
 */
export function createResearchTools(
  ctx: AILikeCtx,
  userId: string,
  claimResearchStart: ClaimResearchStart,
) {
  return {
    startBackgroundResearch: createStartBackgroundResearchTool(
      ctx,
      userId,
      claimResearchStart,
    ),
    cancelBackgroundResearch: createCancelBackgroundResearchTool(ctx, userId),
  }
}
