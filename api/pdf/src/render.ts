import puppeteer from '@cloudflare/puppeteer'
import type { BrowserBinding, LaunchBrowser } from './types'

function toArrayBuffer(bytes: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) {
    return bytes
  }

  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

export async function renderPdfFromHtml(
  browserBinding: BrowserBinding,
  html: string,
  launchBrowser: LaunchBrowser = puppeteer.launch,
): Promise<ArrayBuffer> {
  const browser = await launchBrowser(browserBinding)

  try {
    const page = await browser.newPage()

    await page.setViewport({
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    })
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    })
    await page.emulateMediaType('print')

    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })

    return toArrayBuffer(pdfBytes)
  } finally {
    await browser.close()
  }
}
