import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { authClient } from '~/lib/auth-client'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const convexApi = api as any
  const user = useQuery(convexApi.auth.getCurrentUser)
  const isAuthenticated = Boolean(user)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-bold tracking-tight">DammyAI</h1>
      <p className="text-muted-foreground">
        Convex + Better Auth migration in progress. Core dashboard modules are now
        scaffolded for integrations, memories, soul settings, tasks, and research.
      </p>
      <div className="flex flex-wrap gap-3">
        {isAuthenticated ? (
          <>
            <Link to="/dashboard">
              <Button>Open Dashboard</Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                void authClient.signOut()
              }}
            >
              Sign out
            </Button>
          </>
        ) : (
          <Link to="/login">
            <Button>Sign in / Sign up</Button>
          </Link>
        )}
      </div>
    </main>
  )
}
