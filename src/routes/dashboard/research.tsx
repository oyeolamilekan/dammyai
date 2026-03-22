import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import type { ResearchJob } from '~/components/dashboard/research/types'
import { ReportModal } from '~/components/dashboard/research/report-modal'
import { ResearchJobCard } from '~/components/dashboard/research/research-job-card'
import { getResearchLastModifiedAt } from '~/components/dashboard/research/types'
import { ListSkeleton } from '~/components/dashboard/shared/list-skeleton'
import { PaginationControls } from '~/components/dashboard/shared/pagination-controls'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { api } from '~/lib/convex-api'
import { requireAuth } from '~/lib/require-auth'

export const Route = createFileRoute('/dashboard/research')({
  component: ResearchPage,
  beforeLoad: requireAuth,
})

const PAGE_SIZE = 10

type SelectedResearchReport = {
  id: string
  title: string
  lastModifiedAt: string | null
}

function ResearchPage() {
  const convexApi = api as any
  const jobs = useQuery(convexApi.research.listResearch) as
    | Array<ResearchJob>
    | undefined
  const [selectedReport, setSelectedReport] =
    useState<SelectedResearchReport | null>(null)
  const [page, setPage] = useState(1)

  const totalPages = jobs ? Math.ceil(jobs.length / PAGE_SIZE) : 0
  const paginatedJobs = useMemo(() => {
    if (!jobs) {
      return []
    }

    const startIndex = (page - 1) * PAGE_SIZE
    return jobs.slice(startIndex, startIndex + PAGE_SIZE)
  }, [jobs, page])

  const openReport = (job: ResearchJob) => {
    setSelectedReport({
      id: job._id,
      title: job.prompt,
      lastModifiedAt: getResearchLastModifiedAt(job),
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Research reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs === undefined ? (
            <ListSkeleton count={3} className="h-16 w-full rounded-md" />
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No research jobs yet.
            </p>
          ) : (
            <>
              {paginatedJobs.map((job) => (
                <ResearchJobCard
                  key={job._id}
                  job={job}
                  onViewReport={openReport}
                />
              ))}

              <PaginationControls
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      {selectedReport && (
        <ReportModal
          jobId={selectedReport.id}
          title={selectedReport.title}
          lastModifiedAt={selectedReport.lastModifiedAt}
          open={Boolean(selectedReport)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedReport(null)
            }
          }}
        />
      )}
    </div>
  )
}
