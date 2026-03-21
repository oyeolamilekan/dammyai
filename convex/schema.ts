import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { tables as authTables } from './betterAuth/schema'

export default defineSchema({
  ...authTables,
  integrations: defineTable({
    userId: v.string(),
    provider: v.union(
      v.literal('telegram'),
      v.literal('gmail'),
      v.literal('google_calendar'),
      v.literal('todoist'),
      v.literal('notion'),
      v.literal('exa'),
    ),
    apiKey: v.optional(v.string()),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    scope: v.optional(v.string()),
    telegramChatId: v.optional(v.string()),
    linkingCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('userId', ['userId'])
    .index('userId_provider', ['userId', 'provider'])
    .index('provider_linkingCode', ['provider', 'linkingCode'])
    .index('provider_telegramChatId', ['provider', 'telegramChatId']),
  memories: defineTable({
    userId: v.string(),
    content: v.string(),
    category: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('userId', ['userId'])
    .index('userId_updatedAt', ['userId', 'updatedAt']),
  coreMemories: defineTable({
    userId: v.string(),
    key: v.string(),
    value: v.string(),
    category: v.optional(v.string()),
    source: v.optional(
      v.union(v.literal('user'), v.literal('auto'), v.literal('agent')),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('userId', ['userId'])
    .index('userId_key', ['userId', 'key']),
  archivalMemories: defineTable({
    userId: v.string(),
    content: v.string(),
    tags: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('userId', ['userId'])
    .index('userId_updatedAt', ['userId', 'updatedAt']),
  messages: defineTable({
    userId: v.string(),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('tool')),
    content: v.string(),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    searchProvider: v.optional(v.string()),
    createdAt: v.number(),
  }).index('userId_createdAt', ['userId', 'createdAt']),
  souls: defineTable({
    userId: v.string(),
    systemPrompt: v.string(),
    modelPreference: v.optional(v.string()),
    searchProvider: v.optional(v.union(v.literal('exa'), v.literal('tavily'))),
    researchModelPreference: v.optional(v.string()),
    classifierModelPreference: v.optional(v.string()),
    researchDepth: v.optional(v.number()),
    researchBreadth: v.optional(v.number()),
    timezone: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('userId', ['userId']),
  scheduledTasks: defineTable({
    userId: v.string(),
    prompt: v.string(),
    type: v.union(v.literal('one_off'), v.literal('recurring')),
    intervalMs: v.optional(v.number()),
    runAt: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    lastRunAt: v.optional(v.number()),
    lastResult: v.optional(v.string()),
    lastLogId: v.optional(v.id('taskExecutionLogs')),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('userId', ['userId'])
    .index('enabled_nextRunAt', ['enabled', 'nextRunAt']),
  taskExecutionLogs: defineTable({
    taskId: v.id('scheduledTasks'),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.union(
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed'),
    ),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    steps: v.array(
      v.object({
        stepIndex: v.number(),
        toolName: v.string(),
        toolCallId: v.string(),
        input: v.string(),
        output: v.string(),
        timestamp: v.number(),
      }),
    ),
  })
    .index('taskId', ['taskId'])
    .index('taskId_startedAt', ['taskId', 'startedAt']),
  backgroundResearch: defineTable({
    userId: v.string(),
    prompt: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed'),
    ),
    result: v.optional(v.string()),
    summary: v.optional(v.string()),
    searchProvider: v.optional(v.string()),
    error: v.optional(v.string()),
    checkpoints: v.optional(
      v.array(
        v.object({
          step: v.string(),
          message: v.string(),
          timestamp: v.number(),
          status: v.union(
            v.literal('running'),
            v.literal('done'),
            v.literal('error'),
          ),
        }),
      ),
    ),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('userId_createdAt', ['userId', 'createdAt'])
    .index('status_createdAt', ['status', 'createdAt'])
    .index('userId_status_createdAt', ['userId', 'status', 'createdAt']),
  telegramProcessedUpdates: defineTable({
    updateId: v.number(),
    processedAt: v.number(),
  }).index('updateId', ['updateId']),
})
