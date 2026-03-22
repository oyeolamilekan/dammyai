import { TaskExecutionLogs } from './task-execution-logs'
import { formatTaskInterval } from './task-utils'
import type { ScheduledTaskListItem } from './task-utils'
import { Button } from '~/components/ui/button'

type TaskListItemProps = {
  task: ScheduledTaskListItem
  isExpanded: boolean
  onToggleLogs: (taskId: string) => void
  onToggleEnabled: (task: ScheduledTaskListItem) => void
  onDelete: (taskId: string) => void
}

export function TaskListItem({
  task,
  isExpanded,
  onToggleLogs,
  onToggleEnabled,
  onDelete,
}: TaskListItemProps) {
  return (
    <div className="rounded-md border p-3">
      <p className="font-medium">{task.prompt}</p>
      <p className="text-muted-foreground text-xs">
        {task.type === 'recurring' && task.intervalMs
          ? `every ${formatTaskInterval(task.intervalMs)}`
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
          onClick={() => void onToggleEnabled(task)}
        >
          {task.enabled ? 'Pause' : 'Enable'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onToggleLogs(task.id)}
        >
          {isExpanded ? 'Hide logs' : 'View logs'}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => void onDelete(task.id)}
        >
          Delete
        </Button>
      </div>

      {isExpanded && <TaskExecutionLogs taskId={task.id} />}
    </div>
  )
}
