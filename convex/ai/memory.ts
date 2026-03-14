import { generateText } from 'ai'
import { internal } from '../_generated/api'
import { normalizeMemoryModelId } from './config'
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
    system: [
      'You analyze conversations and extract memories worth saving.',
      'Return a JSON array. Each item has a "type" field: either "core" or "archival".',
      '',
      'CORE memories (type: "core") are short key-value facts:',
      '  {type: "core", key: "snake_case_label", value: "short fact", category: "..."}',
      '  Keys: name, bot_name, timezone, job_title, company, location, favorite_language, communication_style, etc.',
      '  Categories: preference, contact, schedule, personal, work.',
      '  If an existing fact changed, reuse the SAME key with the new value.',
      '  Max 200 chars for value.',
      '',
      'ARCHIVAL memories (type: "archival") are longer notes worth remembering:',
      '  {type: "archival", content: "detailed note...", tags: "comma,separated,tags"}',
      '  Use for: project details, meeting summaries, multi-step instructions, detailed preferences.',
      '  Max 2000 chars for content.',
      '',
      'Rules:',
      '- Only extract NEW or CHANGED information not in the known facts.',
      '- Prefer core for short identity facts. Prefer archival for anything longer than a sentence.',
      '- If there is nothing new worth remembering, return [].',
      '- Only return the JSON array, nothing else.',
    ].join('\n'),
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
