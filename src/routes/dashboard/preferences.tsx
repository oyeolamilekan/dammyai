import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type {
  PreferenceFormState,
  SearchProvider,
  SoulPreferences,
} from '~/components/dashboard/preferences/preferences-utils'
import { PreferenceCard } from '~/components/dashboard/preferences/preference-card'
import {
  DEFAULT_SYSTEM_PROMPT,
  MODEL_OPTIONS,
  SEARCH_PROVIDER_OPTIONS,
  arePreferenceFormsEqual,
  createPreferenceFormState,
  getTimezoneOptions,
} from '~/components/dashboard/preferences/preferences-utils'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { api } from '~/lib/convex-api'
import { getErrorMessage } from '~/lib/get-error-message'
import { requireAuth } from '~/lib/require-auth'

export const Route = createFileRoute('/dashboard/preferences')({
  component: PreferencesPage,
  beforeLoad: requireAuth,
})

const selectClassName =
  'border-input bg-background h-9 w-full rounded-md border px-3 text-sm'

function PreferencesPage() {
  const convexApi = api as any
  const soul = useQuery(convexApi.soul.getSoul) as SoulPreferences | null | undefined
  const upsertSoul = useMutation(convexApi.soul.upsertSoul)

  const [form, setForm] = useState<PreferenceFormState>(
    createPreferenceFormState(undefined),
  )

  useEffect(() => {
    if (soul !== undefined) {
      setForm(createPreferenceFormState(soul))
    }
  }, [soul])

  const initialForm = useMemo(
    () => createPreferenceFormState(soul),
    [soul],
  )
  const timezoneOptions = useMemo(() => getTimezoneOptions(), [])
  const isDirty =
    soul !== undefined && !arePreferenceFormsEqual(form, initialForm)

  const updateForm = <TKey extends keyof PreferenceFormState>(
    key: TKey,
    value: PreferenceFormState[TKey],
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const savePreferences = async () => {
    try {
      await upsertSoul({
        systemPrompt: soul?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        modelPreference: form.model || undefined,
        researchModelPreference: form.researchModel || undefined,
        researchDepth: form.researchDepth,
        researchBreadth: form.researchBreadth,
        searchProvider: form.searchProvider,
        timezone: form.timezone || undefined,
      })
      toast.success('Preferences saved')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Save failed'))
    }
  }

  return (
    <div className="space-y-4">
      <PreferenceCard title="AI Model" loading={soul === undefined}>
        <Label htmlFor="model-select">Preferred model</Label>
        <select
          id="model-select"
          value={form.model}
          onChange={(event) => updateForm('model', event.target.value)}
          className={selectClassName}
        >
          <option value="">Default (GPT-5 Nano)</option>
          {MODEL_OPTIONS.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          The model used for chat and tasks.
        </p>
      </PreferenceCard>

      <PreferenceCard title="Research Model" loading={soul === undefined}>
        <Label htmlFor="research-model-select">Preferred research model</Label>
        <select
          id="research-model-select"
          value={form.researchModel}
          onChange={(event) =>
            updateForm('researchModel', event.target.value)
          }
          className={selectClassName}
        >
          <option value="">Same as chat model</option>
          {MODEL_OPTIONS.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          The model used for deep research. Leave empty to use the chat model.
        </p>
      </PreferenceCard>

      <PreferenceCard title="Research Depth" loading={soul === undefined}>
        <div className="space-y-1">
          <Label htmlFor="depth-select">Depth (search rounds)</Label>
          <select
            id="depth-select"
            value={form.researchDepth}
            onChange={(event) =>
              updateForm('researchDepth', Number(event.target.value))
            }
            className={selectClassName}
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
            value={form.researchBreadth}
            onChange={(event) =>
              updateForm('researchBreadth', Number(event.target.value))
            }
            className={selectClassName}
          >
            {[2, 3, 4, 5, 6].map((breadth) => (
              <option key={breadth} value={breadth}>
                {breadth}
                {breadth === 3 ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </div>

        <p className="text-muted-foreground text-xs">
          Higher depth and breadth produce more thorough reports but take
          longer.
        </p>
      </PreferenceCard>

      <PreferenceCard
        title="Search Provider"
        loading={soul === undefined}
      >
        <Label htmlFor="search-select">Preferred search engine</Label>
        <select
          id="search-select"
          value={form.searchProvider}
          onChange={(event) =>
            updateForm('searchProvider', event.target.value as SearchProvider)
          }
          className={selectClassName}
        >
          {SEARCH_PROVIDER_OPTIONS.map((provider) => (
            <option key={provider.value} value={provider.value}>
              {provider.label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          The search engine the bot uses for web searches and research.
        </p>
      </PreferenceCard>

      <PreferenceCard title="Timezone" loading={soul === undefined}>
        <Label htmlFor="timezone-select">Your timezone</Label>
        <select
          id="timezone-select"
          value={form.timezone}
          onChange={(event) => updateForm('timezone', event.target.value)}
          className={selectClassName}
        >
          <option value="">Auto (UTC)</option>
          {timezoneOptions.map((timezone) => (
            <option key={timezone} value={timezone}>
              {timezone.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          Used by the assistant for scheduling and time-aware responses.
        </p>
      </PreferenceCard>

      <Button disabled={!isDirty} onClick={() => void savePreferences()}>
        Save preferences
      </Button>
    </div>
  )
}
