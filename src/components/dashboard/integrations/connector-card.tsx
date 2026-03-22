import type {
  ConnectorDefinition,
  ConnectorId,
  ConnectorStatus,
} from './connectors'

type ConnectorCardProps = {
  connector: ConnectorDefinition
  status: ConnectorStatus
  onSelect: (connectorId: ConnectorId) => void
}

function ConnectorStatusBadge({ status }: { status: ConnectorStatus }) {
  if (status === 'connected' || status === 'linked') {
    return (
      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900 dark:text-green-300">
        Connected
      </span>
    )
  }

  if (status === 'pending') {
    return (
      <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
        Pending
      </span>
    )
  }

  return null
}

export function ConnectorCard({
  connector,
  status,
  onSelect,
}: ConnectorCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(connector.id)}
      className="flex items-start gap-4 rounded-xl border p-4 text-left transition-colors hover:bg-accent"
    >
      <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
        <connector.icon className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">{connector.label}</p>
          <ConnectorStatusBadge status={status} />
        </div>
        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
          {connector.description}
        </p>
      </div>
    </button>
  )
}
