import type { ArchivalMemoryItem } from './types'
import { Button } from '~/components/ui/button'

type ArchivalMemoryRowProps = {
  item: ArchivalMemoryItem
  onDelete: (id: string) => void
}

export function ArchivalMemoryRow({
  item,
  onDelete,
}: ArchivalMemoryRowProps) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <p className="text-sm">{item.content}</p>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => void onDelete(item.id)}
      >
        Delete
      </Button>
    </div>
  )
}
