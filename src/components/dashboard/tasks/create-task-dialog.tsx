import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  TASK_INTERVAL_UNITS,
  TASK_WEEKDAY_OPTIONS,
} from './task-utils'
import type {
  ScheduledTaskType,
  TaskScheduleKind,
  TaskWeekday,
} from './task-utils'
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
  recurrenceMode: TaskScheduleKind
  intervalValue: number
  intervalUnit: number
  weekdays: Array<TaskWeekday>
  timeOfDay: string
  runAt: string
}

const initialCreateTaskFormState: CreateTaskFormState = {
  prompt: '',
  type: 'recurring',
  recurrenceMode: 'interval',
  intervalValue: 60,
  intervalUnit: 60_000,
  weekdays: ['monday'],
  timeOfDay: '09:00',
  runAt: '',
}

function parseOptionalTimestamp(value: string) {
  const timestamp = value ? new Date(value).getTime() : undefined
  return timestamp && !Number.isNaN(timestamp) ? timestamp : undefined
}

function getBrowserTimezone() {
  if (typeof window === 'undefined') {
    return 'UTC'
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

type TaskScheduleFieldsProps = {
  form: CreateTaskFormState
  onTypeChange: (type: ScheduledTaskType) => void
  onRecurrenceModeChange: (mode: TaskScheduleKind) => void
  onIntervalValueChange: (value: number) => void
  onIntervalUnitChange: (value: number) => void
  onToggleWeekday: (weekday: TaskWeekday) => void
  onTimeOfDayChange: (value: string) => void
  onRunAtChange: (value: string) => void
  scheduleTimezone: string
  isUsingSavedTimezone: boolean
}

function TaskScheduleFields({
  form,
  onTypeChange,
  onRecurrenceModeChange,
  onIntervalValueChange,
  onIntervalUnitChange,
  onToggleWeekday,
  onTimeOfDayChange,
  onRunAtChange,
  scheduleTimezone,
  isUsingSavedTimezone,
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
            <Label htmlFor="task-recurrence-mode">Repeat by</Label>
            <select
              id="task-recurrence-mode"
              value={form.recurrenceMode}
              onChange={(event) =>
                onRecurrenceModeChange(event.target.value as TaskScheduleKind)
              }
              className={taskTypeSelectClassName}
            >
              <option value="interval">Fixed interval</option>
              <option value="weekday">Specific weekdays</option>
            </select>
          </div>

          {form.recurrenceMode === 'interval' ? (
            <>
              <div className="space-y-2">
                <Label>Repeat every</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={form.intervalValue}
                    onChange={(event) =>
                      onIntervalValueChange(
                        Math.max(1, Number(event.target.value)),
                      )
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
            <>
              <div className="space-y-2">
                <Label>Run on</Label>
                <div className="flex flex-wrap gap-2">
                  {TASK_WEEKDAY_OPTIONS.map((weekday) => {
                    const isSelected = form.weekdays.includes(weekday.value)

                    return (
                      <Button
                        key={weekday.value}
                        type="button"
                        size="sm"
                        variant={isSelected ? 'default' : 'outline'}
                        onClick={() => onToggleWeekday(weekday.value)}
                      >
                        {weekday.shortLabel}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="weekday-time">Time</Label>
                <Input
                  id="weekday-time"
                  type="time"
                  value={form.timeOfDay}
                  onChange={(event) => onTimeOfDayChange(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Runs using{' '}
                  {isUsingSavedTimezone ? 'your saved timezone' : 'your browser timezone'}:{' '}
                  {scheduleTimezone}
                </p>
              </div>
            </>
          )}
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
  const soul = useQuery(convexApi.soul.getSoul) as
    | { timezone: string | null }
    | null
    | undefined

  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState<CreateTaskFormState>(
    initialCreateTaskFormState,
  )

  const scheduleTimezone = soul?.timezone ?? getBrowserTimezone()
  const isUsingSavedTimezone = Boolean(soul?.timezone)

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

  const toggleWeekday = (weekday: TaskWeekday) => {
    setForm((current) => ({
      ...current,
      weekdays: current.weekdays.includes(weekday)
        ? current.weekdays.filter((value) => value !== weekday)
        : [...current.weekdays, weekday],
    }))
  }

  const isSubmitDisabled =
    !form.prompt.trim() ||
    (form.type === 'one_off' && !form.runAt) ||
    (form.type === 'recurring' &&
      form.recurrenceMode === 'weekday' &&
      (form.weekdays.length === 0 || !form.timeOfDay))

  const submit = async () => {
    try {
      await createTask({
        prompt: form.prompt,
        type: form.type,
        intervalMs:
          form.type === 'recurring' && form.recurrenceMode === 'interval'
            ? form.intervalValue * form.intervalUnit
            : undefined,
        weekdays:
          form.type === 'recurring' && form.recurrenceMode === 'weekday'
            ? form.weekdays
            : undefined,
        timeOfDay:
          form.type === 'recurring' && form.recurrenceMode === 'weekday'
            ? form.timeOfDay
            : undefined,
        scheduleTimezone:
          form.type === 'recurring' && form.recurrenceMode === 'weekday'
            ? scheduleTimezone
            : undefined,
        runAt:
          form.type === 'one_off' || form.recurrenceMode === 'interval'
            ? parseOptionalTimestamp(form.runAt)
            : undefined,
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
            onRecurrenceModeChange={(recurrenceMode) =>
              updateForm('recurrenceMode', recurrenceMode)
            }
            onIntervalValueChange={(intervalValue) =>
              updateForm('intervalValue', intervalValue)
            }
            onIntervalUnitChange={(intervalUnit) =>
              updateForm('intervalUnit', intervalUnit)
            }
            onToggleWeekday={toggleWeekday}
            onTimeOfDayChange={(timeOfDay) => updateForm('timeOfDay', timeOfDay)}
            onRunAtChange={(runAt) => updateForm('runAt', runAt)}
            scheduleTimezone={scheduleTimezone}
            isUsingSavedTimezone={isUsingSavedTimezone}
          />

          <Button
            className="w-full"
            disabled={isSubmitDisabled}
            onClick={() => void submit()}
          >
            Create task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
