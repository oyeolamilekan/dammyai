import { tool } from "ai";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

const NOTION_VERSION = "2022-06-28";

interface NotionPage {
  id: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  properties: Record<string, NotionProperty>;
}

interface NotionProperty {
  type: string;
  title?: Array<{ plain_text: string }>;
}

interface NotionSearchResponse {
  results: Array<NotionPage>;
  has_more: boolean;
  next_cursor: string | null;
}

type AILikeCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

async function getNotionAccessToken(ctx: AILikeCtx, userId: string): Promise<string | null> {
  const record = await ctx.runQuery(internal.integrationStore.getIntegration, {
    userId,
    provider: "notion",
  });
  if (!record?.accessToken) return null;
  return record.accessToken;
}

function notionHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

function extractTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title" && prop.title?.length) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }
  return "(Untitled)";
}

export function createNotionDocumentTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      "Create a new page/document in the user's Notion workspace.",
    inputSchema: z.object({
      title: z.string().describe("Title of the new Notion page"),
      content: z.string().optional().describe("Plain text content for the page body"),
      parentPageId: z.string().optional().describe("ID of a parent page. If omitted, uses first accessible page."),
    }),
    execute: async ({ title, content, parentPageId }) => {
      const accessToken = await getNotionAccessToken(ctx, userId);
      if (!accessToken) {
        return "Notion is not connected. Please connect Notion from the dashboard first.";
      }

      const headers = notionHeaders(accessToken);
      let resolvedParentId = parentPageId;

      if (!resolvedParentId) {
        const searchRes = await fetch("https://api.notion.com/v1/search", {
          method: "POST",
          headers,
          body: JSON.stringify({
            filter: { value: "page", property: "object" },
            page_size: 1,
          }),
        });
        if (searchRes.ok) {
          const data = (await searchRes.json()) as { results: Array<{ id: string }> };
          if (data.results.length > 0) {
            resolvedParentId = data.results[0].id;
          }
        }
      }

      if (!resolvedParentId) {
        return "No accessible pages found in your Notion workspace. Please share at least one page with the integration.";
      }

      const children: Array<Record<string, unknown>> = [];
      if (content) {
        const paragraphs = content.split("\n").filter((p) => p.trim());
        for (const paragraph of paragraphs) {
          children.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: paragraph.slice(0, 2000) } }],
            },
          });
        }
      }

      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          parent: { page_id: resolvedParentId },
          properties: { title: { title: [{ text: { content: title } }] } },
          ...(children.length > 0 && { children }),
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        return `Failed to create Notion page: ${error}`;
      }

      const created = (await res.json()) as { id: string; url: string };
      return `📝 Created "${title}" in Notion.\nLink: ${created.url}`;
    },
  });
}

export function createUpdateNotionDocumentTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      "Update an existing Notion page. Can update title, append content, or archive.",
    inputSchema: z.object({
      pageId: z.string().optional().describe("Notion page ID. If omitted, searches by title."),
      search: z.string().optional().describe("Search query to find the page by title"),
      title: z.string().optional().describe("New title for the page"),
      content: z.string().optional().describe("Text content to append to the page"),
      archive: z.boolean().optional().describe("If true, archive the page"),
    }),
    execute: async ({ pageId, search, title, content, archive }) => {
      const accessToken = await getNotionAccessToken(ctx, userId);
      if (!accessToken) {
        return "Notion is not connected. Please connect Notion from the dashboard first.";
      }

      const headers = notionHeaders(accessToken);
      let resolvedPageId = pageId;

      if (!resolvedPageId && search) {
        const searchRes = await fetch("https://api.notion.com/v1/search", {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: search,
            filter: { value: "page", property: "object" },
            page_size: 5,
          }),
        });

        if (!searchRes.ok) {
          const error = await searchRes.text();
          return `Failed to search Notion: ${error}`;
        }

        const data = (await searchRes.json()) as NotionSearchResponse;
        if (data.results.length === 0) {
          return `No Notion page found matching "${search}".`;
        }

        const lower = search.toLowerCase();
        const match =
          data.results.find((p) => extractTitle(p).toLowerCase().includes(lower)) ??
          data.results[0];
        resolvedPageId = match.id;
      }

      if (!resolvedPageId) {
        return "Please provide a page ID or a search query to find the page.";
      }

      if (title || archive !== undefined) {
        const properties: Record<string, unknown> = {};
        if (title) {
          properties.title = { title: [{ text: { content: title } }] };
        }

        const res = await fetch(`https://api.notion.com/v1/pages/${resolvedPageId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            properties,
            ...(archive !== undefined && { archived: archive }),
          }),
        });

        if (!res.ok) {
          const error = await res.text();
          return `Failed to update Notion page: ${error}`;
        }
      }

      if (content) {
        const paragraphs = content.split("\n").filter((p) => p.trim());
        const children = paragraphs.map((paragraph) => ({
          object: "block" as const,
          type: "paragraph" as const,
          paragraph: {
            rich_text: [{ type: "text" as const, text: { content: paragraph.slice(0, 2000) } }],
          },
        }));

        const res = await fetch(
          `https://api.notion.com/v1/blocks/${resolvedPageId}/children`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ children }),
          },
        );

        if (!res.ok) {
          const error = await res.text();
          return `Failed to append content: ${error}`;
        }
      }

      if (archive) return `🗑️ Archived the Notion page.`;

      const parts: Array<string> = [];
      if (title) parts.push(`title to "${title}"`);
      if (content) parts.push("appended content");
      return `✅ Updated Notion page: ${parts.join(", ")}.`;
    },
  });
}

export function createSearchNotionTool(ctx: AILikeCtx, userId: string) {
  return tool({
    description:
      "Search for pages and documents in the user's Notion workspace.",
    inputSchema: z.object({
      query: z.string().optional().describe("Search query to find pages by title or content"),
      maxResults: z.number().optional().default(10).describe("Max results (default 10, max 20)"),
    }),
    execute: async ({ query, maxResults }) => {
      const accessToken = await getNotionAccessToken(ctx, userId);
      if (!accessToken) {
        return "Notion is not connected. Please connect Notion from the dashboard first.";
      }

      const headers = notionHeaders(accessToken);
      const count = Math.min(maxResults, 20);

      const body: Record<string, unknown> = {
        filter: { value: "page", property: "object" },
        page_size: count,
        sort: { direction: "descending", timestamp: "last_edited_time" },
      };
      if (query) body.query = query;

      const res = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.text();
        return `Failed to search Notion: ${error}`;
      }

      const data = (await res.json()) as NotionSearchResponse;
      const pages = data.results;

      if (pages.length === 0) {
        return query
          ? `No Notion pages found matching "${query}".`
          : "No accessible pages found in your Notion workspace.";
      }

      return pages
        .map((p) => {
          const title = extractTitle(p);
          const edited = new Date(p.last_edited_time).toLocaleDateString();
          return `📄 ${title}\n   Last edited: ${edited}\n   Link: ${p.url}`;
        })
        .join("\n\n");
    },
  });
}
