import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'

type PreferenceCardProps = {
  title?: string
  loading: boolean
  children: ReactNode
}

export function PreferenceCard({
  title,
  loading,
  children,
}: PreferenceCardProps) {
  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {loading ? <Skeleton className="h-9 w-full rounded-md" /> : children}
      </CardContent>
    </Card>
  )
}
