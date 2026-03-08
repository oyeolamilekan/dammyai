import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Skeleton } from '~/components/ui/skeleton'
import { Textarea } from '~/components/ui/textarea'

export const Route = createFileRoute('/dashboard/tasks')({
  component: TasksPage,
})

const UNITS = [
  { label: 'Minutes', ms: 60_000 },
  { label: 'Hours', ms: 3_600_000 },
  { label: 'Days', ms: 86_400_000 },
] as const

function formatInterval(ms: number) {
  if (ms >= 86_400_000 && ms % 86_400_000 === 0) return `${ms / 86_400_000}d`
  if (ms >= 3_600_000 && ms % 3_600_000 === 0) return `${ms / 3_600_000}h`
  return `${ms / 60_000}m`
}

function CreateTaskDialog() {
  const convexApi = api as any
  const createTask = useMutation(convexApi.tasks.createTask)

  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [type, setType] = useState<'one_off' | 'recurring'>('recurring')
  const [intervalValue, setIntervalValue] = useState(60)
  const [intervalUnit, setIntervalUnit] = useState(60_000)
  const [runAt, setRunAt] = useState('')

  const reset = () => {
    setPrompt('')
    setType('recurring')
    setIntervalValue(60)
    setIntervalUnit(60_000)
    setRunAt('')
  }

  const submit = async () => {
    try {
      const runAtMs = runAt ? new Date(runAt).getTime() : undefined
      await createTask({
        prompt,
        type,
        intervalMs:
          type === 'recurring' ? intervalValue * intervalUnit : undefined,
        runAt: runAtMs && !Number.isNaN(runAtMs) ? runAtMs : undefined,
      })
      toast.success('Task created')
      reset()
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Create failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create task</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-2">
            <Label htmlFor="task-prompt">Prompt</Label>
            <Textarea
              id="task-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-type">Type</Label>
            <select
              id="task-type"
              value={type}
              onChange={(e) =>
                setType(e.target.value as 'one_off' | 'recurring')
              }
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="recurring">Recurring</option>
              <option value="one_off">One-off</option>
            </select>
          </div>
          {type === 'recurring' ? (
            <>
              <div className="space-y-2">
                <Label>Repeat every</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={intervalValue}
                    onChange={(e) =>
                      setIntervalValue(Math.max(1, Number(e.target.value)))
                    }
                    className="w-24"
                  />
                  <select
                    value={intervalUnit}
                    onChange={(e) => setIntervalUnit(Number(e.target.value))}
                    className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
                  >
                    {UNITS.map((u) => (
                      <option key={u.ms} value={u.ms}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="startAt">First run at (optional)</Label>
                <Input
                  id="startAt"
                  type="datetime-local"
                  value={runAt}
                  onChange={(e) => setRunAt(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Leave empty to start after the first interval
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="runAt">Run at</Label>
              <Input
                id="runAt"
                type="datetime-local"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
              />
            </div>
          )}
          <Button
            className="w-full"
            disabled={!prompt.trim()}
            onClick={() => void submit()}
          >
            Create task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TasksPage() {
  const convexApi = api as any
  const tasks = useQuery(convexApi.tasks.listTasks, { page: 1, limit: 50 })
  const updateTask = useMutation(convexApi.tasks.updateTask)
  const deleteTask = useMutation(convexApi.tasks.deleteTask)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Scheduled tasks</CardTitle>
          <CreateTaskDialog />
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-md" />
              ))}
            </div>
          ) : (tasks?.items ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No tasks yet.</p>
          ) : (
            (tasks?.items ?? []).map((task: any) => (
              <div key={task.id} className="rounded-md border p-3">
                <p className="font-medium">{task.prompt}</p>
                <p className="text-muted-foreground text-xs">
                  {task.type === 'recurring' && task.intervalMs
                    ? `every ${formatInterval(task.intervalMs)}`
                    : task.type}
                  {' • '}
                  {task.enabled ? 'enabled' : 'paused'}
                  {task.nextRunAt &&
                    ` • next: ${new Date(task.nextRunAt).toLocaleString()}`}
                </p>
                {task.lastResult && (
                  <p className="text-muted-foreground mt-1 text-xs truncate">
                    Last: {task.lastResult.slice(0, 100)}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void updateTask({
                        id: task.id,
                        enabled: !task.enabled,
                      }).catch((error) => {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : 'Update failed',
                        )
                      })
                    }}
                  >
                    {task.enabled ? 'Pause' : 'Enable'}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      void deleteTask({ id: task.id }).catch((error) => {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : 'Delete failed',
                        )
                      })
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
