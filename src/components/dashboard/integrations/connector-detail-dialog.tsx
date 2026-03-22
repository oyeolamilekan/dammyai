import type {
  ConnectorDefinition,
  ConnectorId,
  ConnectorStatus,
} from './connectors'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

type OAuthConnectorSectionProps = {
  connectorId: ConnectorId
  status: ConnectorStatus
  onConnect: (connectorId: ConnectorId) => void
  onDisconnect: (connectorId: ConnectorId) => void
}

function OAuthConnectorSection({
  connectorId,
  status,
  onConnect,
  onDisconnect,
}: OAuthConnectorSectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {status === 'connected' ? '✅ Connected' : 'Not connected'}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => void onConnect(connectorId)}>
          {status === 'connected' ? 'Reconnect' : 'Connect'}
        </Button>
        {status && (
          <Button
            variant="destructive"
            onClick={() => void onDisconnect(connectorId)}
          >
            Disconnect
          </Button>
        )}
      </div>
    </div>
  )
}

type ApiKeyConnectorSectionProps = {
  apiKeyInput: string
  hasStoredCredentials: boolean
  onApiKeyChange: (value: string) => void
  onSave: () => void
  onRemove: () => void
}

function ApiKeyConnectorSection({
  apiKeyInput,
  hasStoredCredentials,
  onApiKeyChange,
  onSave,
  onRemove,
}: ApiKeyConnectorSectionProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="apiKey">API key</Label>
        <Input
          id="apiKey"
          value={apiKeyInput}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder="Enter your API key"
        />
      </div>
      <div className="flex gap-2">
        <Button disabled={!apiKeyInput.trim()} onClick={() => void onSave()}>
          Save
        </Button>
        {hasStoredCredentials && (
          <Button variant="destructive" onClick={() => void onRemove()}>
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}

type TelegramConnectorSectionProps = {
  status: ConnectorStatus
  telegramLink: string | null
  telegramCode: string | null
  onGenerateLink: () => void
  onDisconnect: () => void
}

function TelegramConnectorSection({
  status,
  telegramLink,
  telegramCode,
  onGenerateLink,
  onDisconnect,
}: TelegramConnectorSectionProps) {
  return (
    <div className="space-y-3">
      {status === 'linked' ? (
        <p className="text-sm text-green-600">✅ Telegram linked</p>
      ) : (
        <p className="text-muted-foreground text-sm">
          Generate a link, open Telegram, then send{' '}
          <code>/start {'<code>'}</code>.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void onGenerateLink()}>
          Generate link
        </Button>
        {status && (
          <Button variant="destructive" onClick={() => void onDisconnect()}>
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
              Code: <span className="font-mono font-medium">{telegramCode}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

type ConnectorDetailDialogProps = {
  open: boolean
  connector: ConnectorDefinition | null
  status: ConnectorStatus
  apiKeyInput: string
  telegramLink: string | null
  telegramCode: string | null
  onOpenChange: (open: boolean) => void
  onApiKeyChange: (value: string) => void
  onConnectOAuth: (connectorId: ConnectorId) => void
  onSaveApiKey: () => void
  onGenerateTelegramLink: () => void
  onRemoveProvider: (connectorId: ConnectorId) => void
}

export function ConnectorDetailDialog({
  open,
  connector,
  status,
  apiKeyInput,
  telegramLink,
  telegramCode,
  onOpenChange,
  onApiKeyChange,
  onConnectOAuth,
  onSaveApiKey,
  onGenerateTelegramLink,
  onRemoveProvider,
}: ConnectorDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              <OAuthConnectorSection
                connectorId={connector.id}
                status={status}
                onConnect={onConnectOAuth}
                onDisconnect={onRemoveProvider}
              />
            )}

            {connector.type === 'api_key' && (
              <ApiKeyConnectorSection
                apiKeyInput={apiKeyInput}
                hasStoredCredentials={Boolean(status)}
                onApiKeyChange={onApiKeyChange}
                onSave={onSaveApiKey}
                onRemove={() => onRemoveProvider(connector.id)}
              />
            )}

            {connector.type === 'telegram' && (
              <TelegramConnectorSection
                status={status}
                telegramLink={telegramLink}
                telegramCode={telegramCode}
                onGenerateLink={onGenerateTelegramLink}
                onDisconnect={() => onRemoveProvider('telegram')}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
