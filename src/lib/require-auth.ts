import { redirect } from '@tanstack/react-router'
import { getCachedSession } from './auth-client'

/**
 * Shared beforeLoad guard for protected routes.
 * Checks the cached session and redirects to /login if unauthenticated.
 */
export async function requireAuth({ location }: { location: { href: string } }) {
  if (typeof window === 'undefined') return
  const session = await getCachedSession()
  if (!session) {
    throw redirect({
      to: '/login',
      search: { redirect: location.href },
    })
  }
}
