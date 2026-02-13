# Usage

Boris supports slash commands, mentions, and direct messages.

## Slash Command

Basic:

```text
/task Update onboarding docs
```

With context:

```text
/task Prepare release notes for v2
Due next Tuesday
Owner: @alex
```

## Mention in Channel

```text
@Boris create a task to investigate checkout timeout; high priority; assign to @sarah
```

Behavior:

- Boris reads recent conversation context
- Creates task with parsed fields
- Replies in thread with task result

## Direct Message

Send Boris a DM:

```text
Create a task: migrate customer export endpoint by end of week
```

Boris treats DM text as task intent and creates a task the same way.

## What Boris Parses

- Title
- Description/context
- Priority keywords
- Due dates (absolute and relative)
- Assignee (mention, name, email, or Slack user ID)
- Project (if projects database is configured)

## File Handling

When files are present in Slack messages:

- Boris collects relevant files from context
- Attempts Notion upload
- If upload fails, adds fallback file notes and Slack link

## Response Patterns

- Success: task URL returned in Slack
- Failure: clear error message with reason when available
