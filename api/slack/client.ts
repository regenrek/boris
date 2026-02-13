import { fetchJsonWithRetry, fetchWithRetry } from "../utils/http.js";

const SLACK_API_BASE_URL = "https://slack.com/api";
const SLACK_RESPONSE_HOST = "hooks.slack.com";
const DEFAULT_TIMEOUT_MS = 8_000;

type SlackApiResponse = {
  ok: boolean;
  error?: string;
  messages?: any[];
};

export interface ConversationHistory {
  thread: string[];
  channel: string[];
  files: any[];
}

function getSlackBotToken(): string | null {
  return process.env.SLACK_BOT_TOKEN || null;
}

function buildSlackApiUrl(
  method: string,
  query: Record<string, string | number | undefined> = {}
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const queryString = params.toString();
  return queryString
    ? `${SLACK_API_BASE_URL}/${method}?${queryString}`
    : `${SLACK_API_BASE_URL}/${method}`;
}

async function slackGet(
  method: string,
  query: Record<string, string | number | undefined>
): Promise<SlackApiResponse> {
  const token = getSlackBotToken();
  if (!token) {
    return { ok: false, error: "missing_slack_token" };
  }

  try {
    const { data } = await fetchJsonWithRetry<SlackApiResponse>(
      buildSlackApiUrl(method, query),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        retries: 2,
      }
    );

    return data;
  } catch (error) {
    console.error(
      `Slack API GET ${method} failed:`,
      error instanceof Error ? error.message : String(error)
    );
    return { ok: false, error: "request_failed" };
  }
}

async function slackPost(
  method: string,
  body: Record<string, unknown>
): Promise<SlackApiResponse> {
  const token = getSlackBotToken();
  if (!token) {
    return { ok: false, error: "missing_slack_token" };
  }

  try {
    const { data } = await fetchJsonWithRetry<SlackApiResponse>(
      buildSlackApiUrl(method),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        retries: 0,
      }
    );

    return data;
  } catch (error) {
    console.error(
      `Slack API POST ${method} failed:`,
      error instanceof Error ? error.message : String(error)
    );
    return { ok: false, error: "request_failed" };
  }
}

function describeSlackFile(file: any): string {
  const name =
    typeof file?.name === "string" && file.name.length > 0
      ? file.name
      : "Untitled";
  const mimetype =
    typeof file?.mimetype === "string" && file.mimetype.length > 0
      ? file.mimetype
      : "unknown type";

  return `[File: ${name} (${mimetype})]`;
}

function formatSlackTimestamp(ts: unknown): string {
  const timestamp = Number.parseFloat(String(ts));
  if (!Number.isFinite(timestamp)) {
    return "00:00:00";
  }

  return new Date(timestamp * 1000).toLocaleTimeString();
}

function mapMessagesToContext(
  messages: any[],
  currentTs: string,
  fileMap: Map<string, any>,
  filters: {
    excludeCurrentTs?: boolean;
    excludeThreadMessages?: boolean;
  }
): string[] {
  const sortedMessages = [...messages].sort(
    (left: any, right: any) =>
      Number.parseFloat(left.ts || "0") - Number.parseFloat(right.ts || "0")
  );

  return sortedMessages
    .filter((message: any) => {
      if (message?.bot_id) {
        return false;
      }

      if (filters.excludeCurrentTs && message?.ts === currentTs) {
        return false;
      }

      if (filters.excludeThreadMessages && message?.thread_ts) {
        return false;
      }

      return true;
    })
    .map((message: any) => {
      if (Array.isArray(message.files)) {
        for (const file of message.files) {
          if (file?.id) {
            fileMap.set(file.id, file);
          }
        }
      }

      const fileSuffix = Array.isArray(message.files) && message.files.length > 0
        ? ` ${message.files.map(describeSlackFile).join(", ")}`
        : "";

      return `[${formatSlackTimestamp(message.ts)}] ${message.user || "unknown"}: ${message.text || ""}${fileSuffix}`;
    });
}

export async function fetchConversationHistory(
  channel: string,
  threadTs: string,
  currentTs: string,
  limit = 10
): Promise<ConversationHistory> {
  const result: ConversationHistory = {
    thread: [],
    channel: [],
    files: [],
  };

  if (!channel) {
    return result;
  }

  const fileMap = new Map<string, any>();

  if (threadTs) {
    const threadData = await slackGet("conversations.replies", {
      channel,
      ts: threadTs,
      limit,
    });

    if (threadData.ok && Array.isArray(threadData.messages)) {
      result.thread = mapMessagesToContext(threadData.messages, currentTs, fileMap, {
        excludeCurrentTs: true,
      });
    }

    const channelData = await slackGet("conversations.history", {
      channel,
      limit: Math.max(1, Math.floor(limit / 2)),
    });

    if (channelData.ok && Array.isArray(channelData.messages)) {
      result.channel = mapMessagesToContext(
        channelData.messages,
        currentTs,
        fileMap,
        {
          excludeThreadMessages: true,
        }
      );
    }
  } else {
    const channelData = await slackGet("conversations.history", {
      channel,
      limit,
    });

    if (channelData.ok && Array.isArray(channelData.messages)) {
      result.channel = mapMessagesToContext(
        channelData.messages,
        currentTs,
        fileMap,
        {
          excludeCurrentTs: true,
        }
      );
    }
  }

  result.files = Array.from(fileMap.values());
  return result;
}

async function callSlackMutation(
  method: string,
  body: Record<string, unknown>,
  ignoredErrors: string[] = []
): Promise<void> {
  const response = await slackPost(method, body);
  if (response.ok) {
    return;
  }

  if (response.error && ignoredErrors.includes(response.error)) {
    return;
  }

  console.error(`Slack API mutation ${method} failed:`, response.error || "unknown_error");
}

export async function addReaction(
  channel: string,
  timestamp: string,
  name: string
): Promise<void> {
  await callSlackMutation(
    "reactions.add",
    {
      channel,
      timestamp,
      name,
    },
    ["already_reacted"]
  );
}

export async function removeReaction(
  channel: string,
  timestamp: string,
  name: string
): Promise<void> {
  await callSlackMutation(
    "reactions.remove",
    {
      channel,
      timestamp,
      name,
    },
    ["no_reaction", "message_not_found"]
  );
}

export async function postMessage(
  channel: string,
  text: string,
  threadTs?: string
): Promise<void> {
  const payload: Record<string, unknown> = {
    channel,
    text,
  };

  if (threadTs) {
    payload.thread_ts = threadTs;
  }

  await callSlackMutation("chat.postMessage", payload);
}

export function isValidSlackResponseUrl(responseUrl: string): boolean {
  try {
    const parsed = new URL(responseUrl);
    return parsed.protocol === "https:" && parsed.hostname === SLACK_RESPONSE_HOST;
  } catch {
    return false;
  }
}

export async function postEphemeralResponse(
  responseUrl: string,
  text: string
): Promise<void> {
  try {
    await fetchWithRetry(
      responseUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          response_type: "ephemeral",
          text,
        }),
      },
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        retries: 0,
      }
    );
  } catch (error) {
    console.error(
      "Failed to send slash command response:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export function describeFileForContext(file: any): string {
  return describeSlackFile(file);
}
