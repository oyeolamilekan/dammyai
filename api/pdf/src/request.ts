import { z } from 'zod'
import { DEFAULT_TITLE } from './types'
import type { ParsedPdfRequest } from './types'

const jsonPayloadSchema = z.object({
  html: z.string().trim().min(1, 'html is required'),
  title: z.string().trim().min(1).optional(),
  fileName: z.string().trim().min(1).optional(),
})

export function normalizeFileName(input: string): string {
  const sanitized = input
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const baseName = sanitized || DEFAULT_TITLE
  return baseName.endsWith('.pdf') ? baseName : `${baseName}.pdf`
}

export async function parsePdfRequest(
  request: Request,
): Promise<ParsedPdfRequest> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    let payload: unknown

    try {
      payload = await request.json()
    } catch {
      return {
        ok: false,
        error: 'Request body must be valid JSON.',
        status: 400,
      }
    }

    const parsed = jsonPayloadSchema.safeParse(payload)

    if (!parsed.success) {
      return {
        ok: false,
        error: 'Invalid request body.',
        status: 400,
        details: parsed.error.flatten(),
      }
    }

    return {
      ok: true,
      html: parsed.data.html,
      title: parsed.data.title ?? DEFAULT_TITLE,
      fileName: parsed.data.fileName,
    }
  }

  const url = new URL(request.url)
  const html = (await request.text()).trim()

  if (!html) {
    return {
      ok: false,
      error:
        'Request body must contain HTML, or send JSON with an `html` field.',
      status: 400,
    }
  }

  return {
    ok: true,
    html,
    title: url.searchParams.get('title')?.trim() || DEFAULT_TITLE,
    fileName: url.searchParams.get('fileName')?.trim() || undefined,
  }
}
