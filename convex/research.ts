import { v } from 'convex/values'
import { internal } from './_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { deepResearch, wrapReportHtml } from './lib/deepResearch'
import { getOptionalEnv } from './lib/env'
import { renderPdfViaApi } from './lib/pdfApi'
import { getUserId, requireUserId } from './lib/session'
import { now } from './lib/time'
import { markdownToTelegramHtml } from './lib/telegramFormat'
import type { Id } from './_generated/dataModel'
import type { ActionCtx } from './_generated/server'

/**
 * Purpose: Lists research jobs for the current user, including status, summary, and checkpoints.
 * Function type: query
 * Args: none
 */
export const listResearch = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx)
    if (!userId) {
      return []
    }
    const rows = await ctx.db
      .query('backgroundResearch')
      .withIndex('userId_createdAt', (q) => q.eq('userId', userId))
      .order('desc')
      .collect()

    return rows.map((row) => ({
      _id: row._id,
      prompt: row.prompt,
      status: row.status,
      summary: row.summary ?? null,
      hasReport: !!row.result,
      checkpoints: row.checkpoints ?? [],
      error: row.error ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
      completedAt: row.completedAt
        ? new Date(row.completedAt).toISOString()
        : null,
    }))
  },
})

/**
 * Purpose: Returns the rendered HTML report for one research job owned by the current user.
 * Function type: query
 * Args:
 * - id: v.id('backgroundResearch')
 */
export const getResearchReport = query({
  args: { id: v.id('backgroundResearch') },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx)
    if (!userId) return null
    const row = await ctx.db.get('backgroundResearch', args.id)
    if (!row || row.userId !== userId) return null
    return row.result ?? null
  },
})

/**
 * Purpose: Creates a new background research job and schedules it for processing.
 * Function type: mutation
 * Args:
 * - prompt: v.string()
 */
export const createResearchTask = mutation({
  args: { prompt: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const prompt = args.prompt.trim()
    if (!prompt) {
      throw new Error('Prompt is required')
    }
    const id = await ctx.db.insert('backgroundResearch', {
      userId,
      prompt,
      status: 'pending',
      createdAt: now(),
    })
    await ctx.scheduler.runAfter(0, internal.research.processResearchJob, {
      id,
    })
    return id
  },
})

/**
 * Purpose: Loads a research job by ID for internal processing and cancellation checks.
 * Function type: internalQuery
 * Args:
 * - id: v.id('backgroundResearch')
 */
export const getResearchById = internalQuery({
  args: { id: v.id('backgroundResearch') },
  handler: async (ctx, args) => {
    return await ctx.db.get('backgroundResearch', args.id)
  },
})

/**
 * Purpose: Returns the next batch of pending research jobs for cron-driven workers.
 * Function type: internalQuery
 * Args: none
 */
export const getPendingResearchJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('backgroundResearch')
      .withIndex('status_createdAt', (q) => q.eq('status', 'pending'))
      .take(20)
  },
})

/**
 * Purpose: Core research execution pipeline — claims the job atomically, runs deep research
 * with progress checkpoints, stores the completed report, and delivers results via Telegram.
 * Flow:
 *   1. Atomically claims the job (pending → running) to prevent duplicate execution
 *   2. Loads user's research model preference from soul settings
 *   3. Runs deepResearch() with a progress callback that persists checkpoints
 *      and checks for cancellation between rounds
 *   4. Stores the completed report HTML and summary
 *   5. Sends a Telegram summary message + PDF attachment (best-effort)
 * Args:
 * - ctx: ActionCtx — the Convex action context
 * - id: Id<'backgroundResearch'> — the research job to execute
 */
