import { tool } from 'ai'
import { z } from 'zod'
import { getOptionalEnv } from '../lib/env'

/**
 * Purpose: Creates the Exa-backed web search tool used to fetch current web results for general AI queries.
 * Function type: tool factory
 * Args: none
 */
export function createWebSearchTool() {
  return tool({
    description:
      'Search the web for current information. USE for factual questions needing up-to-date data, recent news, live prices, current events, or when you need to verify uncertain facts. Formulate queries as specific search terms, not full sentences. NOT for deep multi-source research (use startBackgroundResearch instead).',
    inputSchema: z.object({
      query: z.string().describe('Search query — use specific keywords like a search engine, e.g. "Tesla stock price 2024" not "What is Tesla\'s current stock price?"'),
      numResults: z
        .number()
        .optional()
        .default(5)
        .describe('Number of results to return (default 5, max 10). Use more for broader topics.'),
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
