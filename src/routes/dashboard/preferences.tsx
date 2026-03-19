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

function PreferencesPage() {
  const convexApi = api as any
  const soul = useQuery(convexApi.soul.getSoul)
  const upsertSoul = useMutation(convexApi.soul.upsertSoul)

  const [model, setModel] = useState('')
  const [researchModel, setResearchModel] = useState('')
  const [searchProvider, setSearchProvider] = useState('exa')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (soul !== undefined) {
      setModel(soul?.modelPreference ?? '')
      setResearchModel(soul?.researchModelPreference ?? '')
      setSearchProvider(soul?.searchProvider ?? 'exa')
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
        searchProvider: searchProvider as 'exa' | 'tavily',
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
          <CardTitle>Search Provider</CardTitle>
        </CardHeader>
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

      <Button disabled={!dirty} onClick={() => void save()}>
        Save preferences
      </Button>
    </div>
  )
}
