import { Bot, User, Wrench } from 'lucide-react'
import Markdown from 'react-markdown'
import type { ConversationMessage } from './types'
import { Badge } from '~/components/ui/badge'

function getRolePresentation(role: ConversationMessage['role']) {
  if (role === 'user') {
    return {
      icon: User,
      containerClassName:
        'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40',
      textClassName: 'text-blue-600 dark:text-blue-400',
    }
  }

  if (role === 'assistant') {
    return {
      icon: Bot,
      containerClassName:
        'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40',
      textClassName: 'text-green-600 dark:text-green-400',
    }
  }

  return {
    icon: Wrench,
    containerClassName:
      'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
    textClassName: 'text-amber-600 dark:text-amber-400',
  }
}

function formatModelId(modelId: string) {
  return modelId.includes('/') ? modelId.split('/').pop() : modelId
}

type ConversationItemProps = {
  item: ConversationMessage
}

export function ConversationItem({ item }: ConversationItemProps) {
  const rolePresentation = getRolePresentation(item.role)
  const Icon = rolePresentation.icon
  const isAssistant = item.role === 'assistant'
  const isTool = item.role === 'tool'

  return (
    <div
      className={`rounded-md border p-3 ${rolePresentation.containerClassName}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <Icon className={`size-3.5 ${rolePresentation.textClassName}`} />
        <span
          className={`text-xs font-medium uppercase ${rolePresentation.textClassName}`}
        >
          {item.role}
        </span>
        {isTool && item.toolName && (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {item.toolName}
          </Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {new Date(item.createdAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>

      {isAssistant ? (
        <div className="prose prose-sm max-w-none wrap-break-words dark:prose-invert">
          <Markdown>{item.content}</Markdown>
        </div>
      ) : (
        <p className="wrap-break-words text-sm">{item.content}</p>
      )}

      {isAssistant && item.modelId && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {formatModelId(item.modelId)}
        </p>
      )}
      {isTool && item.searchProvider && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {item.searchProvider}
        </p>
      )}
    </div>
  )
}
