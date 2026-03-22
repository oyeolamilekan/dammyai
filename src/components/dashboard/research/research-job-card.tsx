import { useState } from 'react'
import { CheckpointTimeline } from './checkpoint-timeline'
import { StatusBadge } from './status-badge'
import type { ResearchJob } from './types'
import { Button } from '~/components/ui/button'

type ResearchJobCardProps = {
  job: ResearchJob
  onViewReport: (job: ResearchJob) => void
}

export function ResearchJobCard({
  job,
  onViewReport,
}: ResearchJobCardProps) {
  const [showSteps, setShowSteps] = useState(false)

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug">{job.prompt}</p>
        <StatusBadge status={job.status} />
      </div>

      {(job.status === 'running' || job.status === 'pending') &&
        job.checkpoints.length > 0 && (
          <CheckpointTimeline checkpoints={job.checkpoints} />
        )}

      {job.status === 'running' && job.checkpoints.length === 0 && (
        <p className="animate-pulse text-xs text-muted-foreground">
          🔍 Deep research in progress — searching the web, analyzing
          sources...
        </p>
      )}

      {job.summary && (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {job.summary}
        </p>
      )}

      {job.error && <p className="text-xs text-red-600">❌ {job.error}</p>}

      {job.hasReport && job.status === 'completed' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewReport(job)}
            >
              View report
            </Button>
            {job.checkpoints.length > 0 && (
              <button
                type="button"
                className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowSteps((current) => !current)}
              >
                {showSteps ? '▾' : '▸'} View steps ({job.checkpoints.length})
              </button>
            )}
          </div>

          {showSteps && job.checkpoints.length > 0 && (
            <CheckpointTimeline checkpoints={job.checkpoints} />
          )}
        </div>
      )}
    </div>
  )
}
