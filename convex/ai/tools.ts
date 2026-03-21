import {
  createCheckMailTool,
  createManageMailTool,
  createSendMailTool,
} from '../tools/gmail'
import {
  createCheckScheduleTool,
  createRemoveEventTool,
  createScheduleCallTool,
} from '../tools/googleCalendar'
import {
  createNotionDocumentTool,
  createSearchNotionTool,
  createUpdateNotionDocumentTool,
} from '../tools/notion'
import { createTavilySearchTool } from '../tools/tavily'
import { createSendTelegramMessageTool } from '../tools/telegram'
import { createCheckTodosTool, createUpdateTodoTool } from '../tools/todoist'
import { createWebSearchTool } from '../tools/exa'
import { createMemoryTools } from './toolDefinitions/memory'
import { createResearchTools } from './toolDefinitions/research'
import { createScheduledTaskTools } from './toolDefinitions/scheduledTasks'
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
    checkMail: createCheckMailTool(ctx, userId),
    sendMail: createSendMailTool(ctx, userId),
    manageMail: createManageMailTool(ctx, userId),
    checkSchedule: createCheckScheduleTool(ctx, userId),
    scheduleCall: createScheduleCallTool(ctx, userId),
    removeEvent: createRemoveEventTool(ctx, userId),
    checkTodos: createCheckTodosTool(ctx, userId),
    updateTodo: createUpdateTodoTool(ctx, userId),
    createNotionDocument: createNotionDocumentTool(ctx, userId),
    updateNotionDocument: createUpdateNotionDocumentTool(ctx, userId),
    searchNotion: createSearchNotionTool(ctx, userId),
    sendTelegramMessage: createSendTelegramMessageTool(ctx, userId),
    webSearch:
      searchProvider === 'tavily'
        ? createTavilySearchTool()
        : createWebSearchTool(),
  }
}
