import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig, loadEnv } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

declare const process: { cwd: () => string }

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') as Record<
    string,
    string | undefined
  >
  const convexSiteUrl =
    env.VITE_CONVEX_SITE_URL ??
    env.VITE_CONVEX_URL?.replace('.convex.cloud', '.convex.site')

  return {
    nitro: {
      devProxy: convexSiteUrl
        ? {
            '/api/auth/**': { target: convexSiteUrl, changeOrigin: true },
          }
        : undefined,
    },
    server: {
      port: 3000,
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
      tanstackStart(),
      nitro(),
      viteReact(),
    ],
  }
})
