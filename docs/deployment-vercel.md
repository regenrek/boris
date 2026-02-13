# Deployment (Vercel)

This guide deploys Boris to Vercel and connects Slack production endpoints.

## Option A: Vercel Dashboard

1. Push repo to GitHub
2. In Vercel, import project
3. Build settings:
   - Framework Preset: `Other`
   - Build Command: `pnpm build`
   - Install Command: `pnpm install`
4. Add environment variables from `docs/environment-variables.md`
5. Deploy

## Option B: Vercel CLI

```bash
pnpm add -g vercel
vercel
```

Then add env vars:

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

Deploy production:

```bash
vercel --prod
```

## Post-Deploy Slack Update

Update Slack app URLs:

- Events: `https://<your-app>.vercel.app/api/slack/events`
- Slash command: `https://<your-app>.vercel.app/api/slack/slash-command`

## Smoke Test

1. Run `/task Create deployment verification task`
2. Confirm Slack response appears
3. Confirm task appears in Notion
4. Mention `@Boris` in channel and confirm threaded response

## Logs

```bash
vercel logs
```

Use logs to debug Slack signature errors, Notion permission errors, and workflow failures.
