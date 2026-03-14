import type { ActionCtx } from '../_generated/server'

/**
 * Purpose: Defines the minimal Convex context shape needed by shared AI helpers that only read and write through internal queries and mutations.
 * Type kind: type alias
 */
export type AILikeCtx = Pick<ActionCtx, 'runQuery' | 'runMutation'>

/**
 * Purpose: Captures one completed tool call so task execution logs and AI callbacks can record what happened.
 * Type kind: type alias
 */
export type ToolCallStep = {
  toolName: string
  toolCallId: string
  input: unknown
  output: unknown
}

/**
 * Purpose: Describes the arguments accepted by the full user-scoped AI prompt pipeline.
 * Type kind: type alias
 */
export type AIPromptArgs = {
  userId: string
  prompt: string
  systemPrompt?: string
  modelPreference?: string
  onToolCall?: (step: ToolCallStep) => Promise<void>
}

/**
 * Purpose: Describes the smaller argument set for direct assistant replies that do not use user memory or conversation history.
 * Type kind: type alias
 */
export type AssistantReplyArgs = {
  prompt: string
  systemPrompt?: string
  modelPreference?: string
}

/**
 * Purpose: Represents one candidate memory item extracted from a conversation before it is persisted as either core or archival memory.
 * Type kind: type alias
 */
export type ExtractedMemory = {
  type: 'core' | 'archival'
  key?: string
  value?: string
  content?: string
  category?: string
  tags?: string
}
