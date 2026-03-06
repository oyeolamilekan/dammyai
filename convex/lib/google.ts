import { internal } from "../_generated/api";
import { getRequiredEnv } from "./env";
import type { ActionCtx } from "../_generated/server";

async function refreshGoogleAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[Google] Token refresh failed:", res.status, body);
    return null;
  }

  return (await res.json()) as { access_token: string; expires_in: number };
}

export async function getGmailAccessToken(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  userId: string,
): Promise<string | null> {
  const record = await ctx.runQuery(
    internal.integrationStore.getIntegration,
    { userId, provider: "gmail" },
  );

  if (!record?.accessToken) return null;

  if (
    record.refreshToken &&
    record.tokenExpiresAt &&
    record.tokenExpiresAt < Date.now() + 5 * 60_000
  ) {
    const refreshed = await refreshGoogleAccessToken(record.refreshToken);
    if (refreshed) {
      await ctx.runMutation(
        internal.integrations.upsertIntegrationInternal,
        {
          userId,
          provider: "gmail",
          accessToken: refreshed.access_token,
          tokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
        },
      );
      return refreshed.access_token;
    }
    console.error("[Gmail] Failed to refresh token for user:", userId);
    return null;
  }

  return record.accessToken;
}

export async function getGoogleCalendarAccessToken(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  userId: string,
): Promise<string | null> {
  const record = await ctx.runQuery(
    internal.integrationStore.getIntegration,
    { userId, provider: "google_calendar" },
  );

  if (!record?.accessToken) return null;

  if (
    record.refreshToken &&
    record.tokenExpiresAt &&
    record.tokenExpiresAt < Date.now() + 5 * 60_000
  ) {
    const refreshed = await refreshGoogleAccessToken(record.refreshToken);
    if (refreshed) {
      await ctx.runMutation(
        internal.integrations.upsertIntegrationInternal,
        {
          userId,
          provider: "google_calendar",
          accessToken: refreshed.access_token,
          tokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
        },
      );
      return refreshed.access_token;
    }
    console.error("[Google Calendar] Failed to refresh token for user:", userId);
    return null;
  }

  return record.accessToken;
}
