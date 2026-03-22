import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type {
  ConnectorId,
  IntegrationRecord,
} from '~/components/dashboard/integrations/connectors'
import { ConnectorCard } from '~/components/dashboard/integrations/connector-card'
import { ConnectorDetailDialog } from '~/components/dashboard/integrations/connector-detail-dialog'
import {
  connectors,
  filterConnectors,
  getConnectorStatus,
  getOAuthProviderPath,
} from '~/components/dashboard/integrations/connectors'
import { Input } from '~/components/ui/input'
import { Skeleton } from '~/components/ui/skeleton'
import { getCachedSession } from '~/lib/auth-client'
import { api } from '~/lib/convex-api'
import { getErrorMessage } from '~/lib/get-error-message'
import { requireAuth } from '~/lib/require-auth'

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL as string

type ConnectorDialogState = {
  apiKeyInput: string
  telegramLink: string | null
  telegramCode: string | null
}

const initialConnectorDialogState: ConnectorDialogState = {
  apiKeyInput: '',
  telegramLink: null,
  telegramCode: null,
}

export const Route = createFileRoute('/dashboard/integrations')({
  component: IntegrationsPage,
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>) => ({
    success: (search.success as string | undefined) ?? undefined,
    error: (search.error as string | undefined) ?? undefined,
  }),
})

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

  const [selectedConnectorId, setSelectedConnectorId] =
    useState<ConnectorId | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogState, setDialogState] = useState(initialConnectorDialogState)

  const integrationRecords = integrations as Array<IntegrationRecord> | undefined

  useEffect(() => {
    if (success) toast.success(`${success} connected successfully`)
    if (oauthError) toast.error(`OAuth failed: ${oauthError}`)
  }, [success, oauthError])

  const selectedConnector = useMemo(
    () =>
      connectors.find((connector) => connector.id === selectedConnectorId) ??
      null,
    [selectedConnectorId],
  )

  const filteredConnectors = useMemo(
    () => filterConnectors(searchQuery),
    [searchQuery],
  )

  const selectedConnectorStatus = selectedConnector
    ? getConnectorStatus(integrationRecords, selectedConnector.id)
    : null

  const resetDialogState = () => {
    setDialogState(initialConnectorDialogState)
  }

  const updateDialogState = (patch: Partial<ConnectorDialogState>) => {
    setDialogState((current) => ({
      ...current,
      ...patch,
    }))
  }

  const openConnectorDetails = (connectorId: ConnectorId) => {
    setSelectedConnectorId(connectorId)
    resetDialogState()
  }

  const closeConnectorDetails = () => {
    setSelectedConnectorId(null)
    resetDialogState()
  }

  const connectOAuth = async (providerId: ConnectorId) => {
    const path = getOAuthProviderPath(providerId)
    if (!path || !CONVEX_SITE_URL) {
      return
    }

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

  const generateTelegramRegistration = async () => {
    try {
      await fetch(`${CONVEX_SITE_URL}/api/telegram/register-webhook`, {
        method: 'POST',
      }).catch(() => undefined)

      const result = await createTelegramLink()
      updateDialogState({
        telegramLink: result.telegramUrl,
        telegramCode: result.linkingCode,
      })
      toast.success('Telegram link generated')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to link'))
    }
  }

  const removeProvider = async (providerId: ConnectorId) => {
    try {
      await deleteIntegration({ provider: providerId })
      toast.success('Integration removed')
      closeConnectorDetails()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Delete failed'))
    }
  }

  const saveApiKey = async () => {
    const providerId = selectedConnectorId
    const apiKeyInput = dialogState.apiKeyInput.trim()

    if (!providerId || !apiKeyInput) {
      return
    }

    try {
      await upsertIntegration({ provider: providerId, apiKey: apiKeyInput })
      toast.success('Integration saved')
      closeConnectorDetails()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save'))
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connectors</h2>
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="max-w-xs"
          />
        </div>

        {!integrations ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredConnectors.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                status={getConnectorStatus(integrationRecords, connector.id)}
                onSelect={openConnectorDetails}
              />
            ))}
          </div>
        )}
      </div>

      <ConnectorDetailDialog
        open={selectedConnector !== null}
        connector={selectedConnector}
        status={selectedConnectorStatus}
        apiKeyInput={dialogState.apiKeyInput}
        telegramLink={dialogState.telegramLink}
        telegramCode={dialogState.telegramCode}
        onOpenChange={(open) => {
          if (!open) {
            closeConnectorDetails()
          }
        }}
        onApiKeyChange={(apiKeyInput) => updateDialogState({ apiKeyInput })}
        onConnectOAuth={connectOAuth}
        onSaveApiKey={saveApiKey}
        onGenerateTelegramLink={generateTelegramRegistration}
        onRemoveProvider={removeProvider}
      />
    </>
  )
}
