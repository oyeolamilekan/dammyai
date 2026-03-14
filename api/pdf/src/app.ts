import puppeteer from '@cloudflare/puppeteer'
import { Hono } from 'hono'
import { normalizeFileName, parsePdfRequest } from './request'
import { renderPdfFromHtml } from './render'
import type { AppEnv, LaunchBrowser } from './types'

export function createApp(
  launchBrowser: LaunchBrowser = puppeteer.launch,
): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.get('/', (c) => {
    return c.json({
      ok: true,
      service: 'pdf-api',
      renderer: 'cloudflare-browser-rendering',
      endpoints: {
        health: 'GET /health',
        pdf: 'POST /pdf',
      },
    })
  })

  app.get('/health', (c) => c.json({ ok: true }))

  app.post('/pdf', async (c) => {
    const parsed = await parsePdfRequest(c.req.raw)

    if (!parsed.ok) {
      return c.json(
        {
          error: parsed.error,
          details: parsed.details,
        },
        { status: parsed.status },
      )
    }

    const pdfBuffer = await renderPdfFromHtml(
      c.env.BROWSER,
      parsed.html,
      launchBrowser,
    )

    return c.newResponse(pdfBuffer, 200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${normalizeFileName(parsed.fileName ?? parsed.title)}"`,
    })
  })

  app.onError((error, c) => {
    console.error('PDF API error:', error)

    return c.json(
      {
        error: 'Failed to generate PDF.',
        message: error.message,
      },
      500,
    )
  })

  return app
}
