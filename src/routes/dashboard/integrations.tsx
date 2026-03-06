import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  IconBrandTelegram,
  IconCalendar,
  IconChecklist,
  IconMail,
  IconNotebook,
} from '@tabler/icons-react'

import { api } from '../../../convex/_generated/api'
import { getCachedSession } from '~/lib/auth-client'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Skeleton } from '~/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL as string

const oauthProviderPaths: Record<string, string> = {
  gmail: 'gmail',
  google_calendar: 'google-calendar',
  todoist: 'todoist',
  notion: 'notion',
}

export const Route = createFileRoute('/dashboard/integrations')({
  component: IntegrationsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    success: (search.success as string | undefined) ?? undefined,
    error: (search.error as string | undefined) ?? undefined,
  }),
})

const connectors = [
  {
    id: 'telegram' as const,
    label: 'Telegram',
    description: 'Connect your Telegram account to chat with DammyAI directly',
    type: 'telegram' as const,
    icon: IconBrandTelegram,
  },
  {
    id: 'gmail' as const,
    label: 'Gmail',
    description:
      'Draft replies, search your inbox, and summarize email threads instantly',
    type: 'oauth' as const,
    icon: IconMail,
  },
  {
    id: 'google_calendar' as const,
    label: 'Google Calendar',
    description:
      'Understand your schedule, manage events, and optimize your time effectively',
    type: 'oauth' as const,
    icon: IconCalendar,
  },
  {
    id: 'todoist' as const,
    label: 'Todoist',
    description:
      'Check todos, add tasks, and manage your productivity with ease',
    type: 'oauth' as const,
    icon: IconChecklist,
  },
  {
    id: 'notion' as const,
    label: 'Notion',
    description:
      'Search workspace content, update notes, and automate workflows in Notion',
    type: 'oauth' as const,
    icon: IconNotebook,
  },
] as const

type ConnectorId = (typeof connectors)[number]['id']

function IntegrationsPage() {
  const convexApi = api as any
  const integrations = useQuery(convexApi.integrations.listIntegrations)
  const upsertIntegration = useMutation(
    convexApi.integrations.upsertIntegration,
  )
  const deleteIntegration = useMutation(
    convexApi.integrations.deleteIntegration,
  )
  const createTelegramLink = useMutation(
    convexApi.integrations.createTelegramLink,
  )

  const { success, error: oauthError } = Route.useSearch()

  const [selected, setSelected] = useState<ConnectorId | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [telegramLink, setTelegramLink] = useState<string | null>(null)
  const [telegramCode, setTelegramCode] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (success) toast.success(`${success} connected successfully`)
    if (oauthError) toast.error(`OAuth failed: ${oauthError}`)
  }, [success, oauthError])

  const connector = useMemo(
    () => connectors.find((c) => c.id === selected),
    [selected],
  )

  const getStatus = (id: string) => {
    if (!integrations) return null
    const int = integrations.find((i: any) => i.provider === id)
    if (!int) return null
    if (id === 'telegram' && int.telegramChatId) return 'linked'
    if (id === 'telegram') return 'pending'
    if (int.accessToken || int.apiKey) return 'connected'
    return 'configured'
  }

  const connectOAuth = async (providerId: ConnectorId) => {
    const path = oauthProviderPaths[providerId]
    if (!path || !CONVEX_SITE_URL) return
    const session = await getCachedSession()
    const userId = session?.user?.id
    if (!userId) {
      toast.error('Please sign in first')
      return
    }
    window.open(
      `${CONVEX_SITE_URL}/api/integrations/${path}/auth?userId=${encodeURIComponent(userId)}`,
      '_self',
    )
  }

  const generateLink = async () => {
    try {
      await fetch(`${CONVEX_SITE_URL}/api/telegram/register-webhook`, {
        method: 'POST',
      }).catch(() => {})
      const result = await createTelegramLink()
      setTelegramLink(result.telegramUrl)
      setTelegramCode(result.linkingCode)
      toast.success('Telegram link generated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link')
    }
  }

  const removeProvider = async (providerId: ConnectorId) => {
    try {
      await deleteIntegration({ provider: providerId })
      toast.success('Integration removed')
      setSelected(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed')
    }
  }

  const saveApiKey = async () => {
    if (!selected || !apiKey.trim()) return
    try {
      await upsertIntegration({ provider: selected, apiKey: apiKey.trim() })
      toast.success('Integration saved')
      setSelected(null)
      setApiKey('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    }
  }

  const filtered = connectors.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connectors</h2>
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {!integrations ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((c) => {
              const status = getStatus(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelected(c.id)
                    setApiKey('')
                    setTelegramLink(null)
                    setTelegramCode(null)
                  }}
                  className="flex items-start gap-4 rounded-xl border p-4 text-left transition-colors hover:bg-accent"
                >
                  <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <c.icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{c.label}</p>
                      {status === 'connected' || status === 'linked' ? (
                        <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900 dark:text-green-300">
                          Connected
                        </span>
                      ) : status === 'pending' ? (
                        <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
                          Pending
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">
                      {c.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {connector && (
                <>
                  <div className="bg-muted flex size-8 items-center justify-center rounded-lg">
                    <connector.icon className="size-4" />
                  </div>
                  {connector.label}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {connector && (
            <div className="space-y-4 pt-2">
              <p className="text-muted-foreground text-sm">
                {connector.description}
              </p>

              {connector.type === 'oauth' && (
                <div className="space-y-3">
                  <p className="text-sm">
                    {getStatus(connector.id) === 'connected'
                      ? '✅ Connected'
                      : 'Not connected'}
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => void connectOAuth(connector.id)}>
                      {getStatus(connector.id) === 'connected'
                        ? 'Reconnect'
                        : 'Connect'}
                    </Button>
                    {getStatus(connector.id) && (
                      <Button
                        variant="destructive"
                        onClick={() => void removeProvider(connector.id)}
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {connector.type === 'api_key' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API key</Label>
                    <Input
                      id="apiKey"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your API key"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={!apiKey.trim()}
                      onClick={() => void saveApiKey()}
                    >
                      Save
                    </Button>
                    {getStatus(connector.id) && (
                      <Button
                        variant="destructive"
                        onClick={() => void removeProvider(connector.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {connector.type === 'telegram' && (
                <div className="space-y-3">
                  {getStatus('telegram') === 'linked' ? (
                    <p className="text-sm text-green-600">✅ Telegram linked</p>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Generate a link, open Telegram, then send{' '}
                      <code>/start {'<code>'}</code>.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void generateLink()}
                    >
                      Generate link
                    </Button>
                    {getStatus('telegram') && (
                      <Button
                        variant="destructive"
                        onClick={() => void removeProvider('telegram')}
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                  {telegramLink && (
                    <div className="space-y-1 rounded-md border p-3">
                      <a
                        href={telegramLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm underline"
                      >
                        Open Telegram link
                      </a>
                      {telegramCode && (
                        <p className="text-muted-foreground text-xs">
                          Code:{' '}
                          <span className="font-mono font-medium">
                            {telegramCode}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
