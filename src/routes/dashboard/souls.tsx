import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { Skeleton } from '~/components/ui/skeleton'
import { Textarea } from '~/components/ui/textarea'
import { requireAuth } from '~/lib/require-auth'

export const Route = createFileRoute('/dashboard/souls')({
  component: SoulPage,
  beforeLoad: requireAuth,
})

function SoulPage() {
  const convexApi = api as any
  const soul = useQuery(convexApi.soul.getSoul)
  const upsertSoul = useMutation(convexApi.soul.upsertSoul)
  const [prompt, setPrompt] = useState('')

  useEffect(() => {
    if (soul?.systemPrompt) {
      setPrompt(soul.systemPrompt)
    }
  }, [soul?.systemPrompt])

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
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <Button
              onClick={() => {
                void upsertSoul({ systemPrompt: prompt })
                  .then(() => toast.success('Soul updated'))
                  .catch((error) => {
                    toast.error(
                      error instanceof Error ? error.message : 'Update failed',
                    )
                  })
              }}
            >
              Save
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
