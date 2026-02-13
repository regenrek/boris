# Troubleshooting

## Slack: Invalid Signature

Symptoms:

- Requests rejected with unauthorized/invalid signature

Likely cause:

- `SLACK_SIGNING_SECRET` mismatch
- Modified request body before verification

Fix:

1. Re-copy signing secret from Slack app credentials
2. Update env var locally/production
3. Redeploy or restart app

## Slack: Event URL Not Verified

Symptoms:

- Slack cannot verify events endpoint

Likely cause:

- Wrong URL path
- App not reachable publicly
- Runtime failing before response

Fix:

1. Use exact path `/api/slack/events`
2. Confirm public HTTPS endpoint
3. Check Vercel logs for runtime errors

## Slash Command Does Nothing

Symptoms:

- `/task` runs but no task appears

Likely cause:

- Wrong slash command request URL
- Missing bot scopes
- Missing required env vars

Fix:

1. Confirm slash URL: `/api/slack/slash-command`
2. Confirm required scopes in Slack
3. Verify env variables are set in deployment

## Notion Task Creation Fails

Symptoms:

- Boris returns failure while creating task

Likely cause:

- Integration not connected to database
- Wrong `NOTION_DATABASE_ID`
- Required properties missing or renamed

Fix:

1. Connect integration to task database
2. Re-check database ID
3. Ensure required property names exist exactly

## Assignee Not Mapped

Symptoms:

- Assignee appears as plain text instead of Notion people relation

Likely cause:

- Slack user has no matching Notion account/email/name

Fix:

1. Ensure Slack and Notion users share identifiable email/name
2. Confirm Notion user is visible to integration

## Project Not Linked

Symptoms:

- Task created without project relation

Likely cause:

- `NOTION_PROJECTS_DATABASE_ID` missing or invalid
- Project name not found in projects database

Fix:

1. Set `NOTION_PROJECTS_DATABASE_ID`
2. Ensure relation property `Projekt` exists
3. Ensure expected project names exist

## Debug Commands

```bash
pnpm dev
pnpm typecheck
pnpm test
pnpm test:coverage
vercel logs
```
