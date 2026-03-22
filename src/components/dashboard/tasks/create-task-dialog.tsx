import { useMutation } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { TASK_INTERVAL_UNITS } from './task-utils'
import type { ScheduledTaskType } from './task-utils'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { api } from '~/lib/convex-api'
import { getErrorMessage } from '~/lib/get-error-message'

const taskTypeSelectClassName =
  'border-input bg-background h-9 w-full rounded-md border px-3 text-sm'

type CreateTaskFormState = {
  prompt: string
  type: ScheduledTaskType
  intervalValue: number
  intervalUnit: number
  runAt: string
}

const initialCreateTaskFormState: CreateTaskFormState = {
  prompt: '',
  type: 'recurring',
  intervalValue: 60,
  intervalUnit: 60_000,
  runAt: '',
}

function parseOptionalTimestamp(value: string) {
  const timestamp = value ? new Date(value).getTime() : undefined
  return timestamp && !Number.isNaN(timestamp) ? timestamp : undefined
}

type TaskScheduleFieldsProps = {
  form: CreateTaskFormState
  onTypeChange: (type: ScheduledTaskType) => void
  onIntervalValueChange: (value: number) => void
  onIntervalUnitChange: (value: number) => void
  onRunAtChange: (value: string) => void
}

function TaskScheduleFields({
  form,
  onTypeChange,
  onIntervalValueChange,
  onIntervalUnitChange,
  onRunAtChange,
}: TaskScheduleFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="task-type">Type</Label>
        <select
          id="task-type"
          value={form.type}
          onChange={(event) =>
            onTypeChange(event.target.value as ScheduledTaskType)
          }
          className={taskTypeSelectClassName}
        >
          <option value="recurring">Recurring</option>
          <option value="one_off">One-off</option>
        </select>
      </div>

      {form.type === 'recurring' ? (
        <>
          <div className="space-y-2">
            <Label>Repeat every</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={form.intervalValue}
                onChange={(event) =>
                  onIntervalValueChange(Math.max(1, Number(event.target.value)))
                }
                className="w-24"
              />
              <select
                value={form.intervalUnit}
                onChange={(event) =>
                  onIntervalUnitChange(Number(event.target.value))
                }
                className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
              >
                {TASK_INTERVAL_UNITS.map((unit) => (
                  <option key={unit.ms} value={unit.ms}>
                    {unit.label}
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
              value={form.runAt}
              onChange={(event) => onRunAtChange(event.target.value)}
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
            value={form.runAt}
            onChange={(event) => onRunAtChange(event.target.value)}
          />
        </div>
      )}
    </>
  )
}

export function CreateTaskDialog() {
  const convexApi = api as any
  const createTask = useMutation(convexApi.tasks.createTask)

  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState<CreateTaskFormState>(
    initialCreateTaskFormState,
  )

  const updateForm = <TKey extends keyof CreateTaskFormState>(
    key: TKey,
    value: CreateTaskFormState[TKey],
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const resetForm = () => {
    setForm(initialCreateTaskFormState)
  }

  const submit = async () => {
    try {
      await createTask({
        prompt: form.prompt,
        type: form.type,
        intervalMs:
          form.type === 'recurring'
            ? form.intervalValue * form.intervalUnit
            : undefined,
        runAt: parseOptionalTimestamp(form.runAt),
      })
      toast.success('Task created')
      resetForm()
      setIsOpen(false)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Create failed'))
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
              value={form.prompt}
              onChange={(event) => updateForm('prompt', event.target.value)}
            />
          </div>

          <TaskScheduleFields
            form={form}
            onTypeChange={(type) => updateForm('type', type)}
            onIntervalValueChange={(intervalValue) =>
              updateForm('intervalValue', intervalValue)
            }
            onIntervalUnitChange={(intervalUnit) =>
              updateForm('intervalUnit', intervalUnit)
            }
            onRunAtChange={(runAt) => updateForm('runAt', runAt)}
          />

          <Button
            className="w-full"
            disabled={!form.prompt.trim()}
            onClick={() => void submit()}
          >
            Create task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
