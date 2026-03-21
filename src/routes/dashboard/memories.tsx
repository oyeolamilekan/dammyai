import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Archive,
  Bot,
  Brain,
  MessageSquare,
  User,
  Wrench,
} from 'lucide-react'
import Markdown from 'react-markdown'
import { api } from '../../../convex/_generated/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Skeleton } from '~/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { requireAuth } from '~/lib/require-auth'

export const Route = createFileRoute('/dashboard/memories')({
  component: MemoriesPage,
  beforeLoad: requireAuth,
})

const PAGE_SIZE = 20

function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-md" />
      ))}
    </div>
  )
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between pt-3">
      <p className="text-muted-foreground text-xs">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

function MemoriesPage() {
  const convexApi = api as any

  const [archivalPage, setArchivalPage] = useState(1)
  const [convoPage, setConvoPage] = useState(1)

  const core = useQuery(convexApi.memories.listCoreMemories)
  const archival = useQuery(convexApi.memories.listArchivalMemories, {
    page: archivalPage,
    limit: PAGE_SIZE,
  })
  const conversations = useQuery(convexApi.memories.listConversations, {
    page: convoPage,
    limit: PAGE_SIZE,
  })

  const upsertCore = useMutation(convexApi.memories.createOrUpdateCoreMemory)
  const deleteCore = useMutation(convexApi.memories.deleteCoreMemory)
  const deleteArchival = useMutation(convexApi.memories.deleteArchivalMemory)

  const [key, setKey] = useState('')
  const [value, setValue] = useState('')

  const addCoreMemory = async () => {
    try {
      await upsertCore({ key, value })
      setKey('')
      setValue('')
      toast.success('Core memory saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    }
  }

  return (
    <Tabs defaultValue="core" className="space-y-4">
      <TabsList>
        <TabsTrigger value="core">
          <Brain className="size-4" /> Core
        </TabsTrigger>
        <TabsTrigger value="archival">
          <Archive className="size-4" /> Archival
        </TabsTrigger>
        <TabsTrigger value="conversations">
          <MessageSquare className="size-4" /> Conversations
        </TabsTrigger>
      </TabsList>

      <TabsContent value="core">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="memory-key">Key</Label>
                <Input
                  id="memory-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memory-value">Value</Label>
                <Input
                  id="memory-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={() => void addCoreMemory()}>
              Save core memory
            </Button>
            <div className="space-y-2">
              {core === undefined ? (
                <ListSkeleton />
              ) : core.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No core memories yet.
                </p>
              ) : (
                core.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-md border p-2"
                  >
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
                      onClick={() => {
                        void deleteCore({ id: item.id })
                          .then(() => toast.success('Deleted'))
                          .catch((error) => {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : 'Delete failed',
                            )
                          })
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="archival">
        <Card>
          <CardContent className="space-y-2 pt-6">
            {archival === undefined ? (
              <ListSkeleton />
            ) : (archival?.items ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No archival memories yet.
              </p>
            ) : (
              (archival?.items ?? []).map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <p className="text-sm">{item.content}</p>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      void deleteArchival({ id: item.id }).catch((error) => {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : 'Delete failed',
                        )
                      })
                    }}
                  >
                    Delete
                  </Button>
                </div>
              ))
            )}
            {archival && (
              <Pagination
                page={archival.page}
                totalPages={archival.totalPages}
                onPageChange={setArchivalPage}
              />
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="conversations">
        <Card>
          <CardContent className="space-y-2 pt-6">
            {conversations === undefined ? (
              <ListSkeleton />
            ) : (conversations?.items ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No conversations yet.
              </p>
            ) : (
              (conversations?.items ?? []).map((item: any) => {
                const isUser = item.role === 'user'
                const isAssistant = item.role === 'assistant'
                const isTool = item.role === 'tool'

                return (
                  <div
                    key={item.id}
                    className={`rounded-md border p-3 ${
                      isUser
                        ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40'
                        : isAssistant
                          ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40'
                          : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      {isUser && (
                        <User className="size-3.5 text-blue-600 dark:text-blue-400" />
                      )}
                      {isAssistant && (
                        <Bot className="size-3.5 text-green-600 dark:text-green-400" />
                      )}
                      {isTool && (
                        <Wrench className="size-3.5 text-amber-600 dark:text-amber-400" />
                      )}
                      <span
                        className={`text-xs font-medium uppercase ${
                          isUser
                            ? 'text-blue-600 dark:text-blue-400'
                            : isAssistant
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {item.role}
                      </span>
                      {isTool && item.toolName && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
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
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        <Markdown>{item.content}</Markdown>
                      </div>
                    ) : (
                      <p className="text-sm break-words">{item.content}</p>
                    )}
                    {isAssistant && item.modelId && (
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {item.modelId.includes('/')
                          ? item.modelId.split('/').pop()
                          : item.modelId}
                      </p>
                    )}
                    {isTool && item.searchProvider && (
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {item.searchProvider}
                      </p>
                    )}
                  </div>
                )
              })
            )}
            {conversations && (
              <Pagination
                page={conversations.page}
                totalPages={conversations.totalPages}
                onPageChange={setConvoPage}
              />
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
