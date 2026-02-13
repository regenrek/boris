# Boris Quickstart

This guide gets Boris running end-to-end with Slack and Notion.

## Prerequisites

- Node.js `24.13+` (LTS line)
- `pnpm`
- A Slack workspace where you can install apps
- A Notion workspace where you can create integrations and databases
- OpenAI API key

## 1. Clone and Install

```bash
git clone <your-repo-url>
cd boris
pnpm install
```

## 2. Prepare Integrations

Complete these guides first:

- Slack: `docs/slack-setup.md`
- Notion: `docs/notion-setup.md`

## 3. Create Environment File

Create `.env` in repo root:

```env
SLACK_BOT_TOKEN=<your_slack_bot_token>
SLACK_SIGNING_SECRET=<your_slack_signing_secret>
NOTION_API_KEY=<your_notion_api_key>
NOTION_DATABASE_ID=<your_notion_database_id>
OPENAI_API_KEY=<your_openai_api_key>

# Optional
NOTION_PROJECTS_DATABASE_ID=<your_projects_database_id>
DATABASE_URL=file:./mastra.db
MASTRA_LOG_LEVEL=info
```

## 4. Start Boris Locally

```bash
pnpm dev
```

Default local URL: `http://localhost:3000` (or the port shown by Vercel dev).

## 5. Configure Slack URLs

Set Slack request URLs to your running app:

- Events: `https://<your-domain>/api/slack/events`
- Slash command: `https://<your-domain>/api/slack/slash-command`

For local testing, use a tunnel (for example ngrok/cloudflared) and use its HTTPS URL.

## 6. Verify With a Real Task

In Slack:

```text
/task Create onboarding checklist for new hires due next Friday
```

Expected:

- Slack responds immediately with processing confirmation
- Boris later returns success/error message
- Task appears in Notion with structured fields

## Done Checklist

- Slack app installed with required scopes
- Slack request URLs verify successfully
- Notion integration connected to task database
- `.env` has all required variables
- `/task` command creates a task in Notion
