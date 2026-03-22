import {
  createCalendarTools,
  createMailTools,
  createMemoryTools,
  createMessagingTools,
  createNotionTools,
  createResearchTools,
  createScheduledTaskTools,
  createSearchTools,
  createTodoTools,
} from './toolDefinitions'
import type { AILikeCtx } from './types'

/**
 * Purpose: Builds the AI SDK tool set for a specific user, wiring shared AI-domain tool groups together with provider integrations.
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
  let researchFired = false

  const claimResearchStart = () => {
    if (researchFired) return false
    researchFired = true
    return true
  }

  return {
    ...createMemoryTools(ctx, userId),
    ...createScheduledTaskTools(ctx, userId),
    ...createResearchTools(ctx, userId, claimResearchStart),
    ...createMailTools(ctx, userId),
    ...createCalendarTools(ctx, userId),
    ...createTodoTools(ctx, userId),
    ...createNotionTools(ctx, userId),
    ...createMessagingTools(ctx, userId),
    ...createSearchTools(searchProvider),
  }
}
