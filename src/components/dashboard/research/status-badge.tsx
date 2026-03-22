import { RESEARCH_STATUS_CLASS_NAMES } from './types'
import type { ResearchJobStatus } from './types'

type StatusBadgeProps = {
  status: ResearchJobStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RESEARCH_STATUS_CLASS_NAMES[status]}`}
    >
      {status}
    </span>
  )
}
