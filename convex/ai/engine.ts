import { generateText, stepCountIs } from 'ai'
import { internal } from '../_generated/api'
import {
  DEFAULT_SYSTEM_PROMPT,
  MEMORY_INSTRUCTIONS,
  buildSystemPrompt,
  getEnv,
  normalizeGatewayModelId,
} from './config'
import { extractAndSaveMemories } from './memory'
import { createAgentTools, formatToolOutput } from './tools'
import type { AILikeCtx, AIPromptArgs, AssistantReplyArgs } from './types'
/**
 * Purpose: Generates a plain assistant response using the configured model path without loading user-scoped history or memories.
 * Function type: helper
 * Args:
 * - args: AssistantReplyArgs
 */
export const generateAssistantReplyImpl = async (args: AssistantReplyArgs) => {
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

// ---------------------------------------------------------------------------
// Helpers that break executeAIPromptImpl into readable steps
// ---------------------------------------------------------------------------

/** Loads the user's soul config, conversation history, and core memories in parallel. */
const loadUserContext = (ctx: AILikeCtx, userId: string) =>
  Promise.all([
    ctx.runQuery(internal.aiStore.getSoulByUserId, { userId }),
    ctx.runQuery(internal.aiStore.getConversationHistory, {
      userId,
      limit: 20,
    }),
    ctx.runQuery(internal.aiStore.getCoreMemories, { userId }),
  ])

/** Assembles the full system prompt from the base prompt, memory instructions, core memories, and timezone. */
const assembleSystemPrompt = (
  basePrompt: string,
  coreMemories: Array<{ key: string; value: string }>,
  timezone?: string,
) => {
  const promptBody = `${basePrompt}\n\n${MEMORY_INSTRUCTIONS}`
  return buildSystemPrompt(promptBody, coreMemories, timezone)
}

/** Persists the user's message to conversation history. */
const saveUserMessage = (ctx: AILikeCtx, userId: string, content: string) =>
  ctx.runMutation(internal.aiStore.saveMessage, {
    userId,
    role: 'user' as const,
    content,
  })

/** Creates the onStepFinish callback that persists tool results and fires the optional onToolCall hook. */
const createStepHandler = (
  ctx: AILikeCtx,
  args: AIPromptArgs,
  searchProvider?: string,
) => {
  return async ({
    toolCalls,
    toolResults,
  }: {
    toolCalls?: Array<{
      toolCallId?: string
      toolName?: string
      args?: unknown
    }>
    toolResults?: Array<{
      toolCallId?: string
      toolName?: string
      output?: unknown
    }>
  }) => {
    if (!toolResults || toolResults.length === 0) return

    for (let i = 0; i < toolResults.length; i++) {
      const row = toolResults[i]
      const toolName = row.toolName ?? 'tool'
      const content = formatToolOutput(row.output).slice(0, 4000)
      const isWebSearch = toolName === 'webSearch'

      await ctx.runMutation(internal.aiStore.saveMessage, {
        userId: args.userId,
        role: 'tool',
        content,
        toolName,
        toolCallId: row.toolCallId,
        searchProvider: isWebSearch ? (searchProvider ?? 'exa') : undefined,
      })

      if (args.onToolCall) {
        await args.onToolCall({
          toolName,
          toolCallId: row.toolCallId ?? '',
          input: toolCalls?.[i]?.args ?? {},
          output: row.output,
        })
      }
    }
  }
}

/** Persists the final assistant message and extracts memories (best-effort). */
const saveResponseAndMemories = async (
  ctx: AILikeCtx,
  userId: string,
  userPrompt: string,
  assistantMessage: string,
  modelId?: string,
) => {
  await ctx.runMutation(internal.aiStore.saveMessage, {
    userId,
    role: 'assistant' as const,
    content: assistantMessage,
    modelId,
  })

  try {
    await extractAndSaveMemories(ctx, {
      userId,
      userMessage: userPrompt,
      assistantMessage,
    })
  } catch (error) {
    console.error('[AI] Memory extraction failed:', error)
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Purpose: Runs the full user-scoped AI assistant flow — prompt construction, query classification,
 *          conversation persistence, tool execution, and memory extraction.
 * Function type: helper
 * Args:
 * - ctx: AILikeCtx
 * - args: AIPromptArgs
 */
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

  // 1. Load user context
  const [soul, history, coreMemories] = await loadUserContext(ctx, args.userId)

  // 2. Resolve model & preferences
  const modelId = normalizeGatewayModelId(
    args.modelPreference?.trim() || soul?.modelPreference,
  )
  const searchProvider = soul?.searchProvider
  const timezone = soul?.timezone
  const basePrompt =
    args.systemPrompt?.trim() || soul?.systemPrompt || DEFAULT_SYSTEM_PROMPT

  // 3. Assemble system prompt
  const systemPrompt = assembleSystemPrompt(basePrompt, coreMemories, timezone)

  // 4. Persist user message
  await saveUserMessage(ctx, args.userId, userPrompt)

  // 5. Run the model with tools
  const result = await generateText({
    model: modelId,
    system: systemPrompt,
    messages: [...history, { role: 'user', content: userPrompt }],
    tools: createAgentTools(ctx, args.userId, searchProvider),
    stopWhen: stepCountIs(8),
    onStepFinish: createStepHandler(ctx, args, searchProvider),
  })

  const assistantMessage =
    result.text.trim() || "I couldn't generate a response."

  // 6. Save response & extract memories
  await saveResponseAndMemories(
    ctx,
    args.userId,
    userPrompt,
    assistantMessage,
    modelId,
  )

  return assistantMessage
}
