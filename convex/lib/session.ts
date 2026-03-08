import { authComponent } from '../betterAuth/auth'

export async function getUserId(ctx: unknown): Promise<string | null> {
  const user = await authComponent.safeGetAuthUser(ctx as never)
  if (!user) {
    return null
  }
  const rawId = (user as { userId?: string; _id?: string }).userId ?? user._id
  return String(rawId)
}

export async function requireUserId(ctx: unknown): Promise<string> {
  const userId = await getUserId(ctx)
  if (!userId) {
    throw new Error('Unauthorized')
  }
  return userId
}
