export const MODEL_OPTIONS = [
  { label: 'GPT-5 Nano', value: 'openai/gpt-5-nano' },
  { label: 'GPT-5.1 Instant', value: 'openai/gpt-5.1-instant' },
  { label: 'GPT-5', value: 'openai/gpt-5' },
  { label: 'GPT-5.2 Pro', value: 'openai/gpt-5.2-pro' },
  { label: 'GPT-5.2 Code mini', value: 'openai/gpt-5.1-codex-mini' },
  { label: 'GPT-5 mini', value: 'openai/gpt-5-mini' },
  { label: 'Mistrial Large', value: 'mistral/mistral-large-3' },
  { label: 'Mistrial Nemo', value: 'mistral/mistral-nemo' },
  { label: 'Mistrial Medium', value: 'mistral/mistral-medium' },
  { label: 'Mistrial Small', value: 'mistral/mistral-small' },
  { label: 'Mistrial codestral', value: 'mistral/codestral' },
  { label: 'Claude Opus 4.6', value: 'anthropic/claude-opus-4.6' },
  { label: 'Claude Sonnet 4.6', value: 'anthropic/claude-sonnet-4.6' },
  { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5' },
  { label: 'Claude 3.7 Sonnet', value: 'anthropic/claude-3.7-sonnet' },
  { label: 'Claude Opus 4.5', value: 'anthropic/claude-opus-4.5' },
  { label: 'Qwen 3.5 Flash', value: 'alibaba/qwen3.5-flash' },
  { label: 'Qwen 3.5 Plus', value: 'alibaba/qwen3.5-plus' },
  { label: 'Qwen 3 VL Instruct', value: 'alibaba/qwen3-vl-instruct' },
  { label: 'Qwen 3 VL Thinking', value: 'alibaba/qwen3-vl-thinking' },
  { label: 'Qwen 3 Max', value: 'alibaba/qwen3-max' },
  { label: 'Qwen 3 30B', value: 'alibaba/qwen-3-30b' },
  { label: 'Kimi K2.5', value: 'moonshotai/kimi-k2.5' },
  { label: 'Kimi K2 0905', value: 'moonshotai/kimi-k2-0905' },
  { label: 'Kimi K2 Thinking', value: 'moonshotai/kimi-k2-thinking' },
  { label: 'Kimi K2', value: 'moonshotai/kimi-k2' },
  { label: 'Kimi K2 Turbo', value: 'moonshotai/kimi-k2-turbo' },
  {
    label: 'Kimi K2 Thinking Turbo',
    value: 'moonshotai/kimi-k2-thinking-turbo',
  },
] as const

export const SEARCH_PROVIDER_OPTIONS = [
  { label: 'Exa (default)', value: 'exa' },
  { label: 'Tavily', value: 'tavily' },
] as const

const COMMON_TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'America/Mexico_City',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
]

export type SearchProvider = 'exa' | 'tavily'

export type SoulPreferences = {
  id: string
  systemPrompt: string
  modelPreference: string | null
  researchModelPreference: string | null
  searchProvider: SearchProvider | null
  researchDepth: number | null
  researchBreadth: number | null
  timezone: string | null
  createdAt: string
  updatedAt: string
}

export type PreferenceFormState = {
  model: string
  researchModel: string
  researchDepth: number
  researchBreadth: number
  searchProvider: SearchProvider
  timezone: string
}

export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful personal assistant. You are friendly, concise, and action-oriented.'

export function createPreferenceFormState(
  soul: SoulPreferences | null | undefined,
): PreferenceFormState {
  return {
    model: soul?.modelPreference ?? '',
    researchModel: soul?.researchModelPreference ?? '',
    researchDepth: soul?.researchDepth ?? 2,
    researchBreadth: soul?.researchBreadth ?? 3,
    searchProvider: soul?.searchProvider ?? 'exa',
    timezone: soul?.timezone ?? '',
  }
}

export function arePreferenceFormsEqual(
  left: PreferenceFormState,
  right: PreferenceFormState,
) {
  return (
    left.model === right.model &&
    left.researchModel === right.researchModel &&
    left.researchDepth === right.researchDepth &&
    left.researchBreadth === right.researchBreadth &&
    left.searchProvider === right.searchProvider &&
    left.timezone === right.timezone
  )
}

export function getTimezoneOptions() {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return COMMON_TIMEZONE_OPTIONS
  }
}
