import * as React from 'react'
import {
  IconAdjustments,
  IconBrain,
  IconCalendarEvent,
  IconDashboard,
  IconInnerShadowTop,
  IconPlug,
  IconSearch,
  IconSettings,
  IconSparkles,
} from '@tabler/icons-react'

import { NavMain } from '~/components/nav-main'
import { NavSecondary } from '~/components/nav-secondary'
import { NavUser } from '~/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '~/components/ui/sidebar'

const navMain = [
  {
    title: 'Overview',
    url: '/dashboard',
    icon: IconDashboard,
    exact: true,
  },
  {
    title: 'Integrations',
    url: '/dashboard/integrations',
    icon: IconPlug,
    exact: false,
  },
  {
    title: 'Memories',
    url: '/dashboard/memories',
    icon: IconBrain,
    exact: false,
  },
  {
    title: 'Soul',
    url: '/dashboard/souls',
    icon: IconSparkles,
    exact: false,
  },
  {
    title: 'Tasks',
    url: '/dashboard/tasks',
    icon: IconCalendarEvent,
    exact: false,
  },
  {
    title: 'Research',
    url: '/dashboard/research',
    icon: IconSearch,
    exact: false,
  },
  {
    title: 'Preferences',
    url: '/dashboard/preferences',
    icon: IconAdjustments,
    exact: false,
  },
]

const navSecondary = [
  {
    title: 'Settings',
    url: '/dashboard/preferences',
    icon: IconSettings,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="/dashboard">
                <IconInnerShadowTop className="size-5!" />
                <span className="text-base font-semibold">DammyAI</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
