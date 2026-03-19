import { tool } from 'ai'
import { z } from 'zod'
import { getOptionalEnv } from '../lib/env'

/**
 * Purpose: Creates the Tavily-backed web search tool used to fetch current web results when Tavily is the selected search provider.
 * Function type: tool factory
 * Args: none
 */
export function createTavilySearchTool() {
  return tool({
    description:
      'Search the web for current information. USE for factual questions needing up-to-date data, recent news, live prices, current events, or when you need to verify uncertain facts. Formulate queries as specific search terms, not full sentences. NOT for deep multi-source research (use startBackgroundResearch instead).',
    inputSchema: z.object({
      query: z.string().describe('Search query — use specific keywords like a search engine, e.g. "React 19 new features" not "What are the new features in React 19?"'),
      numResults: z
        .number()
        .optional()
        .default(5)
        .describe('Number of results to return (default 5, max 10). Use more for broader topics.'),
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
