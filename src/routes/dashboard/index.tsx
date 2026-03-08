import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'

export const Route = createFileRoute('/dashboard/')({
  component: DashboardHome,
})

function StatCard({
  title,
  value,
}: {
  title: string
  value: string | number | undefined
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {value === undefined ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <p className="text-sm">{value}</p>
        )}
      </CardContent>
    </Card>
  )
}

function DashboardHome() {
  const convexApi = api as any
  const user = useQuery(convexApi.auth.getCurrentUser)
  const integrations = useQuery(convexApi.integrations.listIntegrations)
  const tasks = useQuery(convexApi.tasks.listTasks, { page: 1, limit: 5 })
  const research = useQuery(convexApi.research.listResearch)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <StatCard
        title="User"
        value={
          user ? user.email : user === null ? 'Not authenticated' : undefined
        }
      />
      <StatCard title="Integrations" value={integrations?.length} />
      <StatCard title="Scheduled Tasks" value={tasks?.total} />
      <StatCard title="Research Jobs" value={research?.length} />
    </div>
  )
}
