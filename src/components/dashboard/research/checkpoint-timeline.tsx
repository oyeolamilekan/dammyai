import type { ResearchCheckpoint } from './types'

const STEP_ICONS: Record<string, string> = {
  generating_queries: '🔎',
  searching: '🌐',
  extracting_learnings: '🧠',
  generating_report: '📝',
  sending_telegram: '📤',
  done: '✅',
}

type CheckpointTimelineProps = {
  checkpoints: Array<ResearchCheckpoint>
}

export function CheckpointTimeline({
  checkpoints,
}: CheckpointTimelineProps) {
  if (checkpoints.length === 0) {
    return null
  }

  return (
    <div className="space-y-1 pt-1">
      {checkpoints.map((checkpoint, index) => (
        <div key={index} className="flex items-start gap-2.5 text-xs">
          <span className="w-4 shrink-0 text-center leading-5">
            {checkpoint.status === 'running' ? (
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            ) : checkpoint.status === 'error' ? (
              '❌'
            ) : (
              (STEP_ICONS[checkpoint.step] ?? '✓')
            )}
          </span>
          <span
            className={
              checkpoint.status === 'running'
                ? 'text-foreground font-medium'
                : checkpoint.status === 'error'
                  ? 'text-red-500'
                  : 'text-muted-foreground'
            }
          >
            {checkpoint.message}
          </span>
        </div>
      ))}
    </div>
  )
}
