import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { components } from "../_generated/api";
import authConfig from "../auth.config";
import schema from "./schema";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import type { BetterAuthOptions } from "better-auth";
import type { DataModel } from "../_generated/dataModel";

const env = (globalThis as any).process?.env ?? {};

export const authComponent = createClient<DataModel, typeof schema>(
  (components as { betterAuth: any }).betterAuth,
  {
    local: { schema },
    verbose: false,
  },
);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    appName: "DammyAI",
    baseURL: env.SITE_URL ?? "http://localhost:3000",
    secret:
      env.BETTER_AUTH_SECRET ?? "dev-only-better-auth-secret-must-be-at-least-32-chars",
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [convex({ authConfig })],
  }) satisfies BetterAuthOptions;

export const options = createAuthOptions({} as GenericCtx<DataModel>);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};
