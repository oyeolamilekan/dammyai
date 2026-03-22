import { useQuery } from 'convex/react'
import { Download, Share2, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '~/components/ui/dialog'
import { Skeleton } from '~/components/ui/skeleton'
import { api } from '~/lib/convex-api'

function downloadReportHtml(html: string, title: string) {
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
  const popup = window.open(url, '_blank')
  if (popup) {
    popup.onload = () => popup.print()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

type ReportModalProps = {
  jobId: string
  title: string
  lastModifiedAt?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReportModal({
  jobId,
  title,
  lastModifiedAt,
  open,
  onOpenChange,
}: ReportModalProps) {
  const convexApi = api as any
  const report = useQuery(
    convexApi.research.getResearchReport,
    open ? { id: jobId } : 'skip',
  ) as string | null | undefined

  const formattedDate = lastModifiedAt
    ? `Last modified: ${new Date(lastModifiedAt).toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        month: 'numeric',
        day: 'numeric',
      })}`
    : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] w-[95vw] max-w-7xl flex-col gap-0 overflow-hidden p-0 sm:max-w-7xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-lg">📄</span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-semibold">
                {title}
              </DialogTitle>
              {formattedDate && (
                <p className="text-xs text-muted-foreground">{formattedDate}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
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
                  onClick={() => downloadReportHtml(report, title)}
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

        <div className="flex-1 overflow-auto">
          {report === undefined ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-8 w-3/4 rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-2/3 rounded-md" />
            </div>
          ) : !report ? (
            <p className="p-6 text-sm text-muted-foreground">
              Report not available.
            </p>
          ) : (
            <div
              className="research-report prose prose-zinc max-w-none p-6 dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: report }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
