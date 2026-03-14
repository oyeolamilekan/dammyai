import { httpRouter } from 'convex/server'
import { authComponent, createAuth } from './betterAuth/auth'
import { registerWebhook, unregisterWebhook, webhook } from './telegram'
import { gmailAuth, gmailCallback } from './oauth/gmail'
import {
  googleCalendarAuth,
  googleCalendarCallback,
} from './oauth/googleCalendar'
import { todoistAuth, todoistCallback } from './oauth/todoist'
import { notionAuth, notionCallback } from './oauth/notion'

const http = httpRouter()

authComponent.registerRoutes(http, createAuth)
http.route({
  path: '/api/telegram/webhook',
  method: 'POST',
  handler: webhook,
})
http.route({
  path: '/api/telegram/register-webhook',
  method: 'POST',
  handler: registerWebhook,
})
http.route({
  path: '/api/telegram/unregister-webhook',
  method: 'POST',
  handler: unregisterWebhook,
})

// OAuth routes
http.route({
  path: '/api/integrations/gmail/auth',
  method: 'GET',
  handler: gmailAuth,
})
http.route({
  path: '/api/integrations/gmail/callback',
  method: 'GET',
  handler: gmailCallback,
})
http.route({
  path: '/api/integrations/google-calendar/auth',
  method: 'GET',
  handler: googleCalendarAuth,
})
http.route({
  path: '/api/integrations/google-calendar/callback',
  method: 'GET',
  handler: googleCalendarCallback,
})
http.route({
  path: '/api/integrations/todoist/auth',
  method: 'GET',
  handler: todoistAuth,
})
http.route({
  path: '/api/integrations/todoist/callback',
  method: 'GET',
  handler: todoistCallback,
})
http.route({
  path: '/api/integrations/notion/auth',
  method: 'GET',
  handler: notionAuth,
})
http.route({
  path: '/api/integrations/notion/callback',
  method: 'GET',
  handler: notionCallback,
})

/**
 * Purpose: Exports the root Convex HTTP router that registers Better Auth routes, Telegram webhooks, and OAuth endpoints.
 * Value type: http router
 */
export default http
