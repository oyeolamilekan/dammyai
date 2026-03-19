/**
 * Purpose: Converts assistant Markdown into Telegram-safe HTML while preserving common formatting patterns.
 * Function type: helper
 * Args:
 * - md: string
 */
export function markdownToTelegramHtml(md: string): string {
  let html = md

  // 1. Escape HTML entities first (before we insert any HTML tags)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // 2. Fenced code blocks: ```lang\n...\n``` → <pre>...</pre>
  html = html.replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, code: string) => {
    return `<pre>${code.trimEnd()}</pre>`
  })

  // 3. Inline code: `...` → <code>...</code>
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 4. Headings: # text → bold (Telegram has no heading tag)
  html = html.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')

  // 5. Horizontal rules: --- or *** or ___ → blank line
  html = html.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '')

  // 6. Blockquotes: > text → <blockquote> (supported in Telegram Bot API)
  // Collect consecutive > lines into a single blockquote block
  html = html.replace(
    /(?:^&gt;\s?(.*)$\n?)+/gm,
    (match) => {
      const lines = match
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => l.replace(/^&gt;\s?/, ''))
        .join('\n')
      return `<blockquote>${lines}</blockquote>\n`
    },
  )

  // 7. Unordered list items: - text or * text → • text (bullet character)
  // Only match lines starting with - or * followed by a space (not bold/italic markers)
  html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '  • $1')

  // 8. Bold: **text** → <b>text</b>
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

  // 9. Italic: *text* or _text_ → <i>text</i>
  html = html.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '<i>$1</i>')
  html = html.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<i>$1</i>')

  // 10. Strikethrough: ~~text~~ → <s>text</s>
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>')

  // 11. Links: [text](url) → <a href="url">text</a>
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // 12. Clean up excessive blank lines (3+ → 2)
  html = html.replace(/\n{3,}/g, '\n\n')

  return html.trim()
}
