# Architecture

This project is a serverless Slack -> AI parsing -> Notion task pipeline.

## High-Level Flow

1. Slack sends event or slash command to API endpoint
2. API verifies Slack signature
3. Boris workflow parses request + context into structured task data
4. Notion integration creates task page with properties and optional files
5. Boris posts result back to Slack

## Main Runtime Components

- `api/index.ts`
  - Hono routes for Slack events and slash commands
  - Signature verification
  - Async processing with `waitUntil`

- `api/mastra/workflows/slack-to-notion-workflow.ts`
  - AI extraction of task fields
  - Fallback parsing path
  - Task creation step orchestration

- `api/mastra/integrations/notion.ts`
  - Notion client wrapper
  - User/project lookup
  - Task page creation and property mapping

- `api/mastra/utils/file-handler.ts`
  - Download Slack files
  - Upload files to Notion
  - Build Notion file blocks/fallback blocks

- `api/mastra/index.ts`
  - Mastra bootstrap
  - Workflow registration
  - LibSQL storage wiring

## External Integrations

- Slack API
- Notion API
- OpenAI API
- Vercel Functions runtime

## Failure Boundaries

- Slack auth failure: request rejected early
- AI parse failure: fallback parser used
- Notion failures: error returned to Slack with reason when available
- File upload failure: task still created with fallback file notes

## Testing Surface

- Unit tests cover:
  - File handling logic (`tests/file-handler.test.ts`)
  - Notion integration behavior (`tests/notion-service.test.ts`)
