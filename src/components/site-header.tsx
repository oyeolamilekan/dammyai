import { useMatches } from "@tanstack/react-router"
import { Separator } from "~/components/ui/separator"
import { SidebarTrigger } from "~/components/ui/sidebar"
import { ThemeToggle } from "~/components/theme-toggle"

const routeTitles: Record<string, string> = {
  "/dashboard/": "Overview",
  "/dashboard/integrations": "Integrations",
  "/dashboard/memories": "Memories",
  "/dashboard/souls": "Soul",
  "/dashboard/tasks": "Tasks",
  "/dashboard/research": "Research",
  "/dashboard/preferences": "Preferences",
}

export function SiteHeader() {
  const matches = useMatches()
  const lastMatch = matches[matches.length - 1]
  const title = routeTitles[lastMatch.fullPath] ?? "Dashboard"

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
