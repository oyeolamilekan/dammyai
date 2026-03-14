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

/**
 * Purpose: Runs the full user-scoped AI assistant flow, including prompt construction, conversation persistence, tool execution, and memory extraction.
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

  const [soul, history, coreMemories] = await Promise.all([
    ctx.runQuery(internal.aiStore.getSoulByUserId, { userId: args.userId }),
    ctx.runQuery(internal.aiStore.getConversationHistory, {
      userId: args.userId,
      limit: 50,
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
      if (!toolResults || toolResults.length === 0) {
        return
      }
      for (let i = 0; i < toolResults.length; i++) {
        const row = toolResults[i]
        const toolName = row.toolName ?? 'tool'
        const content = formatToolOutput(row.output).slice(0, 4000)
        await ctx.runMutation(internal.aiStore.saveMessage, {
          userId: args.userId,
          role: 'tool',
          content,
          toolName,
          toolCallId: row.toolCallId,
        })
        if (args.onToolCall) {
          const callArgs = toolCalls?.[i]?.args
          await args.onToolCall({
            toolName,
            toolCallId: row.toolCallId ?? '',
            input: callArgs ?? {},
            output: row.output,
          })
        }
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
