import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFFont, PDFPage, RGB } from 'pdf-lib'

const PAGE_WIDTH = 595.28 // A4
const PAGE_HEIGHT = 841.89
const MARGIN = 50
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN

// ── Text runs (normal / bold) ────────────────────────────────────────────────

interface TextRun {
  text: string
  bold: boolean
}

/** Split a string that may contain <strong>/<b> tags into typed runs. */
function parseInlineRuns(html: string): Array<TextRun> {
  const runs: Array<TextRun> = []
  const re = /<(strong|b)>([\s\S]*?)<\/\1>/gi
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (m.index > cursor) {
      runs.push({ text: stripTags(html.slice(cursor, m.index)), bold: false })
    }
    runs.push({ text: stripTags(m[2]), bold: true })
    cursor = m.index + m[0].length
  }
  if (cursor < html.length) {
    runs.push({ text: stripTags(html.slice(cursor)), bold: false })
  }
  // Collapse empty runs
  return runs.filter((r) => r.text.length > 0)
}

// ── Block types ──────────────────────────────────────────────────────────────

type Block =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'paragraph'; runs: Array<TextRun> }
  | { type: 'bullet'; items: Array<Array<TextRun>> }
  | { type: 'numbered'; items: Array<Array<TextRun>> }
  | { type: 'blockquote'; runs: Array<TextRun> }

// ── HTML → Blocks parser ─────────────────────────────────────────────────────

export function htmlToBlocks(html: string): Array<Block> {
  // Strip full document wrapper
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const content = bodyMatch ? bodyMatch[1] : html

  const blocks: Array<Block> = []

  // Tokenize on block-level tags
  const tokenRe =
    /<(h[1-3]|p|ul|ol|blockquote|li|div|br|hr|table|thead|tbody|tr|td|th)(\s[^>]*)?>|<\/(h[1-3]|p|ul|ol|blockquote|li|div|table|thead|tbody|tr|td|th)>/gi

  let cursor = 0
  let currentListType: 'bullet' | 'numbered' | null = null
  let listItems: Array<Array<TextRun>> = []

  const flushList = () => {
    if (listItems.length > 0 && currentListType) {
      blocks.push(
        currentListType === 'bullet'
          ? { type: 'bullet', items: listItems }
          : { type: 'numbered', items: listItems },
      )
    }
    listItems = []
    currentListType = null
  }

  const flushText = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    const runs = parseInlineRuns(trimmed)
    if (runs.length > 0) {
      blocks.push({ type: 'paragraph', runs })
    }
  }

  // Collect all tokens
  const tokens: Array<{
    tag: string
    closing: boolean
    index: number
    length: number
  }> = []
  let tok: RegExpExecArray | null
  while ((tok = tokenRe.exec(content)) !== null) {
    const openTag = (tok[1] || '').toLowerCase()
    const closeTag = (tok[3] || '').toLowerCase()
    tokens.push({
      tag: openTag || closeTag,
      closing: !tok[1],
      index: tok.index,
      length: tok[0].length,
    })
  }

  for (const t of tokens) {
    // Flush text before this token
    if (t.index > cursor) {
      const between = content.slice(cursor, t.index)
      if (currentListType === null) {
        flushText(between)
      }
    }
    cursor = t.index + t.length

    if (t.closing) {
      // Handle closing tags
      if (t.tag === 'ul' || t.tag === 'ol') {
        flushList()
      }
      continue
    }

    // Opening tags
    switch (t.tag) {
      case 'h1':
      case 'h2':
      case 'h3': {
        flushList()
        const closeRe = new RegExp(`</${t.tag}>`, 'i')
        const closeMatch = closeRe.exec(content.slice(cursor))
        if (closeMatch) {
          const inner = content.slice(cursor, cursor + closeMatch.index)
          blocks.push({ type: t.tag, text: stripTags(inner).trim() })
          cursor += closeMatch.index + closeMatch[0].length
        }
        break
      }
      case 'ul':
        flushList()
        currentListType = 'bullet'
        break
      case 'ol':
        flushList()
        currentListType = 'numbered'
        break
      case 'li': {
        const closeRe = /<\/li>/i
        const closeMatch = closeRe.exec(content.slice(cursor))
        if (closeMatch) {
          const inner = content.slice(cursor, cursor + closeMatch.index)
          const runs = parseInlineRuns(inner)
          if (runs.length > 0) {
            listItems.push(runs)
          }
          cursor += closeMatch.index + closeMatch[0].length
        }
        break
      }
      case 'blockquote': {
        flushList()
        const closeRe = /<\/blockquote>/i
        const closeMatch = closeRe.exec(content.slice(cursor))
        if (closeMatch) {
          const inner = content.slice(cursor, cursor + closeMatch.index)
          const runs = parseInlineRuns(inner.replace(/<\/?p[^>]*>/gi, ' '))
          if (runs.length > 0) {
            blocks.push({ type: 'blockquote', runs })
          }
          cursor += closeMatch.index + closeMatch[0].length
        }
        break
      }
      case 'p':
      case 'div': {
        if (currentListType) break // Inside list, skip
        const closeRe = new RegExp(`</${t.tag}>`, 'i')
        const closeMatch = closeRe.exec(content.slice(cursor))
        if (closeMatch) {
          const inner = content.slice(cursor, cursor + closeMatch.index)
          const runs = parseInlineRuns(inner)
          if (runs.length > 0) {
            blocks.push({ type: 'paragraph', runs })
          }
          cursor += closeMatch.index + closeMatch[0].length
        }
        break
      }
      // br, hr, table elements — skip
    }
  }

  // Remaining text
  flushList()
  if (cursor < content.length) {
    flushText(content.slice(cursor))
  }

  return blocks
}

