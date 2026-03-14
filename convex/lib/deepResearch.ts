import { Output, generateText } from 'ai'
import { z } from 'zod'
import { getOptionalEnv } from './env'

const getModelId = (override?: string) => {
  if (override?.trim()) {
    const v = override.trim()
    return v.includes('/') ? v : `openai/${v}`
  }
  const raw =
    getOptionalEnv('AI_GATEWAY_MODEL') ??
    getOptionalEnv('OPENAI_MODEL') ??
    'openai/gpt-5-mini'
  return raw.includes('/') ? raw : `openai/${raw}`
}

type Learning = {
  learning: string
  followUpQuestions: Array<string>
}

type SearchResult = {
  title: string
  url: string
  content: string
}

type Research = {
  query: string
  queries: Array<string>
  searchResults: Array<SearchResult>
  learnings: Array<Learning>
  completedQueries: Array<string>
}

function createEmptyResearch(query: string): Research {
  return {
    query,
    queries: [],
    searchResults: [],
    learnings: [],
    completedQueries: [],
  }
}

function deduplicateResults(results: Array<SearchResult>): Array<SearchResult> {
  const seen = new Set<string>()
  return results.filter((r) => {
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  })
}

async function searchExa(
  query: string,
  numResults = 5,
): Promise<Array<SearchResult>> {
  const apiKey = getOptionalEnv('EXA_API_KEY')
  if (!apiKey) return []

  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      numResults,
      contents: {
        text: { maxCharacters: 2000 },
        livecrawl: 'fallback',
        livecrawlTimeout: 3000,
      },
    }),
  })

  if (!res.ok) return []

  const data = (await res.json()) as {
    results?: Array<{ title: string; url: string; text?: string }>
  }

  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.text ?? '',
  }))
}

