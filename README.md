# Boris

Boris is an AI agent that turns Slack messages into structured Notion tasks.

Built for teams that want fast task capture from real conversations without manual copy/paste.

## What Boris Can Do

- Create tasks from `/task` slash commands
- Create tasks when people mention the bot in channels
- Create tasks from direct messages
- Parse natural language for title, priority, due date, assignee, and project
- Read message context (channel + thread) before creating a task
- Handle Slack file context and attach useful file details to Notion tasks
- Respond in Slack with clear success/error feedback

## 5-Minute Quickstart

Runtime requirement: Node.js `24.13+` (LTS line).

1. Create your Slack app and Notion integration:
- Slack setup: [docs/slack-setup.md](docs/slack-setup.md)
- Notion setup: [docs/notion-setup.md](docs/notion-setup.md)

2. Install and run:

```bash
git clone <your-repo-url>
cd boris
pnpm install
pnpm dev
```

3. Create `.env` and add required variables:

```env
SLACK_BOT_TOKEN=<your_slack_bot_token>
SLACK_SIGNING_SECRET=<your_slack_signing_secret>
NOTION_API_KEY=<your_notion_api_key>
NOTION_DATABASE_ID=<your_notion_database_id>
OPENAI_API_KEY=<your_openai_api_key>
```

4. Point Slack request URLs to your app:
- Events URL: `https://your-app-domain/api/slack/events`
- Slash command URL: `https://your-app-domain/api/slack/slash-command`

If you want a full first-run walkthrough, use [docs/quickstart.md](docs/quickstart.md).

## Environment Variables (At a Glance)

| Variable | Required | Purpose |
| --- | --- | --- |
| `SLACK_BOT_TOKEN` | Yes | Slack API access for messages/reactions/user lookup |
| `SLACK_SIGNING_SECRET` | Yes | Verify inbound Slack requests |
| `NOTION_API_KEY` | Yes | Notion integration token |
| `NOTION_DATABASE_ID` | Yes | Notion task database/data source target |
| `OPENAI_API_KEY` | Yes | AI parsing for task extraction |
| `NOTION_PROJECTS_DATABASE_ID` | No | Optional project lookup database |
| `DATABASE_URL` | No | Persistence store (default: local SQLite/libSQL file) |
| `MASTRA_LOG_LEVEL` | No | Log level override (`info`, `debug`, etc.) |

Full reference: [docs/environment-variables.md](docs/environment-variables.md).

## Docs

Start here: [docs/README.md](docs/README.md)

- Fast setup: [docs/quickstart.md](docs/quickstart.md)
- Slack app setup: [docs/slack-setup.md](docs/slack-setup.md)
- Notion setup: [docs/notion-setup.md](docs/notion-setup.md)
- Deploy to Vercel: [docs/deployment-vercel.md](docs/deployment-vercel.md)
- Usage examples: [docs/usage.md](docs/usage.md)
- Troubleshooting: [docs/troubleshooting.md](docs/troubleshooting.md)
- Security: [docs/security.md](docs/security.md)
- Architecture: [docs/architecture.md](docs/architecture.md)

## Common Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm test:coverage
```

## Public Repo Safety

- Never commit real tokens, secrets, or production IDs
- Keep all examples placeholder-based
- Store secrets only in local `.env` and hosting provider secret management

## License

[MIT](LICENSE)
