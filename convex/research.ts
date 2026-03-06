import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { deepResearch, wrapReportHtml } from "./lib/deepResearch";
import { getOptionalEnv } from "./lib/env";
import { generatePdf, htmlToBlocks } from "./lib/pdfGenerator";
import { getUserId, requireUserId } from "./lib/session";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

const now = () => Date.now();

export const listResearch = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return [];
    }
    const rows = await ctx.db
      .query("backgroundResearch")
      .withIndex("userId_createdAt", (q) => q.eq("userId", userId))
      .collect();

    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        _id: row._id,
        prompt: row.prompt,
        status: row.status,
        summary: row.summary ?? null,
        hasReport: !!row.result,
        checkpoints: row.checkpoints ?? [],
        error: row.error ?? null,
        createdAt: new Date(row.createdAt).toISOString(),
        completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
      }));
  },
});

export const getResearchReport = query({
  args: { id: v.id("backgroundResearch") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db.get("backgroundResearch", args.id);
    if (!row || row.userId !== userId) return null;
    return row.result ?? null;
  },
});

export const createResearchTask = mutation({
  args: { prompt: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const prompt = args.prompt.trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    const id = await ctx.db.insert("backgroundResearch", {
      userId,
      prompt,
      status: "pending",
      createdAt: now(),
    });
    await ctx.scheduler.runAfter(0, internal.research.processResearchJob, { id });
    return id;
  },
});

export const getResearchById = internalQuery({
  args: { id: v.id("backgroundResearch") },
  handler: async (ctx, args) => {
    return await ctx.db.get("backgroundResearch", args.id);
  },
});

export const getPendingResearchJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("backgroundResearch")
      .withIndex("status_createdAt", (q) => q.eq("status", "pending"))
      .take(20);
  },
});

const processResearchJobImpl = async (
  ctx: ActionCtx,
  id: Id<"backgroundResearch">,
) => {
  const existing = await ctx.runQuery(internal.research.getResearchById, { id });
  if (!existing || existing.status !== "pending") {
    return;
  }
  await ctx.runMutation(internal.research.markResearchRunning, { id });

  // Fetch user's research model preference
  const soul = await ctx.runQuery(internal.aiStore.getSoulByUserId, { userId: existing.userId });
  const researchModel = soul?.researchModelPreference;

  try {
    const progress = async (step: string, message: string, status: "running" | "done" | "error") => {
      // Check if the job was cancelled before persisting the next checkpoint
      const current = await ctx.runQuery(internal.research.getResearchById, { id });
      if (current?.status === "failed") {
        throw new Error("Research cancelled");
      }
      await ctx.runMutation(internal.research.addCheckpoint, { id, step, message, status });
    };

    const { summary, report } = await deepResearch(existing.prompt, 2, 3, researchModel, progress);

    // Store the raw report HTML (without full-document wrapper) for clean frontend display
    await ctx.runMutation(internal.research.markResearchCompleted, {
      id,
      result: report,
      summary,
    });

    // Send Telegram notification with PDF generated from the raw report
    await progress("sending_telegram", "Delivering report via Telegram…", "running");
    await sendResearchToTelegram(ctx, existing.userId, existing.prompt, summary, report);
    await progress("sending_telegram", "Report delivered", "done");

    await progress("done", "Research complete", "done");
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown research error";
    // Don't overwrite if already marked as cancelled/failed
    if (msg !== "Research cancelled") {
      await ctx.runMutation(internal.research.markResearchFailed, {
        id,
        error: msg,
      });
    }
  }
};

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
    );
    if (!telegramIntegration?.telegramChatId) return;

    const { sendTelegramDocument } = await import("./telegram");
    const token = getOptionalEnv("TELEGRAM_BOT_TOKEN");
    if (!token) return;

    const chatId = telegramIntegration.telegramChatId;

    // Send summary message first
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `📊 <b>Research Complete</b>\n\n<b>Topic:</b> ${prompt}\n\n${summary}`,
        parse_mode: "HTML",
      }),
    });

    // Wrap raw report in styled HTML document, then generate PDF from blocks
    const wrappedHtml = wrapReportHtml(prompt, rawReport);
    const blocks = htmlToBlocks(wrappedHtml);
    const pdfBytes = await generatePdf(prompt, blocks);

    // Convert Uint8Array to a clean ArrayBuffer to avoid offset issues
    const buffer = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength,
    ) as ArrayBuffer;

    const fileName = `research-${Date.now()}.pdf`;
    await sendTelegramDocument(chatId, buffer, fileName, "📄 Full research report");
  } catch (err) {
    console.error("Failed to send research to Telegram:", err);
  }
}

export const markResearchRunning = internalMutation({
  args: { id: v.id("backgroundResearch") },
  handler: async (ctx, args) => {
    await ctx.db.patch("backgroundResearch", args.id, {
      status: "running",
    });
  },
});

export const markResearchCompleted = internalMutation({
  args: { id: v.id("backgroundResearch"), result: v.string(), summary: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch("backgroundResearch", args.id, {
      status: "completed",
      result: args.result,
      summary: args.summary,
      completedAt: now(),
      error: undefined,
    });
  },
});

export const markResearchFailed = internalMutation({
  args: { id: v.id("backgroundResearch"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("backgroundResearch", args.id, {
      status: "failed",
      error: args.error,
      completedAt: now(),
    });
  },
});

export const addCheckpoint = internalMutation({
  args: {
    id: v.id("backgroundResearch"),
    step: v.string(),
    message: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("backgroundResearch", args.id);
    if (!row) return;
    const checkpoints = row.checkpoints ?? [];
    // If the last checkpoint has the same step and is "running", update it in place
    const lastIdx = checkpoints.length - 1;
    if (lastIdx >= 0 && checkpoints[lastIdx].step === args.step && checkpoints[lastIdx].status === "running") {
      checkpoints[lastIdx] = {
        step: args.step,
        message: args.message,
        timestamp: now(),
        status: args.status,
      };
    } else {
      checkpoints.push({
        step: args.step,
        message: args.message,
        timestamp: now(),
        status: args.status,
      });
    }
    await ctx.db.patch("backgroundResearch", args.id, { checkpoints });
  },
});

export const processResearchJob = internalAction({
  args: { id: v.id("backgroundResearch") },
  handler: async (ctx, args) => {
    await processResearchJobImpl(ctx, args.id);
  },
});

export const processPendingResearch = internalAction({
  args: {},
  handler: async (ctx) => {
    const pendingJobs = await ctx.runQuery(internal.research.getPendingResearchJobs, {});
    for (const job of pendingJobs) {
      await processResearchJobImpl(ctx, job._id);
    }
  },
});
