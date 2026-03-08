import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { AppSidebar } from '~/components/app-sidebar'
import { SiteHeader } from '~/components/site-header'
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar'
import { getCachedSession } from '~/lib/auth-client'

export const Route = createFileRoute('/dashboard')({
  component: DashboardLayout,
  pendingComponent: DashboardPending,
  beforeLoad: async ({ location }) => {
    if (typeof window === 'undefined') return
    const session = await getCachedSession()
    if (!session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
})

function DashboardLayout() {
  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <div className="mt-3">
          <SiteHeader />
          <div className="flex flex-1 flex-col gap-4 p-4 md:p-6 mt-3">
            <Outlet />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function DashboardPending() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  )
}
