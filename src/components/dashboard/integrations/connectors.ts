import {
  IconBrandTelegram,
  IconCalendar,
  IconChecklist,
  IconMail,
  IconNotebook,
} from '@tabler/icons-react'

type ConnectorIcon = typeof IconMail
type ConnectorType = 'oauth' | 'api_key' | 'telegram'
type OAuthConnectorId = 'gmail' | 'google_calendar' | 'todoist' | 'notion'

export type ConnectorId =
  | 'telegram'
  | 'gmail'
  | 'google_calendar'
  | 'todoist'
  | 'notion'

export type ConnectorStatus =
  | 'connected'
  | 'linked'
  | 'pending'
  | 'configured'
  | null

export type ConnectorDefinition = {
  id: ConnectorId
  label: string
  description: string
  type: ConnectorType
  icon: ConnectorIcon
}

export type IntegrationRecord = {
  id: string
  provider: string
  apiKey: string | null
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresAt: string | null
  scope: string | null
  telegramChatId: string | null
  linkingCode: string | null
  createdAt: string
  updatedAt: string
}

export const connectors: ReadonlyArray<ConnectorDefinition> = [
  {
    id: 'telegram',
    label: 'Telegram',
    description: 'Connect your Telegram account to chat with DammyAI directly',
    type: 'telegram',
    icon: IconBrandTelegram,
  },
  {
    id: 'gmail',
    label: 'Gmail',
    description:
      'Draft replies, search your inbox, and summarize email threads instantly',
    type: 'oauth',
    icon: IconMail,
  },
  {
    id: 'google_calendar',
    label: 'Google Calendar',
    description:
      'Understand your schedule, manage events, and optimize your time effectively',
    type: 'oauth',
    icon: IconCalendar,
  },
  {
    id: 'todoist',
    label: 'Todoist',
    description:
      'Check todos, add tasks, and manage your productivity with ease',
    type: 'oauth',
    icon: IconChecklist,
  },
  {
    id: 'notion',
    label: 'Notion',
    description:
      'Search workspace content, update notes, and automate workflows in Notion',
    type: 'oauth',
    icon: IconNotebook,
  },
]

const oauthProviderPaths: Record<OAuthConnectorId, string> = {
  gmail: 'gmail',
  google_calendar: 'google-calendar',
  todoist: 'todoist',
  notion: 'notion',
}

export function filterConnectors(searchQuery: string) {
  const normalizedQuery = searchQuery.trim().toLowerCase()
  if (!normalizedQuery) {
    return connectors
  }

  return connectors.filter((connector) =>
    connector.label.toLowerCase().includes(normalizedQuery),
  )
}

export function getOAuthProviderPath(providerId: ConnectorId) {
  if (providerId === 'telegram') {
    return undefined
  }

  return oauthProviderPaths[providerId]
}

export function getConnectorStatus(
  integrations: Array<IntegrationRecord> | undefined,
  providerId: ConnectorId,
): ConnectorStatus {
  if (!integrations) {
    return null
  }

  const integration = integrations.find(
    (item) => item.provider === providerId,
  )
  if (!integration) {
    return null
  }

  if (providerId === 'telegram' && integration.telegramChatId) {
    return 'linked'
  }
  if (providerId === 'telegram') {
    return 'pending'
  }
  if (integration.accessToken || integration.apiKey) {
    return 'connected'
  }

  return 'configured'
}
