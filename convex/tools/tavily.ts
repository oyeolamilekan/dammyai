import { tool } from 'ai'
import { z } from 'zod'
import { getOptionalEnv } from '../lib/env'

export function createTavilySearchTool() {
  return tool({
    description:
      'Search the web using Tavily to find up-to-date information, articles, and resources.',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      numResults: z
        .number()
        .optional()
        .default(5)
        .describe('Number of results (default 5, max 10)'),
    }),
    execute: async ({ query, numResults }) => {
      const apiKey = getOptionalEnv('TAVILY_API_KEY')
      if (!apiKey) {
        return 'Tavily search is not configured. Please set the TAVILY_API_KEY environment variable.'
      }

      const count = Math.min(numResults, 10)

      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: count,
          include_answer: true,
          search_depth: 'advanced',
        }),
      })

      if (!res.ok) {
        const error = await res.text()
        return `Web search failed: ${error}`
      }

      const data = (await res.json()) as {
        answer?: string
        results?: Array<{
          title: string
          url: string
          content?: string
          published_date?: string
        }>
      }

      if (!data.results || data.results.length === 0) {
        return `No results found for "${query}".`
      }

      const lines: Array<string> = []
      if (data.answer) {
        lines.push(`💡 ${data.answer}\n`)
      }
      for (const r of data.results) {
        const date = r.published_date ? ` (${r.published_date})` : ''
        const snippet = r.content ? `\n   ${r.content.slice(0, 300)}...` : ''
        lines.push(`🔗 ${r.title}${date}\n   ${r.url}${snippet}`)
      }
      return lines.join('\n\n')
    },
  })
}
