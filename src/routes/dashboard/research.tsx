import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState } from 'react'
import { Download, Share2, X } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog'
import { requireAuth } from '~/lib/require-auth'

export const Route = createFileRoute('/dashboard/research')({
  component: ResearchPage,
  beforeLoad: requireAuth,
})

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    completed:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  }
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-800'}`}
    >
      {status}
    </span>
  )
}

function downloadReport(html: string, title: string) {
  // Wrap the raw report HTML in a styled document for printing
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.6; color: #333; }
  h1, h2, h3 { color: #2c3e50; margin-top: 24px; }
  h1 { border-bottom: 3px solid #3498db; padding-bottom: 12px; }
  h2 { border-bottom: 1px solid #bdc3c7; padding-bottom: 8px; }
  p { margin-bottom: 12px; }
  ul, ol { margin-left: 20px; margin-bottom: 12px; }
  li { margin-bottom: 6px; }
  blockquote { border-left: 4px solid #3498db; margin: 16px 0; padding: 12px 16px; background: #f8f9fa; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #bdc3c7; padding: 10px; text-align: left; }
  th { background: #ecf0f1; font-weight: bold; }
</style>
</head>
<body>${html}</body>
</html>`
  const blob = new Blob([fullHtml], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank')
  if (w) {
    w.onload = () => w.print()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** Lazy-loads the full report and displays it in a modal. */
function ReportModal({
  jobId,
  title,
  lastModified,
  open,
  onOpenChange,
}: {
  jobId: string
  title: string
  lastModified?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const convexApi = api as any
  const report = useQuery(
    convexApi.research.getResearchReport,
    open ? { id: jobId } : 'skip',
  )

  const formattedDate = lastModified
    ? `Last modified: ${new Date(lastModified).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' })}`
    : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col h-[90vh] w-[95vw] max-w-7xl sm:max-w-7xl p-0 gap-0 overflow-hidden"
      >
        {/* Title bar */}
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg shrink-0">📄</span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-semibold">
                {title}
              </DialogTitle>
              {formattedDate && (
                <p className="text-xs text-muted-foreground">{formattedDate}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {report && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    navigator.clipboard.writeText(report)
                  }}
                  title="Copy report"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => downloadReport(report, title)}
                  title="Save as PDF"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Report content */}
        <div className="flex-1 overflow-auto">
          {report === undefined ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-3/4 rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-2/3 rounded-md" />
            </div>
          ) : !report ? (
            <p className="text-muted-foreground text-sm p-6">
              Report not available.
            </p>
          ) : (
            <div
              className="research-report prose prose-zinc dark:prose-invert max-w-none p-6"
              dangerouslySetInnerHTML={{ __html: report }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface Checkpoint {
  step: string
  message: string
  timestamp: number
  status: 'running' | 'done' | 'error'
}

const STEP_ICONS: Record<string, string> = {
  generating_queries: '🔎',
  searching: '🌐',
  extracting_learnings: '🧠',
  generating_report: '📝',
  sending_telegram: '📤',
  done: '✅',
}

function CheckpointTimeline({
  checkpoints,
}: {
  checkpoints: Array<Checkpoint>
}) {
  if (checkpoints.length === 0) return null

  return (
    <div className="space-y-1 pt-1">
      {checkpoints.map((cp, i) => (
        <div key={i} className="flex items-start gap-2.5 text-xs">
          <span className="shrink-0 w-4 text-center leading-5">
            {cp.status === 'running' ? (
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            ) : cp.status === 'error' ? (
              '❌'
            ) : (
              (STEP_ICONS[cp.step] ?? '✓')
            )}
          </span>
          <span
            className={
              cp.status === 'running'
                ? 'text-foreground font-medium'
                : cp.status === 'error'
                  ? 'text-red-500'
                  : 'text-muted-foreground'
            }
          >
            {cp.message}
          </span>
        </div>
      ))}
    </div>
  )
}

const PAGE_SIZE = 10

function ResearchPage() {
  const convexApi = api as any
  const jobs = useQuery(convexApi.research.listResearch)
  const [selectedJob, setSelectedJob] = useState<{
    id: string
    title: string
    lastModified?: number
  } | null>(null)
  const [stepsVisible, setStepsVisible] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const totalPages = jobs ? Math.ceil(jobs.length / PAGE_SIZE) : 0
  const paginatedJobs = jobs?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Research reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No research jobs yet.
            </p>
          ) : (
            <>
              {paginatedJobs?.map((job: any) => (
                <div key={job._id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-sm leading-snug">
                      {job.prompt}
                    </p>
                    <StatusBadge status={job.status} />
                  </div>

                  {(job.status === 'running' || job.status === 'pending') &&
                    job.checkpoints?.length > 0 && (
                      <CheckpointTimeline checkpoints={job.checkpoints} />
                    )}

                  {job.status === 'running' &&
                    (!job.checkpoints || job.checkpoints.length === 0) && (
                      <p className="text-muted-foreground text-xs animate-pulse">
                        🔍 Deep research in progress — searching the web,
                        analyzing sources...
                      </p>
                    )}

                  {job.summary && (
                    <p className="text-muted-foreground text-sm line-clamp-2">
                      {job.summary}
                    </p>
                  )}

                  {job.error && (
                    <p className="text-xs text-red-600">❌ {job.error}</p>
                  )}

                  {job.hasReport && job.status === 'completed' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSelectedJob({
                              id: job._id,
                              title: job.prompt,
                              lastModified: job._creationTime,
                            })
                          }
                        >
                          View report
                        </Button>
                        {job.checkpoints?.length > 0 && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground cursor-pointer hover:text-foreground"
                            onClick={() =>
                              setStepsVisible(
                                stepsVisible === job._id ? null : job._id,
                              )
                            }
                          >
                            {stepsVisible === job._id ? '▾' : '▸'} View steps (
                            {job.checkpoints.length})
                          </button>
                        )}
                      </div>
                      {stepsVisible === job._id &&
                        job.checkpoints?.length > 0 && (
                          <CheckpointTimeline checkpoints={job.checkpoints} />
                        )}
                    </div>
                  )}
                </div>
              ))}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selectedJob && (
        <ReportModal
          jobId={selectedJob.id}
          title={selectedJob.title}
          lastModified={selectedJob.lastModified}
          open={!!selectedJob}
          onOpenChange={(open) => {
            if (!open) setSelectedJob(null)
          }}
        />
      )}
    </div>
  )
}
