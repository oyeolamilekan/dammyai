import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ResearchJob } from '~/components/dashboard/research/types'
import { ReportModal } from '~/components/dashboard/research/report-modal'
import { ResearchJobCard } from '~/components/dashboard/research/research-job-card'
import { getResearchLastModifiedAt } from '~/components/dashboard/research/types'
import { ListSkeleton } from '~/components/dashboard/shared/list-skeleton'
import { PaginationControls } from '~/components/dashboard/shared/pagination-controls'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
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
  const deleteResearch = useMutation(convexApi.research.deleteResearch)
  const deleteAllResearch = useMutation(convexApi.research.deleteAllResearch)
  const [selectedReport, setSelectedReport] =
    useState<SelectedResearchReport | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ResearchJob | null>(null)
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)
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

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const confirmDeleteResearch = async () => {
    if (!deleteTarget) {
      return
    }
    setIsDeleting(true)
    try {
      await deleteResearch({ id: deleteTarget._id })
      if (selectedReport?.id === deleteTarget._id) {
        setSelectedReport(null)
      }
      setDeleteTarget(null)
      toast.success('Research record deleted')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete research',
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const confirmDeleteAllResearch = async () => {
    setIsDeletingAll(true)
    try {
      await deleteAllResearch({})
      setPage(1)
      setSelectedReport(null)
      setDeleteAllDialogOpen(false)
      toast.success('All research records deleted')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete research',
      )
    } finally {
      setIsDeletingAll(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Research reports</CardTitle>
          <Dialog
            open={deleteAllDialogOpen}
            onOpenChange={setDeleteAllDialogOpen}
          >
            <DialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={jobs === undefined || jobs.length === 0}
              >
                <Trash2 className="size-4" />
                Delete all research
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete all research?</DialogTitle>
                <DialogDescription>
                  This permanently deletes every research record and report.
                  Running jobs may continue in the background, but deleted
                  records will no longer appear here.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" disabled={isDeletingAll}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={isDeletingAll}
                  onClick={() => void confirmDeleteAllResearch()}
                >
                  {isDeletingAll ? 'Deleting...' : 'Delete all research'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
                  onDelete={setDeleteTarget}
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

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete research record?</DialogTitle>
            <DialogDescription>
              This permanently deletes this research record and its report.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <p className="line-clamp-3 rounded-md border bg-muted/30 p-3 text-sm">
              {deleteTarget.prompt}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void confirmDeleteResearch()}
            >
              {isDeleting ? 'Deleting...' : 'Delete research'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
