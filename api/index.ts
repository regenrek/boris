import { Hono } from "hono";
import { handle } from "hono/vercel";
import { createHmac } from "crypto";
import { slackToNotionWorkflow } from "./mastra/workflows/slack-to-notion-workflow.js";
import { waitUntil } from "@vercel/functions";

const app = new Hono().basePath("/api");

// Slack event handler
app.post("/slack/events", async (c) => {
  const rawBody = await c.req.text();
  const body = JSON.parse(rawBody);
  const signature = c.req.header("x-slack-signature");
  const timestamp = c.req.header("x-slack-request-timestamp");
  const signingSecret = process.env.SLACK_SIGNING_SECRET!;

  console.log("Received Slack event:", JSON.stringify(body, null, 2));

  if (!signature || !timestamp || !signingSecret) {
    console.error("Missing auth headers");
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Prevent replay attacks
  const requestTime = parseInt(timestamp);
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - requestTime) > 60 * 5) {
    return c.json({ error: "Request timeout" }, 401);
  }

  // Verify signature
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const mySignature = `v0=${createHmac("sha256", signingSecret)
    .update(sigBasestring)
    .digest("hex")}`;

  if (mySignature !== signature) {
    console.error("Invalid signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const { type, challenge, event: slackEvent } = body;

  // Handle URL verification
  if (type === "url_verification") {
    console.log("URL verification challenge received");
    return c.json({ challenge });
  }

  // Handle events
  if (type === "event_callback") {
    console.log("Processing event_callback, event type:", slackEvent?.type);

    try {
      // Handle different event types
      if (slackEvent.type === "app_mention") {
        // Bot was mentioned, process the message
        console.log("Bot mentioned in channel:", slackEvent.channel);
        console.log("Message text:", slackEvent.text);
        console.log("User:", slackEvent.user);

        // Use waitUntil for async processing
        waitUntil(
          processAppMentionAsync({
            text: slackEvent.text,
            user: slackEvent.user,
            channel: slackEvent.channel,
            thread_ts: slackEvent.thread_ts || slackEvent.ts,
            ts: slackEvent.ts,
            files: slackEvent.files || [],
          })
        );
      } else if (slackEvent.type === "message") {
        // Regular message, only process if it's a DM to the bot
        console.log(
          "Message event received, channel_type:",
          slackEvent.channel_type
        );

        if (
          slackEvent.channel_type === "im" &&
          slackEvent.text &&
          !slackEvent.bot_id
        ) {
          console.log("Processing DM from user:", slackEvent.user);

          waitUntil(
            processDirectMessageAsync({
              text: slackEvent.text,
              user: slackEvent.user,
              channel: slackEvent.channel,
              ts: slackEvent.ts,
              files: slackEvent.files || [],
            })
          );
        }
      }

      return c.json({ ok: true });
    } catch (error) {
      console.error("Error processing Slack event:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }

  console.log("Unknown event type:", type);
  return c.json({ ok: true });
});

// Slack slash command handler
app.post("/slack/slash-command", async (c) => {
  const signature = c.req.header("x-slack-signature");
  const timestamp = c.req.header("x-slack-request-timestamp");
  const signingSecret = process.env.SLACK_SIGNING_SECRET!;

  if (!signature || !timestamp || !signingSecret) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get raw body for signature verification
  const rawBody = await c.req.text();

  // Verify signature
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const mySignature = `v0=${createHmac("sha256", signingSecret)
    .update(sigBasestring)
    .digest("hex")}`;

  if (mySignature !== signature) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Parse the form data manually
  const params = new URLSearchParams(rawBody);
  const text = params.get("text") || "";
  const user_id = params.get("user_id") || "";
  const channel_id = params.get("channel_id") || "";
  const command = params.get("command") || "";

  // Handle /task command
  if (command === "/task") {
    const response_url = params.get("response_url") || "";

    // Process the task asynchronously using waitUntil
    waitUntil(
      processTaskAsync({
        text: text || "New task from Slack",
        user_id,
        channel_id,
        response_url,
      })
    );

    // Return immediate response to Slack
    return c.json({
      response_type: "ephemeral",
      text: "⏳ Processing your task... I'll notify you when it's ready!",
    });
  } else {
    return c.json({
      response_type: "ephemeral",
      text: "Unknown command",
    });
  }
});

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Root handler
app.get("/", (c) => {
  return c.json({ message: "Slack to Notion Task Bot API" });
});

// Process app mention by fetching conversation context
async function processAppMentionAsync({
  text,
  user,
  channel,
  thread_ts,
  ts,
  files,
}: {
  text: string;
  user: string;
  channel: string;
  thread_ts: string;
  ts: string;
  files: any[];
}) {
  console.log("processAppMentionAsync started", {
    text,
    user,
    channel,
    thread_ts,
    ts,
  });

  try {
    // First, send a reaction to acknowledge we're processing
    console.log("Adding reaction...");
    await addReaction(channel, ts, "hourglass_flowing_sand");

    // Start with fetching recent conversation history (up to 20 messages)
    let messageLimit = 20;
    let conversationHistory = await fetchConversationHistory(
      channel,
      thread_ts,
      ts,
      messageLimit
    );
    
    // Collect all files from conversation history and current message, deduplicating by ID
    const fileMap = new Map<string, any>();
    
    // Add files from conversation history
    conversationHistory.files.forEach((file: any) => {
      if (file.id) {
        fileMap.set(file.id, file);
      }
    });
    
    // Add files from current message
    if (files && files.length > 0) {
      files.forEach((file: any) => {
        if (file.id) {
          fileMap.set(file.id, file);
        }
      });
    }
    
    const allFiles = Array.from(fileMap.values());

    // Combine the conversation history into context
    let contextText = text;
    if (conversationHistory.thread.length > 0 || conversationHistory.channel.length > 0) {
      contextText = "";
      
      if (conversationHistory.channel.length > 0) {
        contextText += `Channel conversation history (${conversationHistory.channel.length} messages):\n${conversationHistory.channel.join("\n")}\n\n`;
      }
      
      if (conversationHistory.thread.length > 0) {
        contextText += `Thread conversation (${conversationHistory.thread.length} messages):\n${conversationHistory.thread.join("\n")}\n\n`;
      }
      
      contextText += `Current message: ${text}`;
      
      // Add file information from current message
      if (files && files.length > 0) {
        const fileInfo = files.map((file: any) => 
          `[File: ${file.name || 'Untitled'} (${file.mimetype || 'unknown type'})]`
        ).join(', ');
        contextText += ` ${fileInfo}`;
      }
    }

    console.log("Processing app mention with context:", contextText);

    // First attempt to process the task with initial context
    let run = slackToNotionWorkflow.createRun();
    let result = await run.start({
      inputData: {
        text: contextText,
        user: user,
        channel: channel,
        timestamp: new Date().toISOString(),
        files: allFiles,
      },
    });

    // Check if AI needs more context (look for the note in the description)
    if (result.status === "success") {
      const workflowOutput =
        (result as any).result ||
        (result as any).output ||
        (result as any).data;

      // If the AI indicates it needs more context, fetch more messages
      if (
        workflowOutput?.description?.includes(
          "This conversation may reference earlier context not included here"
        ) &&
        messageLimit < 50
      ) {
        console.log(
          "AI requested more context, fetching additional messages..."
        );

        // Fetch more messages (up to 50)
        messageLimit = 50;
        conversationHistory = await fetchConversationHistory(
          channel,
          thread_ts,
          ts,
          messageLimit
        );
        
        // File collection is already handled with deduplication above

        contextText = text;
        if (conversationHistory.thread.length > 0 || conversationHistory.channel.length > 0) {
          contextText = "";
          
          if (conversationHistory.channel.length > 0) {
            contextText += `Extended channel conversation history (${conversationHistory.channel.length} messages):\n${conversationHistory.channel.join("\n")}\n\n`;
          }
          
          if (conversationHistory.thread.length > 0) {
            contextText += `Extended thread conversation (${conversationHistory.thread.length} messages):\n${conversationHistory.thread.join("\n")}\n\n`;
          }
          
          contextText += `Current message: ${text}`;
          
          // Add file information from current message
          if (files && files.length > 0) {
            const fileInfo = files.map((file: any) => 
              `[File: ${file.name || 'Untitled'} (${file.mimetype || 'unknown type'})]`
            ).join(', ');
            contextText += ` ${fileInfo}`;
          }
        }

        // Retry with more context
        run = slackToNotionWorkflow.createRun();
        result = await run.start({
          inputData: {
            text: contextText,
            user: user,
            channel: channel,
            timestamp: new Date().toISOString(),
            files: allFiles,
          },
        });
      }
    }

    // Remove the processing reaction
    await removeReaction(channel, ts, "hourglass_flowing_sand");

    // Add success or failure reaction and send message
    if (result.status === "success") {
      const workflowOutput =
        (result as any).result ||
        (result as any).output ||
        (result as any).data;

      if (workflowOutput?.success) {
        await addReaction(channel, ts, "white_check_mark");

        const message = workflowOutput.taskUrl
          ? `✅ Task created! View it here: ${workflowOutput.taskUrl}`
          : "✅ Task created successfully!";

        await postMessage(channel, message, thread_ts);
      } else {
        await addReaction(channel, ts, "x");
        await postMessage(
          channel,
          `❌ Failed to create task: ${workflowOutput?.message || "Unknown error"}`,
          thread_ts
        );
      }
    } else {
      await addReaction(channel, ts, "x");
      const failedResult = result as any;
      await postMessage(
        channel,
        `❌ Failed to create task: ${failedResult.error?.message || "Unknown error"}`,
        thread_ts
      );
    }
  } catch (error: any) {
    console.error("Error processing app mention:", error);

    try {
      await removeReaction(channel, ts, "hourglass_flowing_sand");
      await addReaction(channel, ts, "x");
      await postMessage(
        channel,
        `❌ Error: ${error.message || "An error occurred while creating the task."}`,
        thread_ts
      );
    } catch (slackError) {
      console.error("Failed to send error to Slack:", slackError);
    }
  }
}

// Process direct message
async function processDirectMessageAsync({
  text,
  user,
  channel,
  ts,
  files,
}: {
  text: string;
  user: string;
  channel: string;
  ts: string;
  files: any[];
}) {
  try {
    // Fetch conversation history for DMs too (up to 10 messages for context)
    const conversationHistory = await fetchConversationHistory(
      channel,
      "",
      ts,
      10
    );
    
    // Collect all files from conversation history and current message, deduplicating by ID
    const fileMap = new Map<string, any>();
    
    // Add files from conversation history
    conversationHistory.files.forEach((file: any) => {
      if (file.id) {
        fileMap.set(file.id, file);
      }
    });
    
    // Add files from current message
    if (files && files.length > 0) {
      files.forEach((file: any) => {
        if (file.id) {
          fileMap.set(file.id, file);
        }
      });
    }
    
    const allFiles = Array.from(fileMap.values());

    // Combine the conversation history into context
    let contextText = conversationHistory.channel.length > 0
      ? `Conversation history (${conversationHistory.channel.length} messages):\n${conversationHistory.channel.join("\n")}\n\nCurrent message: ${text}`
      : text;
      
    // Add file information from current message
    if (files && files.length > 0) {
      const fileInfo = files.map((file: any) => 
        `[File: ${file.name || 'Untitled'} (${file.mimetype || 'unknown type'})]`
      ).join(', ');
      contextText += ` ${fileInfo}`;
    }

    // Process as a regular task with context
    const run = slackToNotionWorkflow.createRun();
    const result = await run.start({
      inputData: {
        text: contextText,
        user: user,
        channel: channel,
        timestamp: new Date().toISOString(),
        files: allFiles,
      },
    });

    if (result.status === "success") {
      const workflowOutput =
        (result as any).result ||
        (result as any).output ||
        (result as any).data;

      if (workflowOutput?.success) {
        const message = workflowOutput.taskUrl
          ? `✅ Task created! View it here: ${workflowOutput.taskUrl}`
          : "✅ Task created successfully!";

        await postMessage(channel, message);
      } else {
        await postMessage(
          channel,
          `❌ Failed to create task: ${workflowOutput?.message || "Unknown error"}`
        );
      }
    } else {
      const failedResult = result as any;
      await postMessage(
        channel,
        `❌ Failed to create task: ${failedResult.error?.message || "Unknown error"}`
      );
    }
  } catch (error: any) {
    console.error("Error processing direct message:", error);

    try {
      await postMessage(
        channel,
        `❌ Error: ${error.message || "An error occurred while creating the task."}`
      );
    } catch (slackError) {
      console.error("Failed to send error to Slack:", slackError);
    }
  }
}

// Slack API helper functions
async function fetchConversationHistory(
  channel: string,
  thread_ts: string,
  current_ts: string,
  limit: number = 10
): Promise<{ thread: string[], channel: string[], files: any[] }> {
  try {
    const result = { thread: [] as string[], channel: [] as string[], files: [] as any[] };
    const fileMap = new Map<string, any>(); // Use Map to deduplicate files by ID
    
    // If we have a thread_ts, fetch both thread and channel history
    if (thread_ts) {
      // Fetch thread messages
      const threadUrl = `https://slack.com/api/conversations.replies?channel=${channel}&ts=${thread_ts}&limit=${limit}`;
      const threadResponse = await fetch(threadUrl, {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      });
      
      const threadData: any = await threadResponse.json();
      console.log("Thread history response", threadData);
      
      if (threadData.ok && threadData.messages) {
        // Sort messages by timestamp (oldest first)
        const sortedThreadMessages = threadData.messages.sort(
          (a: any, b: any) => parseFloat(a.ts) - parseFloat(b.ts)
        );
        
        // Filter out bot messages and the current message
        const filteredMessages = sortedThreadMessages
          .filter((msg: any) => !msg.bot_id && msg.ts !== current_ts);
          
        result.thread = filteredMessages.map((msg: any) => {
            const timestamp = new Date(
              parseFloat(msg.ts) * 1000
            ).toLocaleTimeString();
            let messageText = `[${timestamp}] ${msg.user}: ${msg.text || ''}`;
            
            // Add file information if present
            if (msg.files && msg.files.length > 0) {
              // Collect files using Map to deduplicate by ID
              msg.files.forEach((file: any) => {
                if (file.id && !fileMap.has(file.id)) {
                  fileMap.set(file.id, file);
                }
              });
              
              const fileInfo = msg.files.map((file: any) => 
                `[File: ${file.name || 'Untitled'} (${file.mimetype || 'unknown type'})]`
              ).join(', ');
              messageText += ` ${fileInfo}`;
            }
            
            return messageText;
          });
      }
      
      // Also fetch channel history for broader context
      const channelUrl = `https://slack.com/api/conversations.history?channel=${channel}&limit=${Math.floor(limit / 2)}`;
      const channelResponse = await fetch(channelUrl, {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      });
      
      const channelData: any = await channelResponse.json();
      console.log("Channel history response", channelData);
      
      if (channelData.ok && channelData.messages) {
        // Sort messages by timestamp (oldest first)
        const sortedChannelMessages = channelData.messages.sort(
          (a: any, b: any) => parseFloat(a.ts) - parseFloat(b.ts)
        );
        
        // Filter out bot messages and thread messages
        const filteredChannelMessages = sortedChannelMessages
          .filter((msg: any) => !msg.bot_id && !msg.thread_ts);
          
        result.channel = filteredChannelMessages.map((msg: any) => {
            const timestamp = new Date(
              parseFloat(msg.ts) * 1000
            ).toLocaleTimeString();
            let messageText = `[${timestamp}] ${msg.user}: ${msg.text || ''}`;
            
            // Add file information if present
            if (msg.files && msg.files.length > 0) {
              // Collect files using Map to deduplicate by ID
              msg.files.forEach((file: any) => {
                if (file.id && !fileMap.has(file.id)) {
                  fileMap.set(file.id, file);
                }
              });
              
              const fileInfo = msg.files.map((file: any) => 
                `[File: ${file.name || 'Untitled'} (${file.mimetype || 'unknown type'})]`
              ).join(', ');
              messageText += ` ${fileInfo}`;
            }
            
            return messageText;
          });
      }
    } else {
      // No thread, just fetch channel history
      const url = `https://slack.com/api/conversations.history?channel=${channel}&limit=${limit}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      });

      const data: any = await response.json();
      console.log("Channel history response", data);

      if (data.ok && data.messages) {
        // Sort messages by timestamp (oldest first)
        const sortedMessages = data.messages.sort(
          (a: any, b: any) => parseFloat(a.ts) - parseFloat(b.ts)
        );

        // Filter out bot messages and the current message
        const filteredMessages = sortedMessages
          .filter((msg: any) => !msg.bot_id && msg.ts !== current_ts);
          
        result.channel = filteredMessages.map((msg: any) => {
            const timestamp = new Date(
              parseFloat(msg.ts) * 1000
            ).toLocaleTimeString();
            let messageText = `[${timestamp}] ${msg.user}: ${msg.text || ''}`;
            
            // Add file information if present
            if (msg.files && msg.files.length > 0) {
              // Collect files using Map to deduplicate by ID
              msg.files.forEach((file: any) => {
                if (file.id && !fileMap.has(file.id)) {
                  fileMap.set(file.id, file);
                }
              });
              
              const fileInfo = msg.files.map((file: any) => 
                `[File: ${file.name || 'Untitled'} (${file.mimetype || 'unknown type'})]`
              ).join(', ');
              messageText += ` ${fileInfo}`;
            }
            
            return messageText;
          });
      }
    }

    // Convert Map back to array for the result
    result.files = Array.from(fileMap.values());
    
    return result;
  } catch (error) {
    console.error("Error fetching conversation history:", error);
    return { thread: [], channel: [], files: [] };
  }
}

async function addReaction(channel: string, timestamp: string, name: string) {
  try {
    const response = await fetch("https://slack.com/api/reactions.add", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        timestamp,
        name,
      }),
    });

    const data: any = await response.json();
    if (!data.ok) {
      console.error("Failed to add reaction:", data);
    } else {
      console.log("Reaction added successfully");
    }
  } catch (error) {
    console.error("Error adding reaction:", error);
  }
}

async function removeReaction(
  channel: string,
  timestamp: string,
  name: string
) {
  try {
    await fetch("https://slack.com/api/reactions.remove", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        timestamp,
        name,
      }),
    });
  } catch (error) {
    console.error("Error removing reaction:", error);
  }
}

async function postMessage(channel: string, text: string, thread_ts?: string) {
  try {
    const body: any = {
      channel,
      text,
    };

    if (thread_ts) {
      body.thread_ts = thread_ts;
    }

    console.log("Posting message to Slack:", body);

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data: any = await response.json();
    if (!data.ok) {
      console.error("Failed to post message:", data);
    } else {
      console.log("Message posted successfully");
    }
  } catch (error) {
    console.error("Error posting message:", error);
  }
}

// Process task asynchronously and send result back via response_url
async function processTaskAsync({
  text,
  user_id,
  channel_id,
  response_url,
}: {
  text: string;
  user_id: string;
  channel_id: string;
  response_url: string;
}) {
  try {
    const run = slackToNotionWorkflow.createRun();
    const result = await run.start({
      inputData: {
        text,
        user: user_id,
        channel: channel_id,
        timestamp: new Date().toISOString(),
        files: [], // Slash commands don't typically include files
      },
    });

    console.log("Workflow result:", JSON.stringify(result, null, 2));

    let message: string;
    if (result.status === "success") {
      // Check different possible result structures
      const workflowOutput =
        (result as any).result ||
        (result as any).output ||
        (result as any).data;

      if (workflowOutput?.success) {
        message = workflowOutput.taskUrl
          ? `✅ Task created successfully! View it here: ${workflowOutput.taskUrl}`
          : "✅ Task created successfully!";
      } else {
        message = `❌ Failed to create task: ${workflowOutput?.message || "Unknown error"}`;
      }
    } else {
      const failedResult = result as any;
      message = `❌ Failed to create task: ${failedResult.error?.message || "Unknown error"}`;
    }

    // Send the result back to Slack using the response URL
    await fetch(response_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        response_type: "ephemeral",
        text: message,
      }),
    });
  } catch (error: any) {
    console.error("Error processing task:", error);

    // Send error message back to Slack
    try {
      await fetch(response_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          response_type: "ephemeral",
          text: `❌ Error: ${error.message || "An error occurred while creating the task. Please try again."}`,
        }),
      });
    } catch (sendError) {
      console.error("Failed to send error response to Slack:", sendError);
    }
  }
}

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const OPTIONS = handler;
