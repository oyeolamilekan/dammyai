import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { Skeleton } from '~/components/ui/skeleton'
import { requireAuth } from '~/lib/require-auth'

export const Route = createFileRoute('/dashboard/preferences')({
  component: PreferencesPage,
  beforeLoad: requireAuth,
})

const MODELS = [
  // OpenAI
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
  // Anthropic
  { label: 'Claude Opus 4.6', value: 'anthropic/claude-opus-4.6' },
  { label: 'Claude Sonnet 4.6', value: 'anthropic/claude-sonnet-4.6' },
  { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5' },
  { label: 'Claude 3.7 Sonnet', value: 'anthropic/claude-3.7-sonnet' },
  { label: 'Claude Opus 4.5', value: 'anthropic/claude-opus-4.5' },
  // Alibaba
  { label: 'Qwen 3.5 Flash', value: 'alibaba/qwen3.5-flash' },
  { label: 'Qwen 3.5 Plus', value: 'alibaba/qwen3.5-plus' },
  { label: 'Qwen 3 VL Instruct', value: 'alibaba/qwen3-vl-instruct' },
  { label: 'Qwen 3 VL Thinking', value: 'alibaba/qwen3-vl-thinking' },
  { label: 'Qwen 3 Max', value: 'alibaba/qwen3-max' },
  { label: 'Qwen 3 30B', value: 'alibaba/qwen-3-30b' },
  // Moonshot AI
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

const SEARCH_PROVIDERS = [
  { label: 'Exa (default)', value: 'exa' },
  { label: 'Tavily', value: 'tavily' },
] as const

/** Fallback list for browsers that don't support Intl.supportedValuesOf. */
const COMMON_TIMEZONES = [
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

function PreferencesPage() {
  const convexApi = api as any
  const soul = useQuery(convexApi.soul.getSoul)
  const upsertSoul = useMutation(convexApi.soul.upsertSoul)

  const [model, setModel] = useState('')
  const [researchModel, setResearchModel] = useState('')
  const [researchDepth, setResearchDepth] = useState(2)
  const [researchBreadth, setResearchBreadth] = useState(3)
  const [searchProvider, setSearchProvider] = useState('exa')
  const [timezone, setTimezone] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (soul !== undefined) {
      setModel(soul?.modelPreference ?? '')
      setResearchModel(soul?.researchModelPreference ?? '')
      setResearchDepth(soul?.researchDepth ?? 2)
      setResearchBreadth(soul?.researchBreadth ?? 3)
      setSearchProvider(soul?.searchProvider ?? 'exa')
      setTimezone(soul?.timezone ?? '')
    }
  }, [soul])

  const save = async () => {
    try {
      await upsertSoul({
        systemPrompt:
          soul?.systemPrompt ??
          'You are a helpful personal assistant. You are friendly, concise, and action-oriented.',
        modelPreference: model || undefined,
        researchModelPreference: researchModel || undefined,
        researchDepth,
        researchBreadth,
        searchProvider: searchProvider as 'exa' | 'tavily',
        timezone: timezone || undefined,
      })
      toast.success('Preferences saved')
      setDirty(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI Model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {soul === undefined ? (
            <Skeleton className="h-9 w-full rounded-md" />
          ) : (
            <>
              <Label htmlFor="model-select">Preferred model</Label>
              <select
                id="model-select"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value)
                  setDirty(true)
                }}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">Default (GPT-5 Nano)</option>
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                The model used for chat and tasks.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Research Model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {soul === undefined ? (
            <Skeleton className="h-9 w-full rounded-md" />
          ) : (
            <>
              <Label htmlFor="research-model-select">
                Preferred research model
              </Label>
              <select
                id="research-model-select"
                value={researchModel}
                onChange={(e) => {
                  setResearchModel(e.target.value)
                  setDirty(true)
                }}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">Same as chat model</option>
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                The model used for deep research. Leave empty to use the chat
                model.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Research Depth</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {soul === undefined ? (
            <Skeleton className="h-9 w-full rounded-md" />
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="depth-select">Depth (search rounds)</Label>
                <select
                  id="depth-select"
                  value={researchDepth}
                  onChange={(e) => {
                    setResearchDepth(Number(e.target.value))
                    setDirty(true)
                  }}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value={1}>1 — Quick</option>
                  <option value={2}>2 — Standard (default)</option>
                  <option value={3}>3 — Thorough</option>
                  <option value={4}>4 — Deep</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="breadth-select">Breadth (queries per round)</Label>
                <select
                  id="breadth-select"
                  value={researchBreadth}
                  onChange={(e) => {
                    setResearchBreadth(Number(e.target.value))
                    setDirty(true)
                  }}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}{n === 3 ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-muted-foreground text-xs">
                Higher depth and breadth produce more thorough reports but take longer.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          {soul === undefined ? (
            <Skeleton className="h-9 w-full rounded-md" />
          ) : (
            <>
              <Label htmlFor="search-select">Preferred search engine</Label>
              <select
                id="search-select"
                value={searchProvider}
                onChange={(e) => {
                  setSearchProvider(e.target.value)
                  setDirty(true)
                }}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {SEARCH_PROVIDERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                The search engine the bot uses for web searches and research.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timezone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {soul === undefined ? (
            <Skeleton className="h-9 w-full rounded-md" />
          ) : (
            <>
              <Label htmlFor="timezone-select">Your timezone</Label>
              <select
                id="timezone-select"
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value)
                  setDirty(true)
                }}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">Auto (UTC)</option>
                {(() => {
                  try {
                    return Intl.supportedValuesOf('timeZone').map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace(/_/g, ' ')}
                      </option>
                    ))
                  } catch {
                    return COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace(/_/g, ' ')}
                      </option>
                    ))
                  }
                })()}
              </select>
              <p className="text-muted-foreground text-xs">
                Used by the assistant for scheduling and time-aware responses.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Button disabled={!dirty} onClick={() => void save()}>
        Save preferences
      </Button>
    </div>
  )
}
