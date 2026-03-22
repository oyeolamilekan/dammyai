import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { ScheduledTaskListItem } from '~/components/dashboard/tasks/task-utils'
import { CreateTaskDialog } from '~/components/dashboard/tasks/create-task-dialog'
import { TaskListItem } from '~/components/dashboard/tasks/task-list-item'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import { api } from '~/lib/convex-api'
import { getErrorMessage } from '~/lib/get-error-message'
import { requireAuth } from '~/lib/require-auth'

export const Route = createFileRoute('/dashboard/tasks')({
  component: TasksPage,
  beforeLoad: requireAuth,
})

function TasksPage() {
  const convexApi = api as any
  const tasksResponse = useQuery(convexApi.tasks.listTasks, { page: 1, limit: 50 })
  const updateTask = useMutation(convexApi.tasks.updateTask)
  const deleteTask = useMutation(convexApi.tasks.deleteTask)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)

  const tasks = (tasksResponse?.items ?? []) as Array<ScheduledTaskListItem>

  const toggleExpandedTask = (taskId: string) => {
    setExpandedTaskId((current) => (current === taskId ? null : taskId))
  }

  const toggleTaskEnabled = async (task: ScheduledTaskListItem) => {
    try {
      await updateTask({
        id: task.id,
        enabled: !task.enabled,
      })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Update failed'))
    }
  }

  const deleteTaskById = async (taskId: string) => {
    try {
      await deleteTask({ id: taskId })
      setExpandedTaskId((current) => (current === taskId ? null : current))
    } catch (error) {
      toast.error(getErrorMessage(error, 'Delete failed'))
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Scheduled tasks</CardTitle>
          <CreateTaskDialog />
        </CardHeader>

        <CardContent className="space-y-2">
          {tasksResponse === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-md" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tasks yet.</p>
          ) : (
            tasks.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                isExpanded={expandedTaskId === task.id}
                onToggleLogs={toggleExpandedTask}
                onToggleEnabled={toggleTaskEnabled}
                onDelete={deleteTaskById}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
