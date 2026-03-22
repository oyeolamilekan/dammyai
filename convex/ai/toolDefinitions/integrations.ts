import {
  createCheckMailTool,
  createManageMailTool,
  createSendMailTool,
} from '../../tools/gmail'
import {
  createCheckScheduleTool,
  createRemoveEventTool,
  createScheduleCallTool,
} from '../../tools/googleCalendar'
import {
  createNotionDocumentTool,
  createSearchNotionTool,
  createUpdateNotionDocumentTool,
} from '../../tools/notion'
import { createTavilySearchTool } from '../../tools/tavily'
import { createSendTelegramMessageTool } from '../../tools/telegram'
import { createCheckTodosTool, createUpdateTodoTool } from '../../tools/todoist'
import { createWebSearchTool } from '../../tools/exa'
import type { AILikeCtx } from '../types'

/**
 * Purpose: Builds the Gmail-related tool group used by the AI agent.
 * Function type: helper factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createMailTools(ctx: AILikeCtx, userId: string) {
  return {
    checkMail: createCheckMailTool(ctx, userId),
    sendMail: createSendMailTool(ctx, userId),
    manageMail: createManageMailTool(ctx, userId),
  }
}

/**
 * Purpose: Builds the calendar-related tool group used by the AI agent.
 * Function type: helper factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createCalendarTools(ctx: AILikeCtx, userId: string) {
  return {
    checkSchedule: createCheckScheduleTool(ctx, userId),
    scheduleCall: createScheduleCallTool(ctx, userId),
    removeEvent: createRemoveEventTool(ctx, userId),
  }
}

/**
 * Purpose: Builds the Todoist-related tool group used by the AI agent.
 * Function type: helper factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createTodoTools(ctx: AILikeCtx, userId: string) {
  return {
    checkTodos: createCheckTodosTool(ctx, userId),
    updateTodo: createUpdateTodoTool(ctx, userId),
  }
}

/**
 * Purpose: Builds the Notion-related tool group used by the AI agent.
 * Function type: helper factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createNotionTools(ctx: AILikeCtx, userId: string) {
  return {
    createNotionDocument: createNotionDocumentTool(ctx, userId),
    updateNotionDocument: createUpdateNotionDocumentTool(ctx, userId),
    searchNotion: createSearchNotionTool(ctx, userId),
  }
}

/**
 * Purpose: Builds the Telegram-related tool group used by the AI agent.
 * Function type: helper factory
 * Args:
 * - ctx: AILikeCtx
 * - userId: string
 */
export function createMessagingTools(ctx: AILikeCtx, userId: string) {
  return {
    sendTelegramMessage: createSendTelegramMessageTool(ctx, userId),
  }
}

/**
 * Purpose: Builds the web-search tool group and routes to the configured search provider.
 * Function type: helper factory
 * Args:
 * - searchProvider: string | undefined
 */
export function createSearchTools(searchProvider?: string) {
  return {
    webSearch:
      searchProvider === 'tavily'
        ? createTavilySearchTool()
        : createWebSearchTool(),
  }
}