// ── PDF renderer ─────────────────────────────────────────────────────────────

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

class PdfWriter {
  private doc: PDFDocument
  private fonts: Fonts
  private page: PDFPage
  private y: number

  constructor(doc: PDFDocument, fonts: Fonts) {
    this.doc = doc
    this.fonts = fonts
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.y = PAGE_HEIGHT - MARGIN
  }

  private ensureSpace(needed: number) {
    if (this.y < MARGIN + needed) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      this.y = PAGE_HEIGHT - MARGIN
    }
  }

  /** Draw a single line of text at x, honoring bold runs. */
  private drawLine(
    runs: Array<{ text: string; font: PDFFont }>,
    x: number,
    size: number,
    color: RGB,
  ) {
    let cx = x
    for (const run of runs) {
      if (run.text) {
        this.page.drawText(run.text, {
          x: cx,
          y: this.y,
          size,
          font: run.font,
          color,
        })
        cx += run.font.widthOfTextAtSize(run.text, size)
      }
    }
  }

  /** Word-wrap and draw text runs with mixed bold/regular. */
  drawRuns(
    runs: Array<TextRun>,
    size: number,
    lineHeight: number,
    color: RGB,
    indent = 0,
  ) {
    const maxWidth = CONTENT_WIDTH - indent
    const x = MARGIN + indent

    // Flatten runs into words with font info
    const words: Array<{ word: string; font: PDFFont }> = []
    for (const run of runs) {
      const font = run.bold ? this.fonts.bold : this.fonts.regular
      const parts = run.text.split(/\s+/).filter(Boolean)
      for (const w of parts) {
        words.push({ word: w, font })
      }
    }

    let lineRuns: Array<{ text: string; font: PDFFont }> = []
    let lineWidth = 0
    const spaceWidth = this.fonts.regular.widthOfTextAtSize(' ', size)

    const flushLine = () => {
      if (lineRuns.length === 0) return
      this.ensureSpace(lineHeight)
      this.drawLine(lineRuns, x, size, color)
      this.y -= lineHeight
      lineRuns = []
      lineWidth = 0
    }

    for (const { word, font } of words) {
      const ww = font.widthOfTextAtSize(word, size)
      const extra = lineRuns.length > 0 ? spaceWidth : 0
      if (lineWidth + extra + ww > maxWidth && lineRuns.length > 0) {
        flushLine()
      }
      if (lineRuns.length > 0) {
        // Append space before word
        const last = lineRuns[lineRuns.length - 1]
        if (last.font === font) {
          last.text += ` ${word}`
        } else {
          lineRuns.push({ text: ` ${word}`, font })
        }
      } else {
        lineRuns.push({ text: word, font })
      }
      lineWidth += extra + ww
    }
    flushLine()
  }

  /** Draw plain text with a specific font. */
  drawText(
    text: string,
    bold: boolean,
    size: number,
    lineHeight: number,
    color: RGB,
    indent = 0,
  ) {
    this.drawRuns([{ text, bold }], size, lineHeight, color, indent)
  }

  /** Draw a horizontal line. */
  drawDivider(color: RGB, thickness = 1) {
    this.ensureSpace(10)
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness,
      color,
    })
    this.y -= 12
  }

  /** Draw a thin vertical bar (for blockquotes). */
  drawBlockquoteBar(startY: number) {
    this.page.drawRectangle({
      x: MARGIN + 6,
      y: this.y + 4,
      width: 2.5,
      height: startY - this.y - 4,
      color: rgb(0.22, 0.49, 0.96),
    })
  }

  gap(amount: number) {
    this.y -= amount
  }

  getY() {
    return this.y
  }

  ensureMinSpace(needed: number) {
    this.ensureSpace(needed)
  }
}

