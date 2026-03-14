import { v } from 'convex/values'
import { internalAction } from './_generated/server'
import { executeAIPromptImpl, generateAssistantReplyImpl } from './ai/engine'

/**
 * Purpose: Runs the full AI assistant pipeline for a specific user, including memory loading, tool use, and memory extraction after the reply.
 * Function type: internalAction
 * Args:
 * - userId: v.string()
 * - prompt: v.string()
 * - systemPrompt: v.optional(v.string())
 * - modelPreference: v.optional(v.string())
 */
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

/**
 * Purpose: Generates a direct assistant reply without user-scoped memory lookups or post-response memory persistence.
 * Function type: internalAction
 * Args:
 * - prompt: v.string()
 * - systemPrompt: v.optional(v.string())
 * - modelPreference: v.optional(v.string())
 */
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
