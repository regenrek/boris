# Slack Setup

This guide configures Slack so Boris can receive events and create tasks.

## 1. Create Slack App

1. Go to `https://api.slack.com/apps`
2. Click `Create New App` -> `From scratch`
3. Choose app name (for example `Boris`)
4. Choose your workspace

## 2. Configure Bot Scopes

In `OAuth & Permissions` -> `Bot Token Scopes`, add:

- `app_mentions:read`
- `channels:history`
- `channels:read`
- `chat:write`
- `commands`
- `groups:history`
- `groups:read`
- `im:history`
- `im:read`
- `mpim:history`
- `mpim:read`
- `users:read`

Install app to workspace, then copy the bot token (`xoxb-...`):

- Save as `SLACK_BOT_TOKEN`

## 3. Copy Signing Secret

In `Basic Information` -> `App Credentials`:

- Copy `Signing Secret`
- Save as `SLACK_SIGNING_SECRET`

## 4. Configure Event Subscriptions

In `Event Subscriptions`:

- Enable events: `ON`
- Request URL: `https://<your-domain>/api/slack/events`
- Subscribe to bot events:
  - `app_mention`
  - `message.channels`
  - `message.groups`
  - `message.im`

## 5. Configure Slash Command

In `Slash Commands`:

- Create command: `/task`
- Request URL: `https://<your-domain>/api/slack/slash-command`
- Description: `Create a task in Notion`
- Usage hint: `[task description]`

## 6. Invite Boris to Channels

In each channel where Boris should work:

```text
/invite @Boris
```

## Validation

- `Event Subscriptions` URL shows verified
- `/task` command appears in Slack
- Mentioning `@Boris` in a channel triggers a response
