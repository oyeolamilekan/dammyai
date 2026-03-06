import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { authClient } from '~/lib/auth-client'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error('Email and password are required')
      return
    }
    setIsSubmitting(true)
    try {
      if (mode === 'sign-in') {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
        })
        if (result.error) {
          throw new Error(result.error.message ?? 'Failed to sign in')
        }
      } else {
        const result = await authClient.signUp.email({
          name: name.trim() || email.trim(),
          email: email.trim(),
          password,
        })
        if (result.error) {
          throw new Error(result.error.message ?? 'Failed to sign up')
        }
      }

      toast.success(mode === 'sign-in' ? 'Signed in' : 'Account created')
      await navigate({ to: '/dashboard' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Auth failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'sign-up' ? (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button disabled={isSubmitting} onClick={() => void submit()}>
              {isSubmitting
                ? 'Please wait...'
                : mode === 'sign-in'
                  ? 'Sign in'
                  : 'Create account'}
            </Button>
            <Button
              variant="outline"
              disabled={isSubmitting}
              onClick={() =>
                setMode((prev) => (prev === 'sign-in' ? 'sign-up' : 'sign-in'))
              }
            >
              {mode === 'sign-in' ? 'Need an account?' : 'Have an account?'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
