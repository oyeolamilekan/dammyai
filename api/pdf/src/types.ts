import type puppeteer from '@cloudflare/puppeteer'

export const DEFAULT_TITLE = 'document'

export type BrowserBinding = Parameters<typeof puppeteer.launch>[0]

export type AppEnv = {
  Bindings: {
    BROWSER: BrowserBinding
  }
}

export type LaunchBrowser = typeof puppeteer.launch

export type ParsedPdfRequest =
  | { ok: true; html: string; title: string; fileName?: string }
  | { ok: false; error: string; status: 400; details?: unknown }