/** Run searches for multiple queries concurrently and return flat results. */
async function searchParallel(
  queries: Array<string>,
  numResults = 5,
): Promise<Array<SearchResult>> {
  const settled = await Promise.allSettled(
    queries.map((q) => searchExa(q, numResults)),
  )
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

async function generateSearchQueries(
  query: string,
  n: number,
  existingLearnings?: Array<string>,
): Promise<Array<string>> {
  const learningCtx =
    existingLearnings && existingLearnings.length > 0
      ? `\n\nKnown findings so far (generate queries that go DEEPER, not repeat these):\n${existingLearnings.slice(0, 8).join('\n')}`
      : ''
  try {
    const result = await generateText({
      model: getModelId(_researchModelOverride),
      prompt: `Generate ${n} diverse, specific search queries to research:\n\n${query}${learningCtx}`,
      output: Output.object({
        schema: z.object({
          queries: z.array(z.string()).min(1).max(n),
        }),
      }),
    })
    const queries = result.output.queries
    return queries.length > 0 ? queries : [query]
  } catch {
    return [query]
  }
}

async function extractLearnings(
  query: string,
  searchResults: Array<SearchResult>,
): Promise<Array<Learning>> {
  if (searchResults.length === 0) return []

  const content = searchResults
    .map(
      (r, i) =>
        `Source ${i + 1}: ${r.title}\nURL: ${r.url}\nContent: ${r.content.slice(0, 800)}`,
    )
    .join('\n\n')

  try {
    const result = await generateText({
      model: getModelId(_researchModelOverride),
      prompt: `Extract key learnings from these search results about: "${query}"\n\n${content}`,
      output: Output.object({
        schema: z.object({
          learnings: z.array(
            z.object({
              learning: z.string().describe('A specific finding or fact'),
              followUpQuestions: z
                .array(z.string())
                .max(2)
                .describe('1-2 questions that arise from this learning'),
            }),
          ),
        }),
      }),
    })
    return result.output.learnings
  } catch {
    return []
  }
}

/**
 * Purpose: Describes the progress callback signature used to stream status updates during deep research runs.
 * Type kind: type alias
 */
export type ProgressCallback = (
  step: string,
  message: string,
  status: 'running' | 'done' | 'error',
) => Promise<void>

// Thread model preference through deep research without changing every function signature
let _researchModelOverride: string | undefined

/**
 * Purpose: Runs the full deep-research workflow, including query generation, parallel search, learning extraction, follow-up rounds, and final report generation.
 * Function type: helper
 * Args:
 * - query: string
 * - depth: number
 * - breadth: number
 * - modelPreference: string | undefined
 * - onProgress: ProgressCallback | undefined
 */
export async function deepResearch(
  query: string,
  depth = 2,
  breadth = 3,
  modelPreference?: string,
  onProgress?: ProgressCallback,
): Promise<{ summary: string; report: string }> {
  _researchModelOverride = modelPreference
  const research = createEmptyResearch(query)

  const progress = onProgress ?? (async () => {})

  // Round 1: generate queries, then search ALL in parallel
  await progress(
    'generating_queries',
    'Generating initial search queries…',
    'running',
  )
  const queries = await generateSearchQueries(query, breadth)
  research.queries.push(...queries)
  await progress(
    'generating_queries',
    `Generated ${queries.length} search queries`,
    'done',
  )

  await progress(
    'searching',
    `Searching the web — round 1 of ${depth}…`,
    'running',
  )
  const round1Results = deduplicateResults(await searchParallel(queries, 5))
  research.searchResults.push(...round1Results)
  await progress(
    'searching',
    `Found ${round1Results.length} sources in round 1`,
    'done',
  )

  await progress(
    'extracting_learnings',
    `Analyzing sources — round 1 of ${depth}…`,
    'running',
  )
  const round1Learnings = await extractLearnings(query, round1Results)
  research.learnings.push(...round1Learnings)
  research.completedQueries.push(...queries)
  await progress(
    'extracting_learnings',
    `Extracted ${round1Learnings.length} learnings from round 1`,
    'done',
  )

  // Follow-up rounds: use learnings to generate deeper queries
  for (let d = 1; d < depth; d++) {
    const round = d + 1
    const existingLearnings = research.learnings.map((l) => l.learning)

    await progress(
      'generating_queries',
      `Generating deeper queries — round ${round} of ${depth}…`,
      'running',
    )
    const followUpQueries = await generateSearchQueries(
      query,
      breadth,
      existingLearnings,
    )

    // Skip queries we've already run
    const newQueries = followUpQueries.filter(
      (q) => !research.completedQueries.includes(q),
    )
    if (newQueries.length === 0) {
      await progress(
        'generating_queries',
        `No new queries for round ${round} — skipping`,
        'done',
      )
      break
    }
    await progress(
      'generating_queries',
      `Generated ${newQueries.length} follow-up queries`,
      'done',
    )

    await progress(
      'searching',
      `Searching the web — round ${round} of ${depth}…`,
      'running',
    )
    const roundResults = deduplicateResults(await searchParallel(newQueries, 3))
    // Remove URLs we already have
    const existingUrls = new Set(research.searchResults.map((r) => r.url))
    const freshResults = roundResults.filter((r) => !existingUrls.has(r.url))
    research.searchResults.push(...freshResults)
    await progress(
      'searching',
      `Found ${freshResults.length} new sources in round ${round}`,
      'done',
    )

    await progress(
      'extracting_learnings',
      `Analyzing sources — round ${round} of ${depth}…`,
      'running',
    )
    const roundLearnings = await extractLearnings(query, freshResults)
    research.learnings.push(...roundLearnings)
    research.completedQueries.push(...newQueries)
    await progress(
      'extracting_learnings',
      `Extracted ${roundLearnings.length} learnings from round ${round}`,
      'done',
    )
  }

  await progress(
    'generating_report',
    'Writing comprehensive research report…',
    'running',
  )
  const result = await generateReport(research)
  await progress('generating_report', 'Report generated successfully', 'done')

  return result
}

const buildReportSystemPrompt = () =>
  `
You are an expert research analyst. Today's date is ${new Date().toISOString()}.

## Audience & Tone
- The reader is a highly experienced analyst — be detailed, precise, and thorough.
- Do not simplify. Assume expertise in all subject matter.
- Accuracy is paramount.

## Report Structure
1. **Executive Summary** — Key findings at a glance.
2. **Introduction** — Context and background.
3. **Key Findings** — Detailed analysis organized by theme.
4. **Analysis & Implications** — Critical evaluation and broader impact.
5. **Recommendations** — Actionable next steps.
6. **Conclusion** — Summary and final thoughts.
7. **Sources & References** — Detailed source information.

## Formatting
- Output clean, semantic HTML (<h1>, <h2>, <p>, <ul>, <blockquote>, etc.).
- Start directly with HTML tags — no markdown fences, no backticks wrapper.
- Do not include inline styles, classes for visual layout, spacer elements, fixed-height containers, or page-break directives.
- Do not wrap sections in full-page blocks or elements that reserve large empty areas.
- The report should read like an authoritative, professional analysis.
`.trim()

function normalizeReportHtmlForPdf(content: string): string {
  return content
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(html|head|body)[^>]*>/gi, '')
    .replace(/\sstyle=(['"]).*?\1/gi, '')
    .trim()
}

async function generateReport(
  research: Research,
): Promise<{ summary: string; report: string }> {
  // Deduplicate learnings by content similarity
  const uniqueLearnings = research.learnings.filter(
    (l, i, arr) => arr.findIndex((x) => x.learning === l.learning) === i,
  )

  // Deduplicate sources by URL
  const uniqueSources = deduplicateResults(research.searchResults)

  // Cap context to avoid excessive token usage
  const trimmedLearnings = uniqueLearnings.slice(0, 30)
  const trimmedSources = uniqueSources.slice(0, 20)

  const result = await generateText({
    model: getModelId(_researchModelOverride),
    prompt: `Research Query: "${research.query}"

Key Findings and Learnings:
${trimmedLearnings
  .map((learning, i) => `${i + 1}. ${learning.learning}`)
  .join('\n')}

Sources Used:
${trimmedSources
  .map(
    (source, i) =>
      `${i + 1}. ${source.title} — ${source.url}
   ${source.content.substring(0, 300)}`,
  )
  .join('\n\n')}

Generate a comprehensive research report based on this research data. Output clean HTML. Do NOT use markdown or code fences.
Also provide a very short plain-text summary (1–2 sentences) of the key takeaway.`,
    system: buildReportSystemPrompt(),
    output: Output.object({
      schema: z.object({
        summary: z
          .string()
          .describe(
            'A very short 1–2 sentence plain-text summary of the report',
          ),
        report: z
          .string()
          .describe('The full comprehensive research report in clean HTML'),
      }),
    }),
  })

  return result.output
}

/**
 * Purpose: Wraps report HTML in a full styled document shell so it can be rendered cleanly as a PDF.
 * Function type: helper
 * Args:
 * - title: string
 * - content: string
 */
export function wrapReportHtml(title: string, content: string): string {
  const normalizedContent = normalizeReportHtmlForPdf(content)

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        @page {
            size: A4;
            margin: 18mm 16mm;
        }

        html {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        body {
            font-family: 'Inter', Arial, Helvetica, sans-serif;
            margin: 0;
            line-height: 1.65;
            color: #1f2937;
            font-size: 12pt;
            background: #fff;
        }

        .report {
            max-width: none;
        }

        h1, h2, h3, h4 {
            color: #1f2937;
            font-weight: 700;
            line-height: 1.25;
            break-after: avoid-page;
            page-break-after: avoid;
            break-inside: avoid;
            page-break-inside: avoid;
        }

        h1 {
            margin: 0 0 18px;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 12px;
            font-size: 24pt;
        }

        h2 {
            margin: 28px 0 12px;
            border-bottom: 1px solid #d1d5db;
            padding-bottom: 8px;
            font-size: 18pt;
        }

        h3 {
            margin: 22px 0 10px;
            font-size: 14pt;
        }

        h4 {
            margin: 18px 0 8px;
            font-size: 12.5pt;
        }

        p, ul, ol, blockquote, table, hr {
            margin: 0 0 14px;
        }

        p {
            orphans: 3;
            widows: 3;
        }

        ul, ol {
            padding-left: 24px;
            break-before: auto;
            page-break-before: auto;
        }

        li {
            margin-bottom: 8px;
            break-inside: avoid;
            page-break-inside: avoid;
        }

        blockquote {
            border-left: 4px solid #2563eb;
            padding: 12px 16px;
            background-color: #f8fafc;
            border-radius: 0 8px 8px 0;
            font-style: italic;
            break-inside: avoid;
            page-break-inside: avoid;
        }

        strong {
            color: #111827;
        }

        em, .date {
            color: #6b7280;
        }

        a {
            color: #2563eb;
            text-decoration: none;
            word-break: break-word;
        }

        hr {
            border: none;
            border-top: 1px solid #e5e7eb;
        }

        table {
            border-collapse: collapse;
            width: 100%;
            border: 1px solid #d1d5db;
            font-size: 10.5pt;
        }

        thead {
            display: table-header-group;
        }

        tr {
            break-inside: avoid;
            page-break-inside: avoid;
        }

        th, td {
            border: 1px solid #d1d5db;
            padding: 10px;
            text-align: left;
            vertical-align: top;
        }

        th {
            background-color: #f3f4f6;
            font-weight: bold;
            color: #1f2937;
        }

        section, article, div {
            break-before: auto;
            page-break-before: auto;
        }

        .date {
            margin-bottom: 18px;
            font-size: 10pt;
        }
    </style>
</head>
<body>
    <main class="report">
        <div class="date">Generated on ${new Date().toLocaleDateString()}</div>
        ${normalizedContent}
    </main>
</body>
</html>`
}
