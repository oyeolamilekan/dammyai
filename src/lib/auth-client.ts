import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
  plugins: [convexClient()],
});

// Cache getSession() to avoid blocking HTTP calls on every route navigation.
// The cache auto-expires so stale auth state is eventually refreshed.
const SESSION_CACHE_MS = 30_000;
let _cachedSession: { data: any; ts: number } | null = null;

export async function getCachedSession() {
  if (_cachedSession && Date.now() - _cachedSession.ts < SESSION_CACHE_MS) {
    return _cachedSession.data;
  }
  const result = await authClient.getSession();
  _cachedSession = { data: result.data, ts: Date.now() };
  return result.data;
}

export function clearSessionCache() {
  _cachedSession = null;
}
