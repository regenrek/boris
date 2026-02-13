# Environment Variables

This is the canonical variable reference for Boris.

## Required

| Variable | Example | Description |
| --- | --- | --- |
| `SLACK_BOT_TOKEN` | `xoxb-...` | Bot token used for Slack API calls |
| `SLACK_SIGNING_SECRET` | `<secret>` | Verifies incoming Slack requests |
| `NOTION_API_KEY` | `ntn_...` | Notion integration token |
| `NOTION_DATABASE_ID` | `<database-id>` | Target Notion task database ID |
| `OPENAI_API_KEY` | `sk-...` | AI model access for parsing tasks |

## Optional

| Variable | Example | Description |
| --- | --- | --- |
| `NOTION_PROJECTS_DATABASE_ID` | `<projects-db-id>` | Enables project relation lookup |
| `DATABASE_URL` | `file:./mastra.db` | Persistent storage path |
| `MASTRA_LOG_LEVEL` | `info` | Log verbosity override |

## Local Setup

Create `.env` in repo root:

```env
SLACK_BOT_TOKEN=<your_slack_bot_token>
SLACK_SIGNING_SECRET=<your_slack_signing_secret>
NOTION_API_KEY=<your_notion_api_key>
NOTION_DATABASE_ID=<your_notion_database_id>
OPENAI_API_KEY=<your_openai_api_key>
NOTION_PROJECTS_DATABASE_ID=<optional_projects_db_id>
DATABASE_URL=file:./mastra.db
MASTRA_LOG_LEVEL=info
```

## Production Setup

Use Vercel project environment variables:

```bash
vercel env add SLACK_BOT_TOKEN
vercel env add SLACK_SIGNING_SECRET
vercel env add NOTION_API_KEY
vercel env add NOTION_DATABASE_ID
vercel env add OPENAI_API_KEY
vercel env add NOTION_PROJECTS_DATABASE_ID
vercel env add DATABASE_URL
vercel env add MASTRA_LOG_LEVEL
```

## Validation Checklist

- No surrounding quotes unless needed
- No trailing spaces/newlines
- Values exist in all required environments (dev/preview/prod)
- Slack signing secret matches app credentials exactly
