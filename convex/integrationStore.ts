import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

const providerValidator = v.union(
  v.literal("telegram"),
  v.literal("gmail"),
  v.literal("google_calendar"),
  v.literal("todoist"),
  v.literal("notion"),
  v.literal("exa"),
);

export const getIntegration = internalQuery({
  args: {
    userId: v.string(),
    provider: providerValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("integrations")
      .withIndex("userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .unique();
  },
});
