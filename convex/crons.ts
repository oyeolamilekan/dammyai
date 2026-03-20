import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'process due scheduled tasks',
  { minutes: 1 },
  internal.tasks.runDueTasks,
  {},
)

crons.interval(
  'process pending research jobs',
  { minutes: 1 },
  internal.research.processPendingResearch,
  {},
)

crons.interval(
  'refresh expiring Google OAuth tokens',
  { minutes: 30 },
  internal.googleTokenRefresh.refreshExpiringGoogleTokens,
  {},
)

export default crons
