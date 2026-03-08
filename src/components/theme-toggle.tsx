import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'
import { useTheme } from '~/components/theme-provider'
import { Button } from '~/components/ui/button'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const next =
    theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  const Icon =
    theme === 'dark'
      ? IconMoon
      : theme === 'light'
        ? IconSun
        : IconDeviceDesktop

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
    >
      <Icon className="size-4" />
    </Button>
  )
}
