import * as React from "react"

type Theme = "light" | "dark" | "system"

const ThemeContext = React.createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
}>({ theme: "system", setTheme: () => {} })

export function useTheme() {
  return React.useContext(ThemeContext)
}

function getSystemTheme() {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return
  const resolved = theme === "system" ? getSystemTheme() : theme
  document.documentElement.classList.toggle("dark", resolved === "dark")
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof localStorage === "undefined") return "system"
    return (localStorage.getItem("theme") as Theme | null) ?? "system"
  })

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem("theme", t)
    applyTheme(t)
  }, [])

  React.useEffect(() => {
    applyTheme(theme)
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      const handler = () => applyTheme("system")
      mq.addEventListener("change", handler)
      return () => mq.removeEventListener("change", handler)
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