const processResearchJobImpl = async (
  ctx: ActionCtx,
  id: Id<'backgroundResearch'>,
) => {
  // Atomic claim: prevents the TOCTOU race between the scheduler and the cron
  const { claimed } = await ctx.runMutation(
    internal.research.claimResearchJob,
    { id },
  )
  if (!claimed) {
    return
  }

  const existing = await ctx.runQuery(internal.research.getResearchById, { id })
  if (!existing) {
    return
  }

  // Fetch user's research preferences
  const soul = await ctx.runQuery(internal.aiStore.getSoulByUserId, {
    userId: existing.userId,
  })
  const researchModel = soul?.researchModelPreference
  const searchProvider = soul?.searchProvider ?? 'exa'
  const depth = Math.min(4, Math.max(1, soul?.researchDepth ?? 2))
  const breadth = Math.min(6, Math.max(2, soul?.researchBreadth ?? 3))

  try {
    const progress = async (
      step: string,
      message: string,
      status: 'running' | 'done' | 'error',
    ) => {
      // Check if the job was cancelled before persisting the next checkpoint
      const current = await ctx.runQuery(internal.research.getResearchById, {
        id,
      })
      if (current?.status === 'failed') {
        throw new Error('Research cancelled')
      }
      await ctx.runMutation(internal.research.addCheckpoint, {
        id,
        step,
        message,
        status,
      })
    }

    const { summary, report } = await deepResearch(
      existing.prompt,
      depth,
      breadth,
      researchModel,
      progress,
      searchProvider,
    )

    // Store the raw report HTML (without full-document wrapper) for clean frontend display
    await ctx.runMutation(internal.research.markResearchCompleted, {
      id,
      result: report,
      summary,
      searchProvider,
    })

    // Send Telegram notification with PDF generated from the raw report
    await progress(
      'sending_telegram',
      'Delivering report via Telegram…',
      'running',
    )
    await sendResearchToTelegram(
      ctx,
      existing.userId,
      existing.prompt,
      summary,
      report,
    )
    await progress('sending_telegram', 'Report delivered', 'done')

    await progress('done', 'Research complete', 'done')
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : 'Unknown research error'
    // Don't overwrite if already marked as cancelled/failed
    if (msg !== 'Research cancelled') {
      await ctx.runMutation(internal.research.markResearchFailed, {
        id,
        error: msg,
      })
    }
  }
}

/**
 * Purpose: Delivers a completed research report to the user's linked Telegram account.
 * Sends a formatted summary message followed by a PDF document attachment.
 * The PDF is generated via the standalone PDF worker service from the wrapped report HTML.
 * Fails silently if Telegram is not configured or the user has no linked chat.
 * Args:
 * - ctx: ActionCtx — the Convex action context
 * - userId: string — the user who owns the research
 * - prompt: string — the original research topic (used as PDF title)
 * - summary: string — short summary text for the Telegram message
 * - rawReport: string — the HTML report body (without document shell)
 */
async function sendResearchToTelegram(
  ctx: ActionCtx,
  userId: string,
  prompt: string,
  summary: string,
  rawReport: string,
) {
  try {
    const telegramIntegration = await ctx.runQuery(
      internal.telegramStore.getIntegrationByUserId,
      { userId },
    )
    if (!telegramIntegration?.telegramChatId) return

    const { sendTelegramDocument } = await import('./telegram')
    const token = getOptionalEnv('TELEGRAM_BOT_TOKEN')
    if (!token) return

    const chatId = telegramIntegration.telegramChatId

    // Show typing while preparing the summary and PDF
    const { sendChatAction: sendAction } = await import('./telegram')
    await sendAction(chatId, 'typing')

    // Send summary message first
    const safeTopic = markdownToTelegramHtml(prompt)
    const safeSummary = markdownToTelegramHtml(summary)
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `📊 <b>Research Complete</b>\n\n<b>Topic:</b> ${safeTopic}\n\n${safeSummary}`,
        parse_mode: 'HTML',
      }),
    })

    // Wrap raw report in styled HTML document, then render the PDF via the standalone service
    const wrappedHtml = wrapReportHtml(prompt, rawReport)
    const fileName = `research-${Date.now()}.pdf`
    const buffer = await renderPdfViaApi({
      html: wrappedHtml,
      title: prompt,
      fileName,
    })
    await sendAction(chatId, 'upload_document')
    await sendTelegramDocument(
      chatId,
      buffer,
      fileName,
      '📄 Full research report',
    )
  } catch (err) {
    console.error('Failed to send research to Telegram:', err)
  }
}

/**
 * Purpose: Marks a research job as actively running before deep research begins.
 * Function type: internalMutation
 * Args:
 * - id: v.id('backgroundResearch')
 */
export const markResearchRunning = internalMutation({
  args: { id: v.id('backgroundResearch') },
  handler: async (ctx, args) => {
    await ctx.db.patch('backgroundResearch', args.id, {
      status: 'running',
    })
  },
})

