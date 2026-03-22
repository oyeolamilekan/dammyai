import { useQuery } from 'convex/react'
import { useState } from 'react'
import { TASK_LOG_STATUS_CLASS_NAMES } from './task-utils'
import type {
  TaskExecutionLogDetail,
  TaskExecutionLogSummary,
} from './task-utils'
import { Badge } from '~/components/ui/badge'
import { Separator } from '~/components/ui/separator'
import { Skeleton } from '~/components/ui/skeleton'
import { api } from '~/lib/convex-api'

type LogDetailProps = {
  logId: string
}

function LogDetail({ logId }: LogDetailProps) {
  const convexApi = api as any
  const detail = useQuery(convexApi.taskLogs.getTaskLogDetail, {
    logId,
  }) as TaskExecutionLogDetail | null | undefined

  if (detail === undefined) {
    return <Skeleton className="mx-2 mb-2 h-12 rounded" />
  }

  if (!detail) {
    return <p className="text-muted-foreground px-2 pb-2">Log not found.</p>
  }

  return (
    <div className="space-y-2 px-2 pb-2">
      <Separator />

      {detail.steps.length > 0 ? (
        <div className="space-y-1.5">
          {detail.steps.map((step) => (
            <div
              key={step.toolCallId}
              className="bg-muted/30 rounded p-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {step.toolName}
                </Badge>
                <span className="text-muted-foreground">
                  {new Date(step.timestamp).toLocaleTimeString()}
                </span>
              </div>

              <details className="mt-1">
                <summary className="text-muted-foreground cursor-pointer">
                  Input / Output
                </summary>
                <pre className="text-muted-foreground mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-black/5 p-1 dark:bg-white/5">
                  <strong>Input:</strong> {step.input}
                </pre>
                <pre className="text-muted-foreground mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-black/5 p-1 dark:bg-white/5">
                  <strong>Output:</strong> {step.output}
                </pre>
              </details>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No tool calls recorded.</p>
      )}

      {detail.result && (
        <div className="rounded bg-black/5 p-2 text-xs dark:bg-white/5">
          <p className="font-medium">Result</p>
          <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">
            {detail.result}
          </p>
        </div>
      )}

      {detail.error && (
        <div className="rounded bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-400">
          <p className="font-medium">Error</p>
          <p className="mt-0.5">{detail.error}</p>
        </div>
      )}
    </div>
  )
}

type TaskExecutionLogsProps = {
  taskId: string
}

export function TaskExecutionLogs({ taskId }: TaskExecutionLogsProps) {
  const convexApi = api as any
  const logs = useQuery(convexApi.taskLogs.listTaskLogs, {
    taskId,
    limit: 10,
  }) as Array<TaskExecutionLogSummary> | undefined
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  if (logs === undefined) {
    return <Skeleton className="mt-2 h-8 w-full rounded" />
  }

  if (logs.length === 0) {
    return (
      <p className="text-muted-foreground mt-2 text-xs">No executions yet.</p>
    )
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="text-muted-foreground text-xs font-medium">
        Recent executions
      </p>

      {logs.map((log) => (
        <div key={log.id} className="rounded border text-xs">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/50"
            onClick={() =>
              setExpandedLogId((current) =>
                current === log.id ? null : log.id,
              )
            }
          >
            <Badge
              variant="secondary"
              className={`text-[10px] ${TASK_LOG_STATUS_CLASS_NAMES[log.status]}`}
            >
              {log.status}
            </Badge>
            <span className="text-muted-foreground">
              {new Date(log.startedAt).toLocaleString()}
            </span>
            <span className="text-muted-foreground">
              {log.stepCount} tool{log.stepCount !== 1 ? 's' : ''}
            </span>
            {log.toolsUsed.length > 0 && (
              <span className="text-muted-foreground truncate">
                ({log.toolsUsed.join(', ')})
              </span>
            )}
            <span className="ml-auto text-muted-foreground">
              {expandedLogId === log.id ? '▲' : '▼'}
            </span>
          </button>

          {expandedLogId === log.id && <LogDetail logId={log.id} />}
        </div>
      ))}
    </div>
  )
}
