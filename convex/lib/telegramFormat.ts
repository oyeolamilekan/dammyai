/**
 * Purpose: Converts assistant Markdown into Telegram-safe HTML while preserving common formatting patterns.
 * Function type: helper
 * Args:
 * - md: string
 */
export function markdownToTelegramHtml(md: string): string {
  let html = md

  // 1. Escape HTML entities that aren't already part of our output
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // 2. Fenced code blocks: ```lang\n...\n``` → <pre>...</pre>
  html = html.replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, code: string) => {
    return `<pre>${code.trimEnd()}</pre>`
  })

  // 3. Inline code: `...` → <code>...</code>
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 4. Bold: **text** → <b>text</b>
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

  // 5. Italic: *text* or _text_ → <i>text</i>
  html = html.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '<i>$1</i>')
  html = html.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<i>$1</i>')

  // 6. Strikethrough: ~~text~~ → <s>text</s>
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>')

  // 7. Links: [text](url) → <a href="url">text</a>
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  return html
}
