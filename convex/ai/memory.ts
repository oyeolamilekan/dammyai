import { generateText } from 'ai'
import { internal } from '../_generated/api'
import { normalizeMemoryModelId } from './config'
import { MEMORY_EXTRACTION_PROMPT } from './prompts'
import type { AILikeCtx, ExtractedMemory } from './types'

/**
 * Purpose: Parses the memory-extraction model response into validated core or archival memory candidates.
 * Function type: helper
 * Args:
 * - text: string
 */
export const parseExtractedMemories = (
  text: string,
): Array<ExtractedMemory> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) {
    return []
  }

  const memories: Array<ExtractedMemory> = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const type = row.type === 'archival' ? 'archival' : 'core'
    if (type === 'core') {
      if (typeof row.key !== 'string' || typeof row.value !== 'string') continue
      memories.push({
        type: 'core',
        key: row.key,
        value: row.value,
        category: typeof row.category === 'string' ? row.category : undefined,
      })
      continue
    }
    if (typeof row.content !== 'string') continue
    memories.push({
      type: 'archival',
      content: row.content,
      tags: typeof row.tags === 'string' ? row.tags : undefined,
    })
  }

  return memories
}

/**
 * Purpose: Extracts new memories from a user/assistant exchange and persists any new core facts or archival notes.
 * Function type: helper
 * Args:
 * - ctx: AILikeCtx
 * - args: { userId: string; userMessage: string; assistantMessage: string }
 */
export const extractAndSaveMemories = async (
  ctx: AILikeCtx,
  args: { userId: string; userMessage: string; assistantMessage: string },
) => {
  if (args.userMessage.trim().length < 20) {
    return 0
  }

  const coreMemories: Array<{ key: string; value: string }> =
    await ctx.runQuery(internal.aiStore.getCoreMemories, {
      userId: args.userId,
    })
  const knownFacts = coreMemories.map(
    (memory) => `${memory.key}: ${memory.value}`,
  )

  const { text } = await generateText({
    model: normalizeMemoryModelId(),
    system: MEMORY_EXTRACTION_PROMPT,
    prompt: `Known core facts:\n${knownFacts.join('\n') || '(none)'}\n\nUser: ${args.userMessage}\nAssistant: ${args.assistantMessage}`,
  })

  const memories = parseExtractedMemories(text)
  if (memories.length === 0) {
    return 0
  }

  const coreFacts = memories
    .filter((memory) => memory.type === 'core' && memory.key && memory.value)
    .map((memory) => ({
      key: memory.key!,
      value: memory.value!,
      category: memory.category,
    }))

  const archivalNotes = memories.filter(
    (memory) => memory.type === 'archival' && memory.content,
  )

  let changed = 0

  if (coreFacts.length > 0) {
    changed += await ctx.runMutation(
      internal.aiStore.upsertAutoExtractedCoreMemories,
      { userId: args.userId, facts: coreFacts },
    )
  }

  for (const note of archivalNotes) {
    await ctx.runMutation(internal.aiTools.saveArchivalMemory, {
      userId: args.userId,
      content: note.content!,
      tags: note.tags,
    })
    changed += 1
  }

  return changed
}
