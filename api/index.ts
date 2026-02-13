import { Hono } from "hono";
import { handle } from "hono/vercel";
import { waitUntil } from "@vercel/functions";
import { isValidSlackResponseUrl } from "./slack/client.js";
import {
  processAppMentionAsync,
  processDirectMessageAsync,
  processTaskAsync,
} from "./slack/task-processing.js";
import { InMemoryIdempotencyStore } from "./utils/idempotency.js";
import { verifySlackRequestSignature } from "./utils/slack-security.js";

const app = new Hono().basePath("/api");

const processedEventIds = new InMemoryIdempotencyStore({
  ttlMs: 60 * 60 * 1000,
  maxSize: 10_000,
});

const processedSlashRequests = new InMemoryIdempotencyStore({
  ttlMs: 10 * 60 * 1000,
  maxSize: 10_000,
});

function verifySlackRequest(rawBody: string, signature?: string, timestamp?: string) {
  return verifySlackRequestSignature({
    rawBody,
    signature,
    timestamp,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });
}

function parseJsonSafely(rawBody: string): any | null {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

app.post("/slack/events", async (c) => {
  const rawBody = await c.req.text();
  const verification = verifySlackRequest(
    rawBody,
    c.req.header("x-slack-signature"),
    c.req.header("x-slack-request-timestamp")
  );

  if (!verification.ok) {
    return c.json({ error: verification.error }, verification.status);
  }

  const body = parseJsonSafely(rawBody);
  if (!body) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (body.type === "url_verification") {
    return c.json({ challenge: body.challenge });
  }

  if (body.type !== "event_callback") {
    return c.json({ ok: true });
  }

  const eventId = typeof body.event_id === "string" ? body.event_id : undefined;
  if (eventId) {
    if (processedEventIds.has(eventId)) {
      return c.json({ ok: true });
    }

    processedEventIds.add(eventId);
  }

  const event = body.event;
  if (!event || typeof event.type !== "string") {
    return c.json({ ok: true });
  }

  try {
    if (event.type === "app_mention") {
      waitUntil(
        processAppMentionAsync({
          text: event.text || "",
          user: event.user || "",
          channel: event.channel || "",
          threadTs: event.thread_ts || event.ts || "",
          ts: event.ts || "",
          files: Array.isArray(event.files) ? event.files : [],
        })
      );
    }

    if (
      event.type === "message" &&
      event.channel_type === "im" &&
      event.text &&
      !event.bot_id
    ) {
      waitUntil(
        processDirectMessageAsync({
          text: event.text,
          user: event.user || "",
          channel: event.channel || "",
          ts: event.ts || "",
          files: Array.isArray(event.files) ? event.files : [],
        })
      );
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error(
      "Error processing Slack event:",
      error instanceof Error ? error.message : String(error)
    );
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.post("/slack/slash-command", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-slack-signature");
  const timestamp = c.req.header("x-slack-request-timestamp");
  const verification = verifySlackRequest(rawBody, signature, timestamp);

  if (!verification.ok) {
    return c.json({ error: verification.error }, verification.status);
  }

  if (signature && timestamp) {
    const idempotencyKey = `${timestamp}:${signature}`;
    if (processedSlashRequests.has(idempotencyKey)) {
      return c.json({
        response_type: "ephemeral",
        text: "⏳ Processing your task... I'll notify you when it's ready!",
      });
    }

    processedSlashRequests.add(idempotencyKey);
  }

  const params = new URLSearchParams(rawBody);
  const command = params.get("command") || "";

  if (command !== "/task") {
    return c.json({
      response_type: "ephemeral",
      text: "Unknown command",
    });
  }

  const text = (params.get("text") || "New task from Slack").trim();
  const userId = params.get("user_id") || "";
  const channelId = params.get("channel_id") || "";
  const responseUrl = params.get("response_url") || "";

  if (!userId || !channelId) {
    return c.json({
      response_type: "ephemeral",
      text: "Missing Slack command context.",
    });
  }

  if (!isValidSlackResponseUrl(responseUrl)) {
    return c.json(
      {
        response_type: "ephemeral",
        text: "Invalid response URL.",
      },
      400
    );
  }

  waitUntil(
    processTaskAsync({
      text,
      userId,
      channelId,
      responseUrl,
    })
  );

  return c.json({
    response_type: "ephemeral",
    text: "⏳ Processing your task... I'll notify you when it's ready!",
  });
});

app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/", (c) => c.json({ message: "Slack to Notion Task Bot API" }));

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const OPTIONS = handler;
