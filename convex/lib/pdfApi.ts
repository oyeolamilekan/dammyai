import { getRequiredEnv } from './env'

interface RenderPdfOptions {
  html: string
  title?: string
  fileName?: string
}

function getPdfApiUrl(path: string): string {
  const baseUrl = getRequiredEnv('PDF_API_BASE_URL').replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${normalizedPath}`
}

/**
 * Purpose: Calls the standalone PDF API and returns the rendered PDF bytes.
 * Function type: helper
 * Args:
 * - options: RenderPdfOptions
 */
export async function renderPdfViaApi(
  options: RenderPdfOptions,
): Promise<ArrayBuffer> {
  const response = await fetch(getPdfApiUrl('/pdf'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/pdf',
    },
    body: JSON.stringify({
      html: options.html,
      title: options.title,
      fileName: options.fileName,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(
      `PDF API request failed with ${response.status}: ${errorBody || response.statusText}`,
    )
  }

  return await response.arrayBuffer()
}
