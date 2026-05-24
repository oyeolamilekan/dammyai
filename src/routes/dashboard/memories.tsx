import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Archive,
  Bot,
  Brain,
  MessageSquare,
  Trash2,
  User,
  Wrench,
} from 'lucide-react'
import Markdown from 'react-markdown'
import { api } from '../../../convex/_generated/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
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

type DeleteMemoryTarget = {
  id: string
  type: 'core' | 'archival'
  label: string
}

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
  const deleteAllMemories = useMutation(convexApi.memories.deleteAllMemories)

  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteMemoryTarget | null>(
    null,
  )
  const [isDeletingMemory, setIsDeletingMemory] = useState(false)
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)

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

  const hasMemories =
    (core?.length ?? 0) > 0 ||
    (archival?.total ?? 0) > 0 ||
    (conversations?.total ?? 0) > 0

  const deleteEveryMemory = async () => {
    setIsDeletingAll(true)
    try {
      await deleteAllMemories({})
      setArchivalPage(1)
      setConvoPage(1)
      setDeleteAllDialogOpen(false)
      toast.success('All memories deleted')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete memories',
      )
    } finally {
      setIsDeletingAll(false)
    }
  }

  const deleteSelectedMemory = async () => {
    if (!deleteTarget) {
      return
    }

    setIsDeletingMemory(true)
    try {
      if (deleteTarget.type === 'core') {
        await deleteCore({ id: deleteTarget.id })
      } else {
        await deleteArchival({ id: deleteTarget.id })
      }
      setDeleteTarget(null)
      toast.success('Memory deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed')
    } finally {
      setIsDeletingMemory(false)
    }
  }

  return (
    <Tabs defaultValue="core" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <Dialog
          open={deleteAllDialogOpen}
          onOpenChange={setDeleteAllDialogOpen}
        >
          <DialogTrigger asChild>
            <Button variant="destructive" disabled={!hasMemories}>
              <Trash2 className="size-4" />
              Delete all memories
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete all memories?</DialogTitle>
              <DialogDescription>
                This permanently deletes your core memories, archival memories,
                and conversation history. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={isDeletingAll}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={isDeletingAll}
                onClick={() => void deleteEveryMemory()}
              >
                {isDeletingAll ? 'Deleting...' : 'Delete all memories'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
                      onClick={() =>
                        setDeleteTarget({
                          id: item.id,
                          type: 'core',
                          label: `${item.key}: ${item.value}`,
                        })
                      }
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
                    onClick={() =>
                      setDeleteTarget({
                        id: item.id,
                        type: 'archival',
                        label: item.content,
                      })
                    }
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
                      <div className="prose prose-sm dark:prose-invert max-w-none wrap-break-words">
                        <Markdown>{item.content}</Markdown>
                      </div>
                    ) : (
                      <p className="text-sm wrap-break-words">{item.content}</p>
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

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete memory?</DialogTitle>
            <DialogDescription>
              This permanently deletes this memory. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <p className="line-clamp-3 rounded-md border bg-muted/30 p-3 text-sm">
              {deleteTarget.label}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeletingMemory}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={isDeletingMemory}
              onClick={() => void deleteSelectedMemory()}
            >
              {isDeletingMemory ? 'Deleting...' : 'Delete memory'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}
