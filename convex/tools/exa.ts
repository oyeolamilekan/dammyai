import { tool } from 'ai'
import { z } from 'zod'
import { getOptionalEnv } from '../lib/env'

export function createWebSearchTool() {
  return tool({
    description:
      'Search the web using Exa to find up-to-date information, articles, and resources.',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      numResults: z
        .number()
        .optional()
        .default(5)
        .describe('Number of results (default 5, max 10)'),
    }),
    execute: async ({ query, numResults }) => {
      const apiKey = getOptionalEnv('EXA_API_KEY')
      if (!apiKey) {
        return 'Web search is not configured. Please set the EXA_API_KEY environment variable.'
      }

      const count = Math.min(numResults, 10)

      const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          numResults: count,
          contents: {
            text: { maxCharacters: 2000 },
            livecrawl: 'always',
            livecrawlTimeout: 5000,
          },
        }),
      })

      if (!res.ok) {
        const error = await res.text()
        return `Web search failed: ${error}`
      }

      const data = (await res.json()) as {
        results?: Array<{
          title: string
          url: string
          text?: string
          publishedDate?: string
        }>
      }

      if (!data.results || data.results.length === 0) {
        return `No results found for "${query}".`
      }

      return data.results
        .map((r) => {
          const date = r.publishedDate ? ` (${r.publishedDate})` : ''
          const snippet = r.text ? `\n   ${r.text.slice(0, 300)}...` : ''
          return `🔗 ${r.title}${date}\n   ${r.url}${snippet}`
        })
        .join('\n\n')
    },
  })
}
