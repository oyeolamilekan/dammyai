import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { authClient } from '~/lib/auth-client'

export const Route = createFileRoute('/dashboard/account')({
  component: AccountPage,
})

function AccountPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChangePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim()) {
      toast.error('All fields are required')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })
      if (result.error) {
        throw new Error(result.error.message ?? 'Failed to change password')
      }
      toast.success('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to change password',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your password. You will be signed out of all other sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter your new password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new password"
            />
          </div>
          <Button
            disabled={
              isSubmitting ||
              !currentPassword.trim() ||
              !newPassword.trim() ||
              !confirmPassword.trim()
            }
            onClick={() => void handleChangePassword()}
          >
            {isSubmitting ? 'Changing password...' : 'Change password'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