/**
 * Generate a PDF buffer from HTML blocks.
 */
export async function generatePdf(
  title: string,
  blocks: Array<Block>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const w = new PdfWriter(doc, { regular, bold })

  const DARK = rgb(0.12, 0.17, 0.24)
  const BODY = rgb(0.2, 0.2, 0.2)
  const MUTED = rgb(0.45, 0.45, 0.45)
  const ACCENT = rgb(0.17, 0.24, 0.31)

  // Title
  w.drawText(title, true, 20, 28, DARK)
  w.gap(4)
  w.drawText(
    `Generated on ${new Date().toLocaleDateString()}`,
    false,
    9,
    12,
    MUTED,
  )
  w.gap(8)
  w.drawDivider(rgb(0.8, 0.8, 0.8))
  w.gap(8)

  for (const block of blocks) {
    switch (block.type) {
      case 'h1':
        w.ensureMinSpace(50)
        w.gap(12)
        w.drawText(block.text, true, 17, 24, DARK)
        w.gap(4)
        w.drawDivider(rgb(0.85, 0.85, 0.85), 0.5)
        break

      case 'h2':
        w.ensureMinSpace(40)
        w.gap(10)
        w.drawText(block.text, true, 14, 20, ACCENT)
        w.gap(6)
        break

      case 'h3':
        w.ensureMinSpace(30)
        w.gap(8)
        w.drawText(block.text, true, 12, 18, ACCENT)
        w.gap(4)
        break

      case 'paragraph':
        w.drawRuns(block.runs, 10, 15, BODY)
        w.gap(6)
        break

      case 'bullet':
        for (const item of block.items) {
          w.ensureMinSpace(16)
          const bulletRuns: Array<TextRun> = [
            { text: '\u2022  ', bold: false },
            ...item,
          ]
          w.drawRuns(bulletRuns, 10, 15, BODY, 10)
          w.gap(3)
        }
        w.gap(4)
        break

      case 'numbered':
        for (let i = 0; i < block.items.length; i++) {
          w.ensureMinSpace(16)
          const prefixedRuns: Array<TextRun> = [
            { text: `${i + 1}. `, bold: false },
            ...block.items[i],
          ]
          w.drawRuns(prefixedRuns, 10, 15, BODY, 12)
          w.gap(3)
        }
        w.gap(4)
        break

      case 'blockquote': {
        w.ensureMinSpace(20)
        const startY = w.getY()
        w.drawRuns(block.runs, 9.5, 14, MUTED, 18)
        w.drawBlockquoteBar(startY)
        w.gap(6)
        break
      }
    }
  }

  return doc.save()
}

// ── Legacy adapter: keep old signature working ───────────────────────────────

/** @deprecated — use htmlToBlocks + generatePdf(title, blocks) directly */
export function htmlToSections(
  html: string,
): Array<{ heading: string; body: string }> {
  const blocks = htmlToBlocks(html)
  const sections: Array<{ heading: string; body: string }> = []
  let currentHeading = ''
  let currentBody = ''

  const flush = () => {
    if (currentHeading || currentBody.trim()) {
      sections.push({
        heading: currentHeading || 'Overview',
        body: currentBody.trim(),
      })
    }
    currentBody = ''
  }

  for (const block of blocks) {
    switch (block.type) {
      case 'h1':
      case 'h2':
        flush()
        currentHeading = block.text
        break
      case 'h3':
        currentBody += `\n${block.text}\n`
        break
      case 'paragraph':
        currentBody += `\n${block.runs.map((r) => r.text).join('')}\n`
        break
      case 'bullet':
        for (const item of block.items) {
          currentBody += `\n- ${item.map((r) => r.text).join('')}`
        }
        currentBody += '\n'
        break
      case 'numbered':
        for (let i = 0; i < block.items.length; i++) {
          currentBody += `\n${i + 1}. ${block.items[i].map((r) => r.text).join('')}`
        }
        currentBody += '\n'
        break
      case 'blockquote':
        currentBody += `\n> ${block.runs.map((r) => r.text).join('')}\n`
        break
    }
  }
  flush()
  return sections.length > 0
    ? sections
    : [{ heading: 'Report', body: stripTags(html).trim() }]
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}
