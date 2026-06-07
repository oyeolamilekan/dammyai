# DammyAI Setup Guide

Follow these steps to get DammyAI running on your machine.

---

## Prerequisites

- **Bun** (runtime & package manager) — [bun.sh](https://bun.sh)
- **Node.js 20+** — required by some tooling
- A **Cloudflare** account — for the PDF worker (optional; research PDFs only)
- Accounts on the services you want to integrate (see step 4)

---

## 1. Clone and Install

```bash
git clone <your-repo-url> dammyai
cd dammyai
bun install
```

---

## 2. Set Up Convex

DammyAI runs on Convex as its backend. You need a Convex project.

```bash
npx convex dev
```

This will prompt you to log in and create or select a project. After this, a `.convex/` folder appears with your project metadata.

Run this once to push the schema and generate client bindings:

```bash
npx convex dev --once
```

You should now have `convex/_generated/` populated.

---

## 3. Configure Environment Variables

Copy `.env.local` and fill in the values. If the file does not exist yet, create it:

```
VITE_CONVEX_URL=https://your-project.convex.cloud
VITE_CONVEX_SITE_URL=https://your-project.convex.site

# AI Gateway (required — routes model calls)
AI_GATEWAY_API_KEY=sk-...
AI_GATEWAY_MODEL=openai/gpt-4o-mini
AI_GATEWAY_MEMORY_MODEL=openai/gpt-4o-mini

# Auth
SITE_URL=http://localhost:3000
BETTER_AUTH_SECRET=your-secret-at-least-32-characters
FRONTEND_URL=http://localhost:3000

# Google OAuth (Gmail + Calendar)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth/gmail/callback
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/oauth/google-calendar/callback

# Todoist OAuth
TODOIST_CLIENT_ID=...
TODOIST_CLIENT_SECRET=...

# Notion OAuth
NOTION_CLIENT_ID=...
NOTION_CLIENT_SECRET=...
NOTION_REDIRECT_URI=http://localhost:3000/api/oauth/notion/callback

# Telegram Bot
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=YourBotUsername

# Web Search (at least one required)
EXA_API_KEY=...
TAVILY_API_KEY=...

# PDF Worker (optional — only needed for Telegram PDF delivery)
PDF_API_BASE_URL=http://localhost:8787
```

> Set these in your Convex dashboard under **Environment Variables** as well, so they are available at runtime inside Convex functions.

---

## 4. Set Up Third-Party Integrations

### Google (Gmail + Calendar)

1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Create a project (or use an existing one).
3. Enable the **Gmail API** and **Google Calendar API**.
4. Under **APIs & Services → Credentials**, create an OAuth 2.0 Client ID.
5. Add `http://localhost:3000/api/oauth/gmail/callback` as an authorized redirect URI.
6. Copy the Client ID and Client Secret to your env vars.

### Todoist

1. Go to [Todoist App Management](https://developer.todoist.com/appconsole.html).
2. Create a new app.
3. Set the OAuth redirect URL to `http://localhost:3000/api/oauth/todoist/callback`.
4. Copy the Client ID and Client Secret.

### Notion

1. Go to [Notion Integrations](https://www.notion.so/my-integrations).
2. Create a new internal integration.
3. Under **OAuth Domain & URIs**, add `http://localhost:3000/api/oauth/notion/callback` as a redirect URI.
4. Copy the Client ID and Client Secret.

### Telegram

1. Chat with [@BotFather](https://t.me/BotFather) on Telegram.
2. Use `/newbot` to create a bot.
3. Copy the token as `TELEGRAM_BOT_TOKEN`.
4. Set the bot username as `TELEGRAM_BOT_USERNAME`.
5. Set up a webhook pointing to your Convex site:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-project.convex.site/api/telegram/webhook"
   ```

### Web Search (Exa or Tavily)

- **Exa**: Get an API key at [exa.ai](https://exa.ai).
- **Tavily**: Get an API key at [tavily.com](https://tavily.com).

At least one is required. Set the corresponding env var.

---

## 5. (Optional) Set Up the PDF Worker

The PDF worker is a standalone Cloudflare Worker that renders HTML research reports into PDFs for Telegram delivery. Skip this if you don't need PDF delivery.

```bash
cd api/pdf
bun install
cd ../..
```

Configure `api/pdf/wrangler.jsonc` with your worker name and settings, then:

```bash
bun run deploy:pdf-api
```

Set `PDF_API_BASE_URL` to your deployed worker URL in both `.env.local` and the Convex dashboard.

For local development, run the worker alongside the main app:

```bash
bun run dev:pdf-api
```

---

## 6. Run the App

```bash
bun run dev
```

This starts three things concurrently:
- The **Vite dev server** on `http://localhost:3000`
- The **Convex dev server** (WebSocket + function reloading)
- Synced Convex schema push

Open `http://localhost:3000` in your browser.

---

## 7. First Steps After Sign-Up

1. Create an account using email and password.
2. Go to the **Soul** page and configure your assistant's personality.
3. Go to **Preferences** and set your timezone, preferred model, and search provider.
4. Go to **Integrations** and connect the services you want the AI to access.
5. Start chatting — the assistant will now have access to your connected tools.

**Try these first commands:**

- *"What's on my calendar today?"*
- *"Check my Gmail inbox."*
- *"Add a task to Todoist: buy groceries."*
- *"Research the latest developments in AI agents and send me a report."*
- *"Schedule a task: every weekday at 7 PM, summarize my day and Telegram me."*

---

## Available Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start Convex + Vite in dev mode |
| `bun run build` | Production build |
| `bun run lint` | TypeScript check + ESLint |
| `bun run format` | Format with Prettier |
| `bun run dev:pdf-api` | Run the PDF worker locally |
| `bun run deploy:pdf-api` | Deploy the PDF worker |

---

## Troubleshooting

**"Missing required environment variable" errors on startup**
Double-check that all env vars shown in step 3 are set in both `.env.local` AND in your Convex dashboard.

**OAuth redirects fail with 404**
Ensure `FRONTEND_URL` and OAuth redirect URIs match exactly (including trailing slashes or lack thereof).

**AI doesn't respond**
Verify `AI_GATEWAY_API_KEY` is set and the gateway URL is correct. Check the Convex dashboard logs.

**Telegram bot doesn't receive messages**
Confirm the webhook is set correctly and `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME` are set.

**Migrations or schema issues**
Push schema changes manually:
```bash
npx convex dev --once
```
Or go to the Convex dashboard → Data → Schema → "Push from code".
