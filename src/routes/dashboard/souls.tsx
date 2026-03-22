import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { Skeleton } from '~/components/ui/skeleton'
import { Textarea } from '~/components/ui/textarea'
import { api } from '~/lib/convex-api'
import { getErrorMessage } from '~/lib/get-error-message'
import { requireAuth } from '~/lib/require-auth'

export const Route = createFileRoute('/dashboard/souls')({
  component: SoulPage,
  beforeLoad: requireAuth,
})

type SoulSettings = {
  id: string
  systemPrompt: string
}

function SoulPage() {
  const convexApi = api as any
  const soul = useQuery(convexApi.soul.getSoul) as SoulSettings | null | undefined
  const upsertSoul = useMutation(convexApi.soul.upsertSoul)
  const [systemPrompt, setSystemPrompt] = useState('')

  useEffect(() => {
    if (soul?.systemPrompt) {
      setSystemPrompt(soul.systemPrompt)
    }
  }, [soul?.systemPrompt])

  const isDirty = useMemo(
    () => soul !== undefined && systemPrompt !== (soul?.systemPrompt ?? ''),
    [soul, systemPrompt],
  )

  const saveSoul = async () => {
    try {
      await upsertSoul({ systemPrompt })
      toast.success('Soul updated')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Update failed'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Soul settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {soul === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-60 w-full rounded-md" />
            <Skeleton className="h-9 w-16 rounded-md" />
          </div>
        ) : (
          <>
            <Label htmlFor="system-prompt">System prompt</Label>
            <Textarea
              id="system-prompt"
              rows={10}
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
            <Button disabled={!isDirty} onClick={() => void saveSoul()}>
              Save
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
