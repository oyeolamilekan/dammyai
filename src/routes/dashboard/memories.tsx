import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Skeleton } from '~/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'

export const Route = createFileRoute('/dashboard/memories')({
  component: MemoriesPage,
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

  const [factsPage, setFactsPage] = useState(1)
  const [archivalPage, setArchivalPage] = useState(1)
  const [convoPage, setConvoPage] = useState(1)

  const core = useQuery(convexApi.memories.listCoreMemories)
  const memories = useQuery(convexApi.memories.listMemories, {
    page: factsPage,
    limit: PAGE_SIZE,
  })
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
  const deleteMemory = useMutation(convexApi.memories.deleteMemory)
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
        <TabsTrigger value="core">Core</TabsTrigger>
        <TabsTrigger value="facts">Facts</TabsTrigger>
        <TabsTrigger value="archival">Archival</TabsTrigger>
        <TabsTrigger value="conversations">Conversations</TabsTrigger>
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
                    <p className="text-sm">
                      <strong>{item.key}</strong>: {item.value}
                    </p>
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

      <TabsContent value="facts">
        <Card>
          <CardContent className="space-y-2 pt-6">
            {memories === undefined ? (
              <ListSkeleton />
            ) : (memories?.items ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No facts stored yet.
              </p>
            ) : (
              (memories?.items ?? []).map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <p className="text-sm">{item.content}</p>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      void deleteMemory({ id: item.id }).catch((error) => {
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
            {memories && (
              <Pagination
                page={memories.page}
                totalPages={memories.totalPages}
                onPageChange={setFactsPage}
              />
            )}
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
              (conversations?.items ?? []).map((item: any) => (
                <div key={item.id} className="rounded-md border p-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    {item.role}
                  </p>
                  <p className="text-sm">{item.content}</p>
                </div>
              ))
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
