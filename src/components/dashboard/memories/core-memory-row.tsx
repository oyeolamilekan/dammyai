import type { CoreMemoryItem } from './types'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'

type CoreMemoryRowProps = {
  item: CoreMemoryItem
  onDelete: (id: string) => void
}

export function CoreMemoryRow({ item, onDelete }: CoreMemoryRowProps) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <div className="flex items-center gap-2">
        <p className="text-sm">
          <strong>{item.key}</strong>: {item.value}
        </p>
        {item.source && item.source !== 'user' && (
          <Badge variant="outline" className="text-[10px]">
            {item.source}
          </Badge>
        )}
      </div>
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
