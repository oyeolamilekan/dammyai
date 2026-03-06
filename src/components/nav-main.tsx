import { Link } from '@tanstack/react-router'
import type {Icon} from '@tabler/icons-react';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '~/components/ui/sidebar'

export function NavMain({
  items,
}: {
  items: Array<{
    title: string
    url: string
    icon?: Icon
    exact?: boolean
  }>
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2 mt-3">
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <Link
                to={item.url}
                activeOptions={{ exact: item.exact ?? false }}
              >
                {({ isActive }) => (
                  <SidebarMenuButton tooltip={item.title} isActive={isActive}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                )}
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
