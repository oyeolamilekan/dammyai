export type ResearchCheckpoint = {
  step: string
  message: string
  timestamp: number
  status: 'running' | 'done' | 'error'
}

export type ResearchJobStatus = 'pending' | 'running' | 'completed' | 'failed'

export type ResearchJob = {
  _id: string
  prompt: string
  status: ResearchJobStatus
  summary: string | null
  hasReport: boolean
  checkpoints: Array<ResearchCheckpoint>
  error: string | null
  createdAt: string
  completedAt: string | null
}

export const RESEARCH_STATUS_CLASS_NAMES: Record<ResearchJobStatus, string> = {
  pending:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

export function getResearchLastModifiedAt(job: ResearchJob) {
  return job.completedAt ?? job.createdAt
}