/**
 * Purpose: Atomically claims a pending research job by transitioning its status from 'pending' to 'running'.
 * Returns { claimed: true } if the job was successfully claimed, or { claimed: false } if
 * the job doesn't exist, isn't pending, or was already claimed by another runner.
 * This prevents the TOCTOU race between the immediate scheduler and the cron.
 * Function type: internalMutation
 * Args:
 * - id: v.id('backgroundResearch')
 */
export const claimResearchJob = internalMutation({
  args: { id: v.id('backgroundResearch') },
  handler: async (ctx, args) => {
    const job = await ctx.db.get('backgroundResearch', args.id)
    if (!job || job.status !== 'pending') {
      return { claimed: false }
    }
    await ctx.db.patch('backgroundResearch', args.id, {
      status: 'running',
    })
    return { claimed: true }
  },
})

/**
 * Purpose: Stores the completed research report and summary after a successful run.
 * Function type: internalMutation
 * Args:
 * - id: v.id('backgroundResearch')
 * - result: v.string()
 * - summary: v.optional(v.string())
 */
export const markResearchCompleted = internalMutation({
  args: {
    id: v.id('backgroundResearch'),
    result: v.string(),
    summary: v.optional(v.string()),
    searchProvider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch('backgroundResearch', args.id, {
      status: 'completed',
      result: args.result,
      summary: args.summary,
      searchProvider: args.searchProvider,
      completedAt: now(),
      error: undefined,
    })
  },
})

/**
 * Purpose: Records a terminal failure for a research job.
 * Function type: internalMutation
 * Args:
 * - id: v.id('backgroundResearch')
 * - error: v.string()
 */
export const markResearchFailed = internalMutation({
  args: { id: v.id('backgroundResearch'), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch('backgroundResearch', args.id, {
      status: 'failed',
      error: args.error,
      completedAt: now(),
    })
  },
})

/**
 * Purpose: Appends or updates a progress checkpoint shown in the research dashboard timeline.
 * Function type: internalMutation
 * Args:
 * - id: v.id('backgroundResearch')
 * - step: v.string()
 * - message: v.string()
 * - status: v.union( v.literal('running'), v.literal('done'), v.literal('error'), )
 */
export const addCheckpoint = internalMutation({
  args: {
    id: v.id('backgroundResearch'),
    step: v.string(),
    message: v.string(),
    status: v.union(
      v.literal('running'),
      v.literal('done'),
      v.literal('error'),
    ),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get('backgroundResearch', args.id)
    if (!row) return
    const checkpoints = row.checkpoints ?? []
    // If the last checkpoint has the same step and is "running", update it in place
    const lastIdx = checkpoints.length - 1
    if (
      lastIdx >= 0 &&
      checkpoints[lastIdx].step === args.step &&
      checkpoints[lastIdx].status === 'running'
    ) {
      checkpoints[lastIdx] = {
        step: args.step,
        message: args.message,
        timestamp: now(),
        status: args.status,
      }
    } else {
      checkpoints.push({
        step: args.step,
        message: args.message,
        timestamp: now(),
        status: args.status,
      })
    }
    await ctx.db.patch('backgroundResearch', args.id, { checkpoints })
  },
})

/**
 * Purpose: Public entry point for executing a single research job by ID.
 * Delegates to processResearchJobImpl. Called by the Convex scheduler immediately
 * after a research job is created.
 * Function type: internalAction
 * Args:
 * - id: v.id('backgroundResearch')
 */
export const processResearchJob = internalAction({
  args: { id: v.id('backgroundResearch') },
  handler: async (ctx, args) => {
    await processResearchJobImpl(ctx, args.id)
  },
})

/**
 * Purpose: Cron handler — fetches all pending research jobs and processes them sequentially.
 * Acts as a safety net for jobs that weren't picked up by the immediate scheduler.
 * Called every minute by the cron job defined in convex/crons.ts.
 * Duplicate execution is prevented by the atomic claimResearchJob mutation.
 * Function type: internalAction
 */
export const processPendingResearch = internalAction({
  args: {},
  handler: async (ctx) => {
    const pendingJobs = await ctx.runQuery(
      internal.research.getPendingResearchJobs,
      {},
    )
    for (const job of pendingJobs) {
      await processResearchJobImpl(ctx, job._id)
    }
  },
})
