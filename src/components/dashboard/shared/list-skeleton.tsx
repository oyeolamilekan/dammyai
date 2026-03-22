import { Skeleton } from '~/components/ui/skeleton'

type ListSkeletonProps = {
  count?: number
  className?: string
}

export function ListSkeleton({
  count = 3,
  className = 'h-10 w-full rounded-md',
}: ListSkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className={className} />
      ))}
    </div>
  )
}
